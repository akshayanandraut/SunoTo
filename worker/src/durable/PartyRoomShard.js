import { HOST_INACTIVITY_TIMEOUT_SECONDS, MAX_ROOM_MEMBERS, DEFAULT_ROOM_MODE_ID, validRoomModeId } from "../policies/partyRoomPolicy.js";
import { SafetyService } from "../services/SafetyService.js";
import { RadioService } from "../services/RadioService.js";
import { signAnonymousToken } from "../auth/anonymousToken.js";

const RADIO_MEDIA_TOKEN_SECONDS = 900;

const HEARTBEAT_STALE_MS = HOST_INACTIVITY_TIMEOUT_SECONDS * 1000;
const RADIO_SKIP_THRESHOLD = 0.05;
const RADIO_REPLAY_THRESHOLD = 0.10;

function event(type, payload = {}) {
  return JSON.stringify({ type, payload, ts: Date.now() });
}

export class PartyRoomShard {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/listeners") {
      return Response.json({ count: this.state.getWebSockets().length });
    }

    if (request.method === "POST" && url.pathname === "/admin/set-host") {
      const body = await request.json();
      const room = (await this.state.storage.get("room")) || {};
      room.hostUserId = body.hostUserId || null;
      room.hostLastActiveAt = Date.now();
      await this.state.storage.put("room", room);
      this.broadcast(event("HOST_CHANGED", { hostUserId: room.hostUserId }));
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/admin/kick-account") {
      const body = await request.json().catch(() => ({}));
      for (const socket of this.state.getWebSockets()) {
        const attachment = socket.deserializeAttachment() || {};
        if (attachment.accountUserId && attachment.accountUserId === body.accountUserId) {
          try { socket.send(event("SESSION_REPLACED", { reason: "listening_elsewhere" })); } catch {}
          try { socket.close(4001, "replaced_by_new_session"); } catch {}
        }
      }
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/admin/close") {
      const body = await request.json().catch(() => ({}));
      this.broadcast(event("ROOM_CLOSED", { reason: body?.reason || "archived" }));
      for (const socket of this.state.getWebSockets()) try { socket.close(4000, "room_closed"); } catch {}
      return Response.json({ ok: true });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "websocket_upgrade_required" }, { status: 426 });
    }

    const participantId = url.searchParams.get("participantId");
    const accountUserId = url.searchParams.get("accountUserId") || null;
    const isHost = url.searchParams.get("isHost") === "1";
    const roomTypeHint = url.searchParams.get("roomType") || null;
    if (!participantId || !/^[a-zA-Z0-9_-]{8,100}$/.test(participantId)) {
      return Response.json({ error: "invalid_participant" }, { status: 400 });
    }

    const publicIdMatch = url.pathname.match(/\/party-rooms\/([0-9a-fA-F-]{36})\/socket$/);
    const storedRoom = await this.state.storage.get("room");
    const isFreshRoom = !storedRoom;
    const room = storedRoom || { hostUserId: isHost ? accountUserId : null, hostLastActiveAt: Date.now(), mode: roomTypeHint === "radio" ? "music" : DEFAULT_ROOM_MODE_ID, seatedParticipantIds: [], coHostAccountIds: [], preauthorizedAccountIds: [], bannedAccountIds: [] };
    room.seatedParticipantIds ??= []; room.coHostAccountIds ??= []; room.preauthorizedAccountIds ??= []; room.bannedAccountIds ??= [];
    if (accountUserId && room.bannedAccountIds.includes(accountUserId)) {
      return Response.json({ error: "banned_from_room" }, { status: 403 });
    }
    const seatedCount = room.seatedParticipantIds.length;
    const isPreauthorized = Boolean(accountUserId && room.preauthorizedAccountIds.includes(accountUserId));
    const wantsSeat = roomTypeHint === "radio" || isHost || isPreauthorized;
    if (wantsSeat && roomTypeHint !== "radio" && seatedCount >= MAX_ROOM_MEMBERS && !isHost) {
      return Response.json({ error: "room_full" }, { status: 409 });
    }
    const seated = roomTypeHint === "radio" || isHost || (isPreauthorized && seatedCount < MAX_ROOM_MEMBERS);
    const isCoHost = Boolean(accountUserId && room.coHostAccountIds.includes(accountUserId));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ participantId, accountUserId, isHost, isCoHost, seated, joinedAt: Date.now() });

    if (isHost) { room.hostUserId = accountUserId; room.hostLastActiveAt = Date.now(); }
    if (publicIdMatch) room.publicId = publicIdMatch[1];
    if (roomTypeHint) room.roomType = roomTypeHint;
    room.mode ??= room.roomType === "radio" ? "music" : DEFAULT_ROOM_MODE_ID;
    if (seated && !room.seatedParticipantIds.includes(participantId)) room.seatedParticipantIds.push(participantId);
    await this.state.storage.put("room", room);

    if (room.roomType === "radio" && accountUserId && this.env.LISTENER_REGISTRY) {
      const sessionToken = crypto.randomUUID();
      const channelSlug = room.publicId || publicIdMatch?.[1];
      server.serializeAttachment({ participantId, accountUserId, isHost, joinedAt: Date.now(), sessionToken });
      try {
        const registry = this.env.LISTENER_REGISTRY.get(this.env.LISTENER_REGISTRY.idFromName("global"));
        const claimResponse = await registry.fetch("https://listener-registry.internal/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountUserId, channelSlug, sessionToken }) });
        const { previous } = await claimResponse.json();
        if (previous && previous.sessionToken !== sessionToken) {
          if (previous.channelSlug === channelSlug) {
            for (const socket of this.state.getWebSockets()) {
              if (socket === server) continue;
              const attachment = socket.deserializeAttachment() || {};
              if (attachment.accountUserId === accountUserId) {
                try { socket.send(event("SESSION_REPLACED", { reason: "listening_elsewhere" })); } catch {}
                try { socket.close(4001, "replaced_by_new_session"); } catch {}
              }
            }
          } else if (previous.channelSlug) {
            const otherChannel = this.env.PARTY_ROOM.get(this.env.PARTY_ROOM.idFromName(previous.channelSlug));
            await otherChannel.fetch("https://party-room.internal/admin/kick-account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountUserId }) }).catch(() => {});
          }
        }
      } catch {}
    }

    if (isFreshRoom && room.roomType === "radio" && room.mode === "music" && !room.currentTrack) {
      await this.advanceRadioTrack(room);
    }

    const currentTrack = room.currentTrack ? { title: room.currentTrack.title, artistName: room.currentTrack.artistName, durationSeconds: room.currentTrack.durationSeconds, elapsedSeconds: Math.max(0, Math.round(room.currentTrack.durationSeconds - (room.currentTrackEndsAt - Date.now()) / 1000)), listenerMessage: room.currentTrack.listenerMessage || null, mediaUrl: await this.mediaUrl(room.currentTrack.storageKey), artworkUrl: await this.mediaUrl(room.currentTrack.artworkKey) } : null;
    server.send(event("READY", { participantId, hostUserId: room.hostUserId, mode: room.mode, seated, isCoHost, seatLimit: MAX_ROOM_MEMBERS, seatedCount: room.seatedParticipantIds.length, members: this.memberList(), currentTrack }));
    this.broadcast(event("MEMBER_JOINED", { participantId, isHost, isCoHost, seated }), server);
    await this.scheduleAlarm(room);

    return new Response(null, { status: 101, webSocket: client });
  }

  memberList() {
    return this.state.getWebSockets().map(socket => {
      const attachment = socket.deserializeAttachment() || {};
      return { participantId: attachment.participantId, isHost: attachment.isHost, isCoHost: Boolean(attachment.isCoHost), seated: Boolean(attachment.seated) };
    });
  }

  socketFor(participantId) {
    return this.state.getWebSockets().find(socket => (socket.deserializeAttachment() || {}).participantId === participantId) || null;
  }

  canModerate(attachment) {
    return Boolean(attachment.isHost || attachment.isCoHost);
  }

  async isPremiumAccount(accountUserId) {
    if (!accountUserId) return false;
    try {
      const response = await (this.env.FETCHER || fetch)(`${this.env.SUPABASE_URL}/rest/v1/profiles?select=is_premium&user_id=eq.${encodeURIComponent(accountUserId)}&limit=1`, { headers: { apikey: this.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}` } });
      const [row] = await response.json().catch(() => []);
      return Boolean(row?.is_premium);
    } catch { return false; }
  }

  async webSocketMessage(socket, raw) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    const attachment = socket.deserializeAttachment() || {};
    const { type, payload = {} } = parsed;

    // Ephemeral only: room chat/signaling/metadata are relayed, never persisted.
    if (type === "ROOM_MESSAGE" && attachment.seated && typeof payload.text === "string" && payload.text.length <= 1000) {
      this.broadcast(event("ROOM_MESSAGE", { from: attachment.participantId, text: payload.text }), socket);
      return;
    }
    if (type === "HOST_HEARTBEAT" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      room.hostLastActiveAt = Date.now();
      await this.state.storage.put("room", room);
      return;
    }
    if (type === "MODE_CHANGE" && attachment.isHost && validRoomModeId(payload.mode)) {
      const room = (await this.state.storage.get("room")) || {};
      room.mode = payload.mode;
      await this.state.storage.put("room", room);
      this.broadcast(event("ROOM_MODE_CHANGED", { mode: room.mode, by: attachment.participantId }));
      if (payload.mode === "music" && !room.currentTrack) await this.advanceRadioTrack(room);
      return;
    }
    if (type === "RADIO_SKIP_VOTE" || type === "RADIO_REPLAY_VOTE") {
      const room = (await this.state.storage.get("room")) || {};
      if (!room.currentTrack) return;
      const field = type === "RADIO_SKIP_VOTE" ? "skipVotes" : "replayVotes";
      const votes = new Set(room[field] || []);
      votes.add(attachment.participantId);
      room[field] = [...votes];
      await this.state.storage.put("room", room);
      const totalMembers = Math.max(1, this.state.getWebSockets().length);
      this.broadcast(event("RADIO_VOTE_UPDATE", { skipVotes: (room.skipVotes || []).length, replayVotes: (room.replayVotes || []).length, totalMembers }));
      if (field === "skipVotes" && votes.size / totalMembers >= RADIO_SKIP_THRESHOLD) {
        await this.advanceRadioTrack(room);
      } else if (field === "replayVotes" && votes.size / totalMembers >= RADIO_REPLAY_THRESHOLD) {
        room.replayVotes = [];
        room.currentTrackEndsAt = Date.now() + (room.currentTrack.durationSeconds * 1000);
        await this.state.storage.put("room", room);
        this.broadcast(event("RADIO_TRACK_REPLAY", { track: { title: room.currentTrack.title, artistName: room.currentTrack.artistName, durationSeconds: room.currentTrack.durationSeconds, elapsedSeconds: 0, listenerMessage: room.currentTrack.listenerMessage || null, mediaUrl: await this.mediaUrl(room.currentTrack.storageKey), artworkUrl: await this.mediaUrl(room.currentTrack.artworkKey) } }));
        await this.scheduleAlarm(room);
      }
      return;
    }
    if (type === "PLAYBACK_SYNC" && attachment.isHost) {
      this.broadcast(event("PLAYBACK_SYNC", payload), socket);
      return;
    }
    if (type === "RADIO_REACTION" && attachment.seated && ["like", "heart", "fire", "clap"].includes(payload.reaction)) {
      this.broadcast(event("RADIO_REACTION", { reaction: payload.reaction }), socket);
      return;
    }
    if (type === "REPORT" && typeof payload.targetParticipantId === "string") {
      const room = (await this.state.storage.get("room")) || {};
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      const reason = typeof payload.reason === "string" ? payload.reason.slice(0, 200) : "other";
      try {
        await new SafetyService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch })
          .report(roomRef, attachment.participantId, payload.targetParticipantId, reason);
        socket.send(event("REPORT_ACCEPTED", { message: "Thanks. Your report was received." }));
      } catch {
        socket.send(event("MESSAGE_REJECTED", { code: "report_failed" }));
      }
      return;
    }
    if (type === "SEAT_REQUEST" && !attachment.seated) {
      for (const peer of this.state.getWebSockets()) {
        const peerAttachment = peer.deserializeAttachment() || {};
        if (this.canModerate(peerAttachment)) peer.send(event("SEAT_REQUESTED", { participantId: attachment.participantId }));
      }
      return;
    }
    if (type === "SEAT_APPROVE" && this.canModerate(attachment) && typeof payload.targetParticipantId === "string") {
      const target = this.socketFor(payload.targetParticipantId);
      if (!target) return;
      const room = (await this.state.storage.get("room")) || {};
      room.seatedParticipantIds ??= [];
      if (room.seatedParticipantIds.length >= MAX_ROOM_MEMBERS) { socket.send(event("MESSAGE_REJECTED", { code: "room_full" })); return; }
      if (!room.seatedParticipantIds.includes(payload.targetParticipantId)) room.seatedParticipantIds.push(payload.targetParticipantId);
      await this.state.storage.put("room", room);
      const targetAttachment = target.deserializeAttachment() || {};
      target.serializeAttachment({ ...targetAttachment, seated: true });
      target.send(event("SEAT_GRANTED", {}));
      this.broadcast(event("MEMBER_SEATED", { participantId: payload.targetParticipantId }));
      return;
    }
    if (type === "SEAT_DENY" && this.canModerate(attachment) && typeof payload.targetParticipantId === "string") {
      const target = this.socketFor(payload.targetParticipantId);
      if (target) target.send(event("SEAT_DENIED", {}));
      return;
    }
    if (type === "SEAT_REVOKE" && this.canModerate(attachment) && typeof payload.targetParticipantId === "string") {
      const target = this.socketFor(payload.targetParticipantId);
      const room = (await this.state.storage.get("room")) || {};
      room.seatedParticipantIds = (room.seatedParticipantIds || []).filter(id => id !== payload.targetParticipantId);
      await this.state.storage.put("room", room);
      if (target) { const targetAttachment = target.deserializeAttachment() || {}; target.serializeAttachment({ ...targetAttachment, seated: false }); target.send(event("SEAT_REVOKED", {})); }
      this.broadcast(event("MEMBER_UNSEATED", { participantId: payload.targetParticipantId }));
      return;
    }
    if (type === "BAN_PARTICIPANT" && this.canModerate(attachment) && typeof payload.targetParticipantId === "string") {
      const target = this.socketFor(payload.targetParticipantId);
      if (!target) return;
      const targetAttachment = target.deserializeAttachment() || {};
      if (targetAttachment.isHost) return;
      const room = (await this.state.storage.get("room")) || {};
      room.bannedAccountIds ??= [];
      room.seatedParticipantIds = (room.seatedParticipantIds || []).filter(id => id !== payload.targetParticipantId);
      if (targetAttachment.accountUserId && !room.bannedAccountIds.includes(targetAttachment.accountUserId)) room.bannedAccountIds.push(targetAttachment.accountUserId);
      await this.state.storage.put("room", room);
      try { target.send(event("BANNED", {})); } catch {}
      try { target.close(4003, "banned"); } catch {}
      this.broadcast(event("MEMBER_BANNED", { participantId: payload.targetParticipantId }));
      return;
    }
    if (type === "APPOINT_COHOST" && attachment.isHost && typeof payload.targetParticipantId === "string") {
      const target = this.socketFor(payload.targetParticipantId);
      if (!target) return;
      const targetAttachment = target.deserializeAttachment() || {};
      if (!await this.isPremiumAccount(targetAttachment.accountUserId)) { socket.send(event("MESSAGE_REJECTED", { code: "cohost_requires_premium" })); return; }
      const room = (await this.state.storage.get("room")) || {};
      room.coHostAccountIds ??= [];
      if (!room.coHostAccountIds.includes(targetAttachment.accountUserId)) room.coHostAccountIds.push(targetAttachment.accountUserId);
      await this.state.storage.put("room", room);
      target.serializeAttachment({ ...targetAttachment, isCoHost: true });
      target.send(event("COHOST_APPOINTED", {}));
      this.broadcast(event("MEMBER_COHOST_CHANGED", { participantId: payload.targetParticipantId, isCoHost: true }));
      return;
    }
    if (type === "REVOKE_COHOST" && attachment.isHost && typeof payload.targetParticipantId === "string") {
      const target = this.socketFor(payload.targetParticipantId);
      const room = (await this.state.storage.get("room")) || {};
      if (target) { const targetAttachment = target.deserializeAttachment() || {}; room.coHostAccountIds = (room.coHostAccountIds || []).filter(id => id !== targetAttachment.accountUserId); target.serializeAttachment({ ...targetAttachment, isCoHost: false }); target.send(event("COHOST_REVOKED", {})); }
      await this.state.storage.put("room", room);
      this.broadcast(event("MEMBER_COHOST_CHANGED", { participantId: payload.targetParticipantId, isCoHost: false }));
      return;
    }
    if (type === "PREAUTHORIZE_SEAT" && attachment.isHost && typeof payload.targetAccountUserId === "string") {
      if (!await this.isPremiumAccount(payload.targetAccountUserId)) { socket.send(event("MESSAGE_REJECTED", { code: "preauthorize_requires_premium" })); return; }
      const room = (await this.state.storage.get("room")) || {};
      room.preauthorizedAccountIds ??= [];
      if (!room.preauthorizedAccountIds.includes(payload.targetAccountUserId)) room.preauthorizedAccountIds.push(payload.targetAccountUserId);
      await this.state.storage.put("room", room);
      socket.send(event("PREAUTHORIZE_ACCEPTED", { targetAccountUserId: payload.targetAccountUserId }));
      return;
    }
    if (["AUDIO_OFFER", "AUDIO_ANSWER", "AUDIO_ICE_CANDIDATE", "VIDEO_OFFER", "VIDEO_ANSWER", "VIDEO_ICE_CANDIDATE"].includes(type)) {
      if (!attachment.seated) return;
      const targetId = payload.targetParticipantId;
      for (const peer of this.state.getWebSockets()) {
        if (peer === socket) continue;
        const peerAttachment = peer.deserializeAttachment() || {};
        if (targetId && peerAttachment.participantId !== targetId) continue;
        peer.send(event(type, { ...payload, fromParticipantId: attachment.participantId }));
      }
      return;
    }
  }

  broadcast(payload, exclude) {
    for (const socket of this.state.getWebSockets()) if (socket !== exclude) try { socket.send(payload); } catch {}
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment() || {};
    if (attachment.seated && !attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      room.seatedParticipantIds = (room.seatedParticipantIds || []).filter(id => id !== attachment.participantId);
      await this.state.storage.put("room", room);
    }
    this.broadcast(event("MEMBER_LEFT", { participantId: attachment.participantId }));
  }

  webSocketError(socket) { return this.webSocketClose(socket); }

  radioService() {
    return new RadioService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
  }

  async mediaUrl(key) {
    if (!key) return null;
    if (!this.env.ANON_SESSION_SECRET) return `${this.env.RADIO_MEDIA_BASE_URL || "http://127.0.0.1:8787"}/api/v1/radio-media/${key}`;
    const token = await signAnonymousToken({ v: 1, sub: key, kind: "radio-media", exp: Math.floor(Date.now() / 1000) + RADIO_MEDIA_TOKEN_SECONDS }, this.env.ANON_SESSION_SECRET);
    return `${this.env.RADIO_MEDIA_BASE_URL || "http://127.0.0.1:8787"}/api/v1/radio-media/${key}?t=${token}`;
  }

  async advanceRadioTrack(room) {
    const previous = room.currentTrack;
    if (previous) {
      try { await this.radioService().completeTrack(previous.id); } catch {}
      if (!room.curatedOnly) {
        try { await this.env.RADIO_BUCKET.delete(previous.storageKey); } catch {}
        if (previous.artworkKey) try { await this.env.RADIO_BUCKET.delete(previous.artworkKey); } catch {}
      }
    }
    room.skipVotes = [];
    room.replayVotes = [];
    let next = null;
    if (room.publicId) try { next = await this.radioService().nextTrack(room.publicId); } catch {}
    if (next) {
      room.curatedOnly = Boolean(next.curated_only);
      room.currentTrack = { id: next.id, title: next.title, artistName: next.artist_name, storageKey: next.storage_key, artworkKey: next.artwork_key, durationSeconds: next.duration_seconds, listenerMessage: next.listener_message || null };
      room.currentTrackEndsAt = Date.now() + next.duration_seconds * 1000;
      this.broadcast(event("RADIO_TRACK_CHANGED", { track: { title: next.title, artistName: next.artist_name, durationSeconds: next.duration_seconds, elapsedSeconds: 0, listenerMessage: next.listener_message || null, mediaUrl: await this.mediaUrl(next.storage_key), artworkUrl: await this.mediaUrl(next.artwork_key) } }));
    } else {
      room.currentTrack = null;
      room.currentTrackEndsAt = null;
      this.broadcast(event("RADIO_QUEUE_EMPTY", {}));
    }
    await this.state.storage.put("room", room);
    await this.scheduleAlarm(room);
    return room;
  }

  async scheduleAlarm(room) {
    const now = Date.now();
    const candidates = [now + HEARTBEAT_STALE_MS];
    if (room.currentTrackEndsAt) candidates.push(room.currentTrackEndsAt);
    if (this.state.getWebSockets().length) await this.state.storage.setAlarm(Math.min(...candidates));
  }

  async alarm() {
    const room = (await this.state.storage.get("room")) || {};
    const now = Date.now();
    if (room.hostUserId && room.hostLastActiveAt && now - room.hostLastActiveAt >= HEARTBEAT_STALE_MS) {
      this.broadcast(event("HOST_INACTIVE", { hostUserId: room.hostUserId }));
    }
    if (room.currentTrackEndsAt && now >= room.currentTrackEndsAt) {
      await this.advanceRadioTrack(room);
      return;
    }
    if (this.state.getWebSockets().length) await this.state.storage.setAlarm(now + HEARTBEAT_STALE_MS);
  }
}
