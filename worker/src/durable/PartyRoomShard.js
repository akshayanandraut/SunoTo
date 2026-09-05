import { HOST_INACTIVITY_TIMEOUT_SECONDS, MAX_ROOM_MEMBERS, DEFAULT_ROOM_MODE_ID, validRoomModeId, DRAW_GUESS_CHOOSE_SECONDS, DRAW_GUESS_ROUND_SECONDS, SNAKE_LADDER_TURN_SECONDS, RUMMY_TURN_SECONDS, LUDO_TURN_SECONDS, TEEN_PATTI_TURN_SECONDS, ANDAR_BAHAR_BETTING_SECONDS, DRAGON_TIGER_BETTING_SECONDS, BIDDING_ROUND_SECONDS, TUG_OF_WAR_QUESTION_SECONDS, TUG_OF_WAR_TARGET_SCORE, ELIMINATION_REFLEX_MIN_PLAYERS, ELIMINATION_REFLEX_MAX_PLAYERS, ELIMINATION_REFLEX_ARM_MIN_MS, ELIMINATION_REFLEX_ARM_MAX_MS, ELIMINATION_REFLEX_TAP_WINDOW_SECONDS, PREDICTION_POOL_ROUND_SECONDS, PREDICTION_POOL_DEFAULT_RANGE_MAX, CHARADES_CHOOSE_SECONDS, CHARADES_ROUND_SECONDS, CONNECT_FOUR_TURN_SECONDS, CONNECT_FOUR_ROWS, CONNECT_FOUR_COLS } from "../policies/partyRoomPolicy.js";
import { randomTugOfWarQuestion, TUG_OF_WAR_QUESTIONS as TUG_OF_WAR_QUESTIONS_REF } from "../policies/tugOfWarQuestions.js";
import { DRAW_GUESS_WORDS } from "../policies/drawGuessWords.js";
import { SNAKE_LADDER_TILES, SNAKE_LADDER_MIN_PLAYERS, SNAKE_LADDER_MAX_PLAYERS, SNAKE_LADDER_BOARD_SIZE } from "../policies/snakeLadderBoard.js";
import { RUMMY_MIN_PLAYERS, RUMMY_MAX_PLAYERS, RUMMY_HAND_SIZE, dealRummy, validateDeclaration } from "../policies/rummyEngine.js";
import { LUDO_MIN_PLAYERS, LUDO_MAX_PLAYERS, LUDO_MAX_CONSECUTIVE_SIXES, movableTokenIndexes, applyLudoMove } from "../policies/ludoEngine.js";
import { TEEN_PATTI_MIN_PLAYERS, TEEN_PATTI_MAX_PLAYERS, dealTeenPatti, compareHands } from "../policies/teenPattiEngine.js";
import { ANDAR_BAHAR_MAX_PLAYERS, buildDeck as buildAndarBaharDeck, dealAndarBahar } from "../policies/andarBaharEngine.js";
import { buildDeck as buildDragonTigerDeck, dealDragonTiger } from "../policies/dragonTigerEngine.js";
import { SafetyService } from "../services/SafetyService.js";
import { RadioService } from "../services/RadioService.js";
import { GamesService } from "../services/GamesService.js";
import { ConfigService } from "../services/ConfigService.js";
import { signAnonymousToken } from "../auth/anonymousToken.js";

const RADIO_MEDIA_TOKEN_SECONDS = 900;

const HEARTBEAT_STALE_MS = HOST_INACTIVITY_TIMEOUT_SECONDS * 1000;
const RADIO_SKIP_THRESHOLD = 0.05;
const RADIO_REPLAY_THRESHOLD = 0.10;
const MAX_GUESS_LENGTH = 40;

function normalizeGuess(text) {
  return String(text || "").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
}

function shuffled(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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
    const game = room.mode === "game" && room.game ? { status: room.game.status, drawerParticipantId: room.game.drawerParticipantId, wordLength: room.game.wordLength, phaseEndsAt: room.game.phaseEndsAt, scores: room.game.scores, roundsPlayed: room.game.roundsPlayed, totalRounds: room.game.totalRounds } : null;
    const snakeLadder = room.mode === "snake_ladder" && room.game ? { status: room.game.status, turnOrder: room.game.turnOrder, turnIndex: room.game.turnIndex, positions: room.game.positions, forfeited: room.game.forfeited, stakeCredits: room.game.stakeCredits, pot: room.game.pot, lastRoll: room.game.lastRoll, phaseEndsAt: room.game.phaseEndsAt } : null;
    const rummy = room.mode === "rummy" && room.game ? this.publicRummyState(room) : null;
    const ludo = room.mode === "ludo" && room.game ? this.publicLudoState(room) : null;
    const teenPatti = room.mode === "teen_patti" && room.game ? this.publicTeenPattiState(room) : null;
    const andarBahar = room.mode === "andar_bahar" && room.game ? this.publicAndarBaharState(room, participantId) : null;
    const dragonTiger = room.mode === "dragon_tiger" && room.game ? this.publicDragonTigerState(room, participantId) : null;
    const bidding = room.mode === "bidding" && room.game ? this.publicBiddingState(room, participantId) : null;
    const tugOfWar = room.mode === "tug_of_war" && room.game ? this.publicTugOfWarState(room, participantId) : null;
    const connectFour = room.mode === "connect_four" && room.game ? this.publicConnectFourState(room) : null;
    const eliminationReflex = room.mode === "elimination_reflex" && room.game ? this.publicEliminationReflexState(room, participantId) : null;
    const predictionPool = room.mode === "prediction_pool" && room.game ? this.publicPredictionPoolState(room, participantId) : null;
    const charades = room.mode === "charades" && room.game ? { status: room.game.status, performerParticipantId: room.game.performerParticipantId, wordLength: room.game.wordLength, phaseEndsAt: room.game.phaseEndsAt, scores: room.game.scores, roundsPlayed: room.game.roundsPlayed, totalRounds: room.game.totalRounds } : null;
    server.send(event("READY", { participantId, hostUserId: room.hostUserId, mode: room.mode, seated, isCoHost, seatLimit: MAX_ROOM_MEMBERS, seatedCount: room.seatedParticipantIds.length, members: this.memberList(), currentTrack, game, snakeLadder, rummy, ludo, teenPatti, andarBahar, dragonTiger, bidding, tugOfWar, eliminationReflex, predictionPool, charades, connectFour }));
    if (room.mode === "rummy" && room.game?.status === "playing" && room.game.hands[participantId] && !room.game.forfeited.includes(participantId)) {
      this.sendRummyHand(room, participantId);
    }
    if (room.mode === "teen_patti" && room.game?.status === "playing" && room.game.hands[participantId] && !room.game.folded.includes(participantId)) {
      this.sendTeenPattiHand(room, participantId);
    }
    if (room.game?.status === "drawing" && (this.gameStrokes || []).length) {
      for (const stroke of this.gameStrokes) try { server.send(event("GAME_STROKE", { stroke })); } catch {}
    }
    if (room.mode === "game" && room.game?.status === "choosing" && room.game.drawerParticipantId === participantId) this.sendYourTurn(room);
    if (room.mode === "charades" && room.game?.status === "choosing" && room.game.performerParticipantId === participantId) this.sendCharadesYourTurn(room);
    this.broadcast(event("MEMBER_JOINED", { participantId, isHost, isCoHost, seated }), server);
    await this.scheduleAlarm(room);

    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": "party-room.v1" } });
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
      if (room.mode !== payload.mode && room.game && room.game.status !== "game_over" && room.game.status !== "idle") {
        if (room.mode === "snake_ladder" && room.game.pot > 0) {
          this.broadcast(event("MESSAGE_REJECTED", { code: "snake_ladder_round_in_progress" }));
          return;
        }
        if (room.mode === "rummy" && room.game.pot > 0) {
          this.broadcast(event("MESSAGE_REJECTED", { code: "rummy_round_in_progress" }));
          return;
        }
        if (room.mode === "ludo" && room.game.pot > 0) {
          this.broadcast(event("MESSAGE_REJECTED", { code: "ludo_round_in_progress" }));
          return;
        }
        if (room.mode === "teen_patti" && room.game.pot > 0) {
          this.broadcast(event("MESSAGE_REJECTED", { code: "teen_patti_round_in_progress" }));
          return;
        }
        if (room.mode === "andar_bahar" && room.game.status === "betting") {
          this.broadcast(event("MESSAGE_REJECTED", { code: "andar_bahar_round_in_progress" }));
          return;
        }
        if (room.mode === "dragon_tiger" && room.game.status === "betting") {
          this.broadcast(event("MESSAGE_REJECTED", { code: "dragon_tiger_round_in_progress" }));
          return;
        }
        if (room.mode === "bidding" && room.game.status === "bidding") {
          this.broadcast(event("MESSAGE_REJECTED", { code: "bidding_round_in_progress" }));
          return;
        }
        if (room.mode === "tug_of_war" && room.game.status === "playing") {
          this.broadcast(event("MESSAGE_REJECTED", { code: "tug_of_war_round_in_progress" }));
          return;
        }
        if (room.mode === "elimination_reflex" && (room.game.status === "waiting_round" || room.game.status === "armed")) {
          this.broadcast(event("MESSAGE_REJECTED", { code: "elimination_reflex_round_in_progress" }));
          return;
        }
        if (room.mode === "prediction_pool" && room.game.status === "guessing") {
          this.broadcast(event("MESSAGE_REJECTED", { code: "prediction_pool_round_in_progress" }));
          return;
        }
        if (room.mode === "connect_four" && room.game.status === "playing") {
          this.broadcast(event("MESSAGE_REJECTED", { code: "connect_four_round_in_progress" }));
          return;
        }
        room.game = null;
      }
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
      this.broadcast(event("RADIO_REACTION", { reaction: payload.reaction, participantId: attachment.participantId }), socket);
      return;
    }

    if (type === "GAME_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "game") return;
      const connectedIds = new Set(this.state.getWebSockets().map(s => (s.deserializeAttachment() || {}).participantId).filter(Boolean));
      const turnOrder = shuffled((room.seatedParticipantIds || []).filter(id => connectedIds.has(id)));
      if (turnOrder.length < 2) { socket.send(event("MESSAGE_REJECTED", { code: "draw_guess_needs_two_players" })); return; }
      room.game = { status: "choosing", turnOrder, turnIndex: 0, drawerParticipantId: turnOrder[0], word: null, wordLength: 0, choices: this.pickWordChoices(), phaseEndsAt: Date.now() + DRAW_GUESS_CHOOSE_SECONDS * 1000, correctGuessers: [], scores: Object.fromEntries(turnOrder.map(id => [id, 0])), roundsPlayed: 0, totalRounds: turnOrder.length };
      this.gameStrokes = [];
      await this.state.storage.put("room", room);
      this.broadcastGameState(room);
      this.sendYourTurn(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "WORD_CHOICE" && typeof payload.word === "string") {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "game" || !room.game || room.game.status !== "choosing") return;
      if (attachment.participantId !== room.game.drawerParticipantId) return;
      if (!room.game.choices.includes(payload.word)) return;
      await this.beginDrawingPhase(room, payload.word);
      return;
    }

    if (type === "DRAW_STROKE" && payload.stroke) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "game" || !room.game || room.game.status !== "drawing") return;
      if (attachment.participantId !== room.game.drawerParticipantId) return;
      this.gameStrokes ??= [];
      if (this.gameStrokes.length < 4000) this.gameStrokes.push(payload.stroke);
      this.broadcast(event("GAME_STROKE", { stroke: payload.stroke }), socket);
      return;
    }

    if (type === "GAME_CLEAR_CANVAS") {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "game" || !room.game || room.game.status !== "drawing") return;
      if (attachment.participantId !== room.game.drawerParticipantId) return;
      this.gameStrokes = [];
      this.broadcast(event("GAME_CLEAR_CANVAS", {}), socket);
      return;
    }

    if (type === "GAME_GUESS" && typeof payload.text === "string" && payload.text.length && payload.text.length <= MAX_GUESS_LENGTH) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "game" || !room.game || room.game.status !== "drawing") return;
      if (attachment.participantId === room.game.drawerParticipantId) return;
      if ((room.game.correctGuessers || []).includes(attachment.participantId)) return;
      const guess = normalizeGuess(payload.text);
      const answer = normalizeGuess(room.game.word);
      if (guess && answer && guess === answer) {
        const elapsedMs = DRAW_GUESS_ROUND_SECONDS * 1000 - Math.max(0, room.game.phaseEndsAt - Date.now());
        const points = Math.max(10, 100 - Math.floor(elapsedMs / 1000));
        room.game.correctGuessers = [...(room.game.correctGuessers || []), attachment.participantId];
        room.game.scores[attachment.participantId] = (room.game.scores[attachment.participantId] || 0) + points;
        room.game.scores[room.game.drawerParticipantId] = (room.game.scores[room.game.drawerParticipantId] || 0) + 20;
        await this.state.storage.put("room", room);
        this.broadcast(event("GAME_CORRECT_GUESS", { participantId: attachment.participantId, points, scores: room.game.scores }));
        const nonDrawerCount = room.game.turnOrder.filter(id => id !== room.game.drawerParticipantId).length;
        if (room.game.correctGuessers.length >= nonDrawerCount) await this.endDrawRound(room);
      } else {
        this.broadcast(event("GAME_GUESS_MESSAGE", { participantId: attachment.participantId, text: payload.text }));
      }
      return;
    }
    if (type === "CHARADES_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "charades") return;
      const connectedIds = new Set(this.state.getWebSockets().map(s => (s.deserializeAttachment() || {}).participantId).filter(Boolean));
      const turnOrder = shuffled((room.seatedParticipantIds || []).filter(id => connectedIds.has(id)));
      if (turnOrder.length < 2) { socket.send(event("MESSAGE_REJECTED", { code: "charades_needs_two_players" })); return; }
      room.game = { status: "choosing", turnOrder, turnIndex: 0, performerParticipantId: turnOrder[0], word: null, wordLength: 0, choices: this.pickWordChoices(), phaseEndsAt: Date.now() + CHARADES_CHOOSE_SECONDS * 1000, correctGuessers: [], scores: Object.fromEntries(turnOrder.map(id => [id, 0])), roundsPlayed: 0, totalRounds: turnOrder.length };
      await this.state.storage.put("room", room);
      this.broadcastCharadesState(room);
      this.sendCharadesYourTurn(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "CHARADES_WORD_CHOICE" && typeof payload.word === "string") {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "charades" || !room.game || room.game.status !== "choosing") return;
      if (attachment.participantId !== room.game.performerParticipantId) return;
      if (!room.game.choices.includes(payload.word)) return;
      await this.beginCluePhase(room, payload.word);
      return;
    }

    if (type === "CHARADES_CLUE" && typeof payload.text === "string" && payload.text.length && payload.text.length <= MAX_GUESS_LENGTH) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "charades" || !room.game || room.game.status !== "describing") return;
      if (attachment.participantId !== room.game.performerParticipantId) return;
      const answer = normalizeGuess(room.game.word);
      if (answer && normalizeGuess(payload.text).includes(answer)) { socket.send(event("MESSAGE_REJECTED", { code: "charades_clue_contains_word" })); return; }
      this.broadcast(event("CHARADES_CLUE_MESSAGE", { text: payload.text }));
      return;
    }

    if (type === "CHARADES_GUESS" && typeof payload.text === "string" && payload.text.length && payload.text.length <= MAX_GUESS_LENGTH) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "charades" || !room.game || room.game.status !== "describing") return;
      if (attachment.participantId === room.game.performerParticipantId) return;
      if ((room.game.correctGuessers || []).includes(attachment.participantId)) return;
      const guess = normalizeGuess(payload.text);
      const answer = normalizeGuess(room.game.word);
      if (guess && answer && guess === answer) {
        const elapsedMs = CHARADES_ROUND_SECONDS * 1000 - Math.max(0, room.game.phaseEndsAt - Date.now());
        const points = Math.max(10, 100 - Math.floor(elapsedMs / 1000));
        room.game.correctGuessers = [...(room.game.correctGuessers || []), attachment.participantId];
        room.game.scores[attachment.participantId] = (room.game.scores[attachment.participantId] || 0) + points;
        room.game.scores[room.game.performerParticipantId] = (room.game.scores[room.game.performerParticipantId] || 0) + 20;
        await this.state.storage.put("room", room);
        this.broadcast(event("CHARADES_CORRECT_GUESS", { participantId: attachment.participantId, points, scores: room.game.scores }));
        const nonPerformerCount = room.game.turnOrder.filter(id => id !== room.game.performerParticipantId).length;
        if (room.game.correctGuessers.length >= nonPerformerCount) await this.endCharadesRound(room);
      } else {
        this.broadcast(event("CHARADES_GUESS_MESSAGE", { participantId: attachment.participantId, text: payload.text }));
      }
      return;
    }

    if (type === "SNAKE_LADDER_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "snake_ladder") return;
      const stakeCredits = Number.isSafeInteger(payload.stakeCredits) && payload.stakeCredits > 0 ? payload.stakeCredits : 0;
      const bySocket = new Map(this.state.getWebSockets().map(s => [(s.deserializeAttachment() || {}).participantId, s.deserializeAttachment() || {}]));
      const turnOrder = shuffled((room.seatedParticipantIds || []).filter(id => bySocket.has(id))).slice(0, SNAKE_LADDER_MAX_PLAYERS);
      if (turnOrder.length < SNAKE_LADDER_MIN_PLAYERS) { socket.send(event("MESSAGE_REJECTED", { code: "snake_ladder_needs_two_players" })); return; }
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      if (stakeCredits > 0) {
        let flags;
        try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
        if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
        if (turnOrder.some(id => !bySocket.get(id).accountUserId)) { socket.send(event("MESSAGE_REJECTED", { code: "snake_ladder_stake_requires_account" })); return; }
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        const gameId = crypto.randomUUID();
        const staked = [];
        try {
          for (const id of turnOrder) {
            await gamesService.stakeSnakeLadder(bySocket.get(id).accountUserId, stakeCredits, roomRef, `sl:${gameId}:${id}:stake`);
            staked.push(id);
          }
        } catch {
          for (const id of staked) {
            try { await gamesService.refundSnakeLadderStake(bySocket.get(id).accountUserId, stakeCredits, roomRef, `sl:${gameId}:${id}:refund`); } catch {}
          }
          socket.send(event("MESSAGE_REJECTED", { code: "snake_ladder_stake_failed" }));
          return;
        }
        room.game = { gameId, status: "playing", turnOrder, turnIndex: 0, positions: Object.fromEntries(turnOrder.map(id => [id, 0])), forfeited: [], stakeCredits, pot: stakeCredits * turnOrder.length, accountByParticipant: Object.fromEntries(turnOrder.map(id => [id, bySocket.get(id).accountUserId])), lastRoll: null, phaseEndsAt: Date.now() + SNAKE_LADDER_TURN_SECONDS * 1000 };
      } else {
        room.game = { gameId: crypto.randomUUID(), status: "playing", turnOrder, turnIndex: 0, positions: Object.fromEntries(turnOrder.map(id => [id, 0])), forfeited: [], stakeCredits: 0, pot: 0, accountByParticipant: {}, lastRoll: null, phaseEndsAt: Date.now() + SNAKE_LADDER_TURN_SECONDS * 1000 };
      }
      await this.state.storage.put("room", room);
      this.broadcastSnakeLadderState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "SNAKE_LADDER_ROLL") {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "snake_ladder" || !room.game || room.game.status !== "playing") return;
      if (room.game.turnOrder[room.game.turnIndex] !== attachment.participantId) return;
      await this.rollSnakeLadder(room);
      return;
    }

    if (type === "RUMMY_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "rummy") return;
      const stakeCredits = Number.isSafeInteger(payload.stakeCredits) && payload.stakeCredits > 0 ? payload.stakeCredits : 0;
      const bySocket = new Map(this.state.getWebSockets().map(s => [(s.deserializeAttachment() || {}).participantId, s.deserializeAttachment() || {}]));
      const turnOrder = shuffled((room.seatedParticipantIds || []).filter(id => bySocket.has(id))).slice(0, RUMMY_MAX_PLAYERS);
      if (turnOrder.length < RUMMY_MIN_PLAYERS) { socket.send(event("MESSAGE_REJECTED", { code: "rummy_needs_two_players" })); return; }
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      let accountByParticipant = {}, pot = 0;
      if (stakeCredits > 0) {
        let flags;
        try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
        if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
        if (turnOrder.some(id => !bySocket.get(id).accountUserId)) { socket.send(event("MESSAGE_REJECTED", { code: "rummy_stake_requires_account" })); return; }
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        const gameId = crypto.randomUUID();
        const staked = [];
        try {
          for (const id of turnOrder) {
            await gamesService.stakeRummy(bySocket.get(id).accountUserId, stakeCredits, roomRef, `rm:${gameId}:${id}:stake`);
            staked.push(id);
          }
        } catch {
          for (const id of staked) {
            try { await gamesService.refundRummyStake(bySocket.get(id).accountUserId, stakeCredits, roomRef, `rm:${gameId}:${id}:refund`); } catch {}
          }
          socket.send(event("MESSAGE_REJECTED", { code: "rummy_stake_failed" }));
          return;
        }
        accountByParticipant = Object.fromEntries(turnOrder.map(id => [id, bySocket.get(id).accountUserId]));
        pot = stakeCredits * turnOrder.length;
      }
      const { hands, closedDeck, discardPile, wildcardRank } = dealRummy(turnOrder);
      room.game = { gameId: crypto.randomUUID(), status: "playing", turnOrder, turnIndex: 0, phase: "draw", hands, closedDeck, discardPile, wildcardRank, forfeited: [], stakeCredits, pot, accountByParticipant, phaseEndsAt: Date.now() + RUMMY_TURN_SECONDS * 1000 };
      await this.state.storage.put("room", room);
      for (const id of turnOrder) this.sendRummyHand(room, id);
      this.broadcastRummyState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "RUMMY_DRAW" && (payload.source === "closed" || payload.source === "discard")) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "rummy" || !room.game || room.game.status !== "playing" || room.game.phase !== "draw") return;
      if (room.game.turnOrder[room.game.turnIndex] !== attachment.participantId) return;
      this.drawRummyCard(room, attachment.participantId, payload.source);
      room.game.phase = "discard";
      room.game.phaseEndsAt = Date.now() + RUMMY_TURN_SECONDS * 1000;
      await this.state.storage.put("room", room);
      this.sendRummyHand(room, attachment.participantId);
      this.broadcastRummyState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "RUMMY_DISCARD" && typeof payload.cardId === "string") {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "rummy" || !room.game || room.game.status !== "playing" || room.game.phase !== "discard") return;
      if (room.game.turnOrder[room.game.turnIndex] !== attachment.participantId) return;
      const hand = room.game.hands[attachment.participantId] || [];
      const cardIndex = hand.findIndex(c => c.id === payload.cardId);
      if (cardIndex === -1) return;
      const [card] = hand.splice(cardIndex, 1);
      room.game.discardPile.push(card);
      await this.advanceRummyTurn(room);
      return;
    }

    if (type === "RUMMY_DECLARE" && Array.isArray(payload.groups) && typeof payload.unusedCardId === "string") {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "rummy" || !room.game || room.game.status !== "playing" || room.game.phase !== "discard") return;
      if (room.game.turnOrder[room.game.turnIndex] !== attachment.participantId) return;
      const hand = room.game.hands[attachment.participantId] || [];
      const result = validateDeclaration(hand, payload.groups, payload.unusedCardId, room.game.wildcardRank);
      if (!result.valid) {
        room.game.forfeited = [...room.game.forfeited, attachment.participantId];
        this.broadcast(event("RUMMY_INVALID_DECLARE", { participantId: attachment.participantId, reason: result.reason }));
        await this.advanceRummyTurn(room, true);
        return;
      }
      await this.settleRummyGame(room, attachment.participantId);
      return;
    }

    if (type === "LUDO_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "ludo") return;
      const stakeCredits = Number.isSafeInteger(payload.stakeCredits) && payload.stakeCredits > 0 ? payload.stakeCredits : 0;
      const bySocket = new Map(this.state.getWebSockets().map(s => [(s.deserializeAttachment() || {}).participantId, s.deserializeAttachment() || {}]));
      const turnOrder = shuffled((room.seatedParticipantIds || []).filter(id => bySocket.has(id))).slice(0, LUDO_MAX_PLAYERS);
      if (turnOrder.length < LUDO_MIN_PLAYERS) { socket.send(event("MESSAGE_REJECTED", { code: "ludo_needs_two_players" })); return; }
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      let accountByParticipant = {}, pot = 0;
      if (stakeCredits > 0) {
        let flags;
        try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
        if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
        if (turnOrder.some(id => !bySocket.get(id).accountUserId)) { socket.send(event("MESSAGE_REJECTED", { code: "ludo_stake_requires_account" })); return; }
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        const gameId = crypto.randomUUID();
        const staked = [];
        try {
          for (const id of turnOrder) {
            await gamesService.stakeLudo(bySocket.get(id).accountUserId, stakeCredits, roomRef, `ld:${gameId}:${id}:stake`);
            staked.push(id);
          }
        } catch {
          for (const id of staked) {
            try { await gamesService.refundLudoStake(bySocket.get(id).accountUserId, stakeCredits, roomRef, `ld:${gameId}:${id}:refund`); } catch {}
          }
          socket.send(event("MESSAGE_REJECTED", { code: "ludo_stake_failed" }));
          return;
        }
        accountByParticipant = Object.fromEntries(turnOrder.map(id => [id, bySocket.get(id).accountUserId]));
        pot = stakeCredits * turnOrder.length;
      }
      room.game = {
        gameId: crypto.randomUUID(), status: "playing", turnOrder, turnIndex: 0, phase: "await_roll",
        colors: Object.fromEntries(turnOrder.map((id, index) => [id, index])),
        tokens: Object.fromEntries(turnOrder.map(id => [id, [0, 0, 0, 0]])),
        lastRoll: null, movable: [], consecutiveSixes: 0, forfeited: [],
        stakeCredits, pot, accountByParticipant, phaseEndsAt: Date.now() + LUDO_TURN_SECONDS * 1000,
      };
      await this.state.storage.put("room", room);
      this.broadcastLudoState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "LUDO_ROLL") {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "ludo" || !room.game || room.game.status !== "playing" || room.game.phase !== "await_roll") return;
      if (room.game.turnOrder[room.game.turnIndex] !== attachment.participantId) return;
      await this.rollLudo(room);
      return;
    }

    if (type === "LUDO_MOVE" && Number.isInteger(payload.tokenIndex)) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "ludo" || !room.game || room.game.status !== "playing" || room.game.phase !== "await_move") return;
      if (room.game.turnOrder[room.game.turnIndex] !== attachment.participantId) return;
      if (!room.game.movable.includes(payload.tokenIndex)) return;
      await this.moveLudo(room, attachment.participantId, payload.tokenIndex);
      return;
    }

    if (type === "TEEN_PATTI_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "teen_patti") return;
      const stakeCredits = Number.isSafeInteger(payload.stakeCredits) && payload.stakeCredits > 0 ? payload.stakeCredits : 0;
      const bySocket = new Map(this.state.getWebSockets().map(s => [(s.deserializeAttachment() || {}).participantId, s.deserializeAttachment() || {}]));
      const turnOrder = shuffled((room.seatedParticipantIds || []).filter(id => bySocket.has(id))).slice(0, TEEN_PATTI_MAX_PLAYERS);
      if (turnOrder.length < TEEN_PATTI_MIN_PLAYERS) { socket.send(event("MESSAGE_REJECTED", { code: "teen_patti_needs_two_players" })); return; }
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      let accountByParticipant = {}, pot = 0;
      const gameId = crypto.randomUUID();
      if (stakeCredits > 0) {
        let flags;
        try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
        if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
        if (turnOrder.some(id => !bySocket.get(id).accountUserId)) { socket.send(event("MESSAGE_REJECTED", { code: "teen_patti_stake_requires_account" })); return; }
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        const staked = [];
        try {
          for (const id of turnOrder) {
            await gamesService.stakeTeenPatti(bySocket.get(id).accountUserId, stakeCredits, roomRef, `tp:${gameId}:${id}:ante`);
            staked.push(id);
          }
        } catch {
          for (const id of staked) {
            try { await gamesService.refundTeenPattiStake(bySocket.get(id).accountUserId, stakeCredits, roomRef, `tp:${gameId}:${id}:refund:ante`); } catch {}
          }
          socket.send(event("MESSAGE_REJECTED", { code: "teen_patti_stake_failed" }));
          return;
        }
        accountByParticipant = Object.fromEntries(turnOrder.map(id => [id, bySocket.get(id).accountUserId]));
        pot = stakeCredits * turnOrder.length;
      }
      const { hands } = dealTeenPatti(turnOrder);
      room.game = {
        gameId, status: "playing", turnOrder, turnIndex: 0, phase: "betting", hands, folded: [],
        currentStake: stakeCredits, callCount: 0, stakeCredits, pot, accountByParticipant,
        phaseEndsAt: Date.now() + TEEN_PATTI_TURN_SECONDS * 1000,
      };
      await this.state.storage.put("room", room);
      for (const id of turnOrder) this.sendTeenPattiHand(room, id);
      this.broadcastTeenPattiState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "TEEN_PATTI_ACTION" && ["call", "fold", "show"].includes(payload.action)) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "teen_patti" || !room.game || room.game.status !== "playing" || room.game.phase !== "betting") return;
      if (room.game.turnOrder[room.game.turnIndex] !== attachment.participantId) return;
      await this.actTeenPatti(room, attachment.participantId, payload.action, socket);
      return;
    }

    if (type === "ANDAR_BAHAR_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "andar_bahar") return;
      if (room.game && room.game.status === "betting") return;
      const stakeCredits = Number.isSafeInteger(payload.stakeCredits) && payload.stakeCredits > 0 ? payload.stakeCredits : 0;
      if (stakeCredits > 0) {
        let flags;
        try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
        if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
      }
      const deck = buildAndarBaharDeck();
      const middleCard = deck.pop();
      const eligibleParticipantIds = [...room.seatedParticipantIds];
      room.game = {
        gameId: crypto.randomUUID(), status: "betting", stakeCredits, middleCard, deck, eligibleParticipantIds,
        bets: {}, pot: 0, andarTotal: 0, baharTotal: 0,
        phaseEndsAt: Date.now() + ANDAR_BAHAR_BETTING_SECONDS * 1000,
      };
      await this.state.storage.put("room", room);
      this.broadcastAndarBaharState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "ANDAR_BAHAR_BET" && (payload.side === "andar" || payload.side === "bahar")) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "andar_bahar" || !room.game || room.game.status !== "betting") return;
      const participantId = attachment.participantId;
      if (!room.game.eligibleParticipantIds.includes(participantId)) return;
      if (room.game.bets[participantId]) return;
      const stakeCredits = room.game.stakeCredits;
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      let accountUserId = null;
      if (stakeCredits > 0) {
        accountUserId = attachment.accountUserId;
        if (!accountUserId) { socket.send(event("MESSAGE_REJECTED", { code: "andar_bahar_stake_requires_account" })); return; }
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        try {
          await gamesService.stakeAndarBahar(accountUserId, stakeCredits, roomRef, `ab:${room.game.gameId}:${participantId}:bet`);
        } catch {
          socket.send(event("MESSAGE_REJECTED", { code: "andar_bahar_stake_failed" }));
          return;
        }
      }
      room.game.bets[participantId] = { side: payload.side, accountUserId, amount: stakeCredits };
      room.game.pot += stakeCredits;
      if (payload.side === "andar") room.game.andarTotal += stakeCredits; else room.game.baharTotal += stakeCredits;
      await this.state.storage.put("room", room);
      this.broadcastAndarBaharState(room);
      return;
    }

    if (type === "BID_ROUND_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "bidding") return;
      if (room.game && room.game.status === "bidding") return;
      let flags;
      try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
      if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
      const eligibleParticipantIds = [...room.seatedParticipantIds];
      room.game = {
        gameId: crypto.randomUUID(), status: "bidding", eligibleParticipantIds,
        bids: {}, pot: 0,
        phaseEndsAt: Date.now() + BIDDING_ROUND_SECONDS * 1000,
      };
      await this.state.storage.put("room", room);
      this.broadcastBiddingState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "BID_SUBMIT" && Number.isSafeInteger(payload.bidCredits) && payload.bidCredits > 0) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "bidding" || !room.game || room.game.status !== "bidding") return;
      const participantId = attachment.participantId;
      if (!room.game.eligibleParticipantIds.includes(participantId)) return;
      if (room.game.bids[participantId]) return;
      const bidCredits = payload.bidCredits;
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      const accountUserId = attachment.accountUserId;
      if (!accountUserId) { socket.send(event("MESSAGE_REJECTED", { code: "bidding_stake_requires_account" })); return; }
      const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
      try {
        await gamesService.stakeBidding(accountUserId, bidCredits, roomRef, `bid:${room.game.gameId}:${participantId}:bet`);
      } catch {
        socket.send(event("MESSAGE_REJECTED", { code: "bidding_stake_failed" }));
        return;
      }
      room.game.bids[participantId] = { accountUserId, amount: bidCredits };
      room.game.pot += bidCredits;
      await this.state.storage.put("room", room);
      this.broadcastBiddingState(room);
      return;
    }

    if (type === "TUG_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "tug_of_war") return;
      if (room.game && room.game.status === "playing") return;
      if (room.seatedParticipantIds.length !== 2) { socket.send(event("MESSAGE_REJECTED", { code: "tug_of_war_needs_two_players" })); return; }
      const stakeCredits = Number.isSafeInteger(payload.stakeCredits) && payload.stakeCredits > 0 ? payload.stakeCredits : 0;
      if (stakeCredits > 0) {
        let flags;
        try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
        if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
      }
      const players = [...room.seatedParticipantIds];
      const gameId = crypto.randomUUID();
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      let pot = 0;
      const stakers = [];
      if (stakeCredits > 0) {
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        for (const participantId of players) {
          const attach = [...this.state.getWebSockets()].map(s => s.deserializeAttachment() || {}).find(a => a.participantId === participantId);
          const accountUserId = attach?.accountUserId;
          if (!accountUserId) { socket.send(event("MESSAGE_REJECTED", { code: "tug_of_war_stake_requires_account" })); return; }
          try {
            await gamesService.stakeTugOfWar(accountUserId, stakeCredits, roomRef, `tug:${gameId}:${participantId}:ante`);
          } catch {
            for (const staked of stakers) { try { await gamesService.refundTugOfWarStake(staked.accountUserId, stakeCredits, roomRef, `tug:${gameId}:${staked.participantId}:refund`); } catch {} }
            socket.send(event("MESSAGE_REJECTED", { code: "tug_of_war_stake_failed" }));
            return;
          }
          stakers.push({ participantId, accountUserId });
          pot += stakeCredits;
        }
      }
      const { index, question } = randomTugOfWarQuestion();
      room.game = {
        gameId, status: "playing", players, accountUserIds: Object.fromEntries(stakers.map(s => [s.participantId, s.accountUserId])),
        stakeCredits, pot, scores: { [players[0]]: 0, [players[1]]: 0 },
        askedIndexes: [index], currentQuestionIndex: index, answers: {},
        phaseEndsAt: Date.now() + TUG_OF_WAR_QUESTION_SECONDS * 1000,
      };
      await this.state.storage.put("room", room);
      this.broadcastTugOfWarState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "TUG_ANSWER" && Number.isSafeInteger(payload.optionIndex)) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "tug_of_war" || !room.game || room.game.status !== "playing") return;
      const participantId = attachment.participantId;
      if (!room.game.players.includes(participantId)) return;
      if (room.game.answers[participantId]) return;
      room.game.answers[participantId] = { optionIndex: payload.optionIndex, at: Date.now() };
      await this.state.storage.put("room", room);
      if (Object.keys(room.game.answers).length >= room.game.players.length) {
        await this.resolveTugOfWarQuestion(room);
      } else {
        await this.state.storage.put("room", room);
      }
      return;
    }

    if (type === "C4_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "connect_four") return;
      if (room.game && room.game.status === "playing") return;
      if (room.seatedParticipantIds.length !== 2) { socket.send(event("MESSAGE_REJECTED", { code: "connect_four_needs_two_players" })); return; }
      const stakeCredits = Number.isSafeInteger(payload.stakeCredits) && payload.stakeCredits > 0 ? payload.stakeCredits : 0;
      if (stakeCredits > 0) {
        let flags;
        try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
        if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
      }
      const players = [...room.seatedParticipantIds];
      const gameId = crypto.randomUUID();
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      let pot = 0;
      const stakers = [];
      if (stakeCredits > 0) {
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        for (const participantId of players) {
          const attach = [...this.state.getWebSockets()].map(s => s.deserializeAttachment() || {}).find(a => a.participantId === participantId);
          const accountUserId = attach?.accountUserId;
          if (!accountUserId) { socket.send(event("MESSAGE_REJECTED", { code: "connect_four_stake_requires_account" })); return; }
          try {
            await gamesService.stakeConnectFour(accountUserId, stakeCredits, roomRef, `c4:${gameId}:${participantId}:ante`);
          } catch {
            for (const staked of stakers) { try { await gamesService.refundConnectFourStake(staked.accountUserId, stakeCredits, roomRef, `c4:${gameId}:${staked.participantId}:refund`); } catch {} }
            socket.send(event("MESSAGE_REJECTED", { code: "connect_four_stake_failed" }));
            return;
          }
          stakers.push({ participantId, accountUserId });
          pot += stakeCredits;
        }
      }
      const board = Array.from({ length: CONNECT_FOUR_ROWS }, () => Array(CONNECT_FOUR_COLS).fill(null));
      room.game = {
        gameId, status: "playing", players, accountUserIds: Object.fromEntries(stakers.map(s => [s.participantId, s.accountUserId])),
        stakeCredits, pot, board, moveCount: 0, turnParticipantId: players[0],
        phaseEndsAt: Date.now() + CONNECT_FOUR_TURN_SECONDS * 1000,
        winnerParticipantId: null, winningCells: null,
      };
      await this.state.storage.put("room", room);
      this.broadcastConnectFourState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "C4_MOVE" && Number.isSafeInteger(payload.column)) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "connect_four" || !room.game || room.game.status !== "playing") return;
      const participantId = attachment.participantId;
      if (room.game.turnParticipantId !== participantId) return;
      if (payload.column < 0 || payload.column >= CONNECT_FOUR_COLS) return;
      const row = this.dropConnectFourPiece(room.game.board, payload.column, participantId);
      if (row === -1) { socket.send(event("MESSAGE_REJECTED", { code: "connect_four_column_full" })); return; }
      room.game.moveCount += 1;
      const winningCells = this.connectFourWinCells(room.game.board, row, payload.column, participantId);
      if (winningCells) {
        await this.resolveConnectFourGame(room, participantId, winningCells);
        return;
      }
      if (room.game.moveCount >= CONNECT_FOUR_ROWS * CONNECT_FOUR_COLS) {
        await this.resolveConnectFourDraw(room);
        return;
      }
      const [p1, p2] = room.game.players;
      room.game.turnParticipantId = participantId === p1 ? p2 : p1;
      room.game.phaseEndsAt = Date.now() + CONNECT_FOUR_TURN_SECONDS * 1000;
      await this.state.storage.put("room", room);
      this.broadcastConnectFourState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "ELIM_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "elimination_reflex") return;
      if (room.game && (room.game.status === "waiting_round" || room.game.status === "armed")) return;
      const seatedCount = room.seatedParticipantIds.length;
      if (seatedCount < ELIMINATION_REFLEX_MIN_PLAYERS || seatedCount > ELIMINATION_REFLEX_MAX_PLAYERS) {
        socket.send(event("MESSAGE_REJECTED", { code: "elimination_reflex_needs_three_or_four" }));
        return;
      }
      const stakeCredits = Number.isSafeInteger(payload.stakeCredits) && payload.stakeCredits > 0 ? payload.stakeCredits : 0;
      if (stakeCredits > 0) {
        let flags;
        try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
        if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
      }
      const players = [...room.seatedParticipantIds];
      const gameId = crypto.randomUUID();
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      const accountUserIds = {};
      let pot = 0;
      const stakers = [];
      if (stakeCredits > 0) {
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        for (const participantId of players) {
          const attach = [...this.state.getWebSockets()].map(s => s.deserializeAttachment() || {}).find(a => a.participantId === participantId);
          const accountUserId = attach?.accountUserId;
          if (!accountUserId) { socket.send(event("MESSAGE_REJECTED", { code: "elimination_reflex_stake_requires_account" })); return; }
          try {
            await gamesService.stakeEliminationReflex(accountUserId, stakeCredits, roomRef, `elim:${gameId}:${participantId}:ante`);
          } catch {
            for (const staked of stakers) { try { await gamesService.refundEliminationReflexStake(staked.accountUserId, stakeCredits, roomRef, `elim:${gameId}:${staked.participantId}:refund`); } catch {} }
            socket.send(event("MESSAGE_REJECTED", { code: "elimination_reflex_stake_failed" }));
            return;
          }
          stakers.push({ participantId, accountUserId });
          accountUserIds[participantId] = accountUserId;
          pot += stakeCredits;
        }
      }
      const armAt = Date.now() + ELIMINATION_REFLEX_ARM_MIN_MS + Math.floor(Math.random() * (ELIMINATION_REFLEX_ARM_MAX_MS - ELIMINATION_REFLEX_ARM_MIN_MS));
      room.game = {
        gameId, status: "waiting_round", players, active: [...players], eliminated: [], accountUserIds,
        stakeCredits, pot, taps: {}, armAt, roundNumber: 1,
        phaseEndsAt: armAt,
      };
      await this.state.storage.put("room", room);
      this.broadcastEliminationReflexState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "ELIM_TAP") {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "elimination_reflex" || !room.game) return;
      const participantId = attachment.participantId;
      if (!room.game.active.includes(participantId)) return;
      if (room.game.status === "waiting_round") {
        await this.eliminateReflexPlayer(room, participantId, "false_start");
        return;
      }
      if (room.game.status === "armed") {
        if (room.game.taps[participantId]) return;
        room.game.taps[participantId] = Date.now();
        await this.state.storage.put("room", room);
        if (Object.keys(room.game.taps).length >= room.game.active.length) {
          await this.resolveEliminationReflexRound(room);
        } else {
          this.broadcastEliminationReflexState(room);
        }
      }
      return;
    }

    if (type === "PREDICT_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "prediction_pool") return;
      if (room.game && room.game.status === "guessing") return;
      const stakeCredits = Number.isSafeInteger(payload.stakeCredits) && payload.stakeCredits > 0 ? payload.stakeCredits : 0;
      if (stakeCredits > 0) {
        let flags;
        try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
        if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
      }
      const rangeMax = Number.isSafeInteger(payload.rangeMax) && payload.rangeMax >= 10 && payload.rangeMax <= 10000 ? payload.rangeMax : PREDICTION_POOL_DEFAULT_RANGE_MAX;
      const secretNumber = 1 + Math.floor(Math.random() * rangeMax);
      const eligibleParticipantIds = [...room.seatedParticipantIds];
      room.game = {
        gameId: crypto.randomUUID(), status: "guessing", stakeCredits, rangeMax, secretNumber, eligibleParticipantIds,
        guesses: {}, pot: 0,
        phaseEndsAt: Date.now() + PREDICTION_POOL_ROUND_SECONDS * 1000,
      };
      await this.state.storage.put("room", room);
      this.broadcastPredictionPoolState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "PREDICT_SUBMIT" && Number.isSafeInteger(payload.guess)) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "prediction_pool" || !room.game || room.game.status !== "guessing") return;
      const participantId = attachment.participantId;
      if (!room.game.eligibleParticipantIds.includes(participantId)) return;
      if (room.game.guesses[participantId]) return;
      if (payload.guess < 1 || payload.guess > room.game.rangeMax) return;
      const stakeCredits = room.game.stakeCredits;
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      let accountUserId = null;
      if (stakeCredits > 0) {
        accountUserId = attachment.accountUserId;
        if (!accountUserId) { socket.send(event("MESSAGE_REJECTED", { code: "prediction_pool_stake_requires_account" })); return; }
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        try {
          await gamesService.stakePredictionPool(accountUserId, stakeCredits, roomRef, `predict:${room.game.gameId}:${participantId}:bet`);
        } catch {
          socket.send(event("MESSAGE_REJECTED", { code: "prediction_pool_stake_failed" }));
          return;
        }
      }
      room.game.guesses[participantId] = { guess: payload.guess, accountUserId, amount: stakeCredits };
      room.game.pot += stakeCredits;
      await this.state.storage.put("room", room);
      this.broadcastPredictionPoolState(room);
      return;
    }

    if (type === "DRAGON_TIGER_START" && attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "dragon_tiger") return;
      if (room.game && room.game.status === "betting") return;
      const stakeCredits = Number.isSafeInteger(payload.stakeCredits) && payload.stakeCredits > 0 ? payload.stakeCredits : 0;
      if (stakeCredits > 0) {
        let flags;
        try { flags = (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { flags = null; }
        if (!flags?.games_enabled || !flags?.game_staking_enabled) { socket.send(event("MESSAGE_REJECTED", { code: "staking_unavailable" })); return; }
      }
      const deck = buildDragonTigerDeck();
      const eligibleParticipantIds = [...room.seatedParticipantIds];
      room.game = {
        gameId: crypto.randomUUID(), status: "betting", stakeCredits, deck, eligibleParticipantIds,
        bets: {}, pot: 0, dragonTotal: 0, tigerTotal: 0,
        phaseEndsAt: Date.now() + DRAGON_TIGER_BETTING_SECONDS * 1000,
      };
      await this.state.storage.put("room", room);
      this.broadcastDragonTigerState(room);
      await this.scheduleAlarm(room);
      return;
    }

    if (type === "DRAGON_TIGER_BET" && (payload.side === "dragon" || payload.side === "tiger")) {
      const room = (await this.state.storage.get("room")) || {};
      if (room.mode !== "dragon_tiger" || !room.game || room.game.status !== "betting") return;
      const participantId = attachment.participantId;
      if (!room.game.eligibleParticipantIds.includes(participantId)) return;
      if (room.game.bets[participantId]) return;
      const stakeCredits = room.game.stakeCredits;
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      let accountUserId = null;
      if (stakeCredits > 0) {
        accountUserId = attachment.accountUserId;
        if (!accountUserId) { socket.send(event("MESSAGE_REJECTED", { code: "dragon_tiger_stake_requires_account" })); return; }
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        try {
          await gamesService.stakeDragonTiger(accountUserId, stakeCredits, roomRef, `dt:${room.game.gameId}:${participantId}:bet`);
        } catch {
          socket.send(event("MESSAGE_REJECTED", { code: "dragon_tiger_stake_failed" }));
          return;
        }
      }
      room.game.bets[participantId] = { side: payload.side, accountUserId, amount: stakeCredits };
      room.game.pot += stakeCredits;
      if (payload.side === "dragon") room.game.dragonTotal += stakeCredits; else room.game.tigerTotal += stakeCredits;
      await this.state.storage.put("room", room);
      this.broadcastDragonTigerState(room);
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

  pickWordChoices() {
    return shuffled(DRAW_GUESS_WORDS).slice(0, 3);
  }

  broadcastGameState(room) {
    const game = room.game;
    this.broadcast(event("GAME_STATE", { status: game.status, drawerParticipantId: game.drawerParticipantId, wordLength: game.wordLength, phaseEndsAt: game.phaseEndsAt, scores: game.scores, roundsPlayed: game.roundsPlayed, totalRounds: game.totalRounds }));
  }

  sendYourTurn(room) {
    const drawerSocket = this.socketFor(room.game.drawerParticipantId);
    if (drawerSocket) try { drawerSocket.send(event("GAME_YOUR_TURN", { choices: room.game.choices, phaseEndsAt: room.game.phaseEndsAt })); } catch {}
  }

  async beginDrawingPhase(room, word) {
    room.game.word = word;
    room.game.wordLength = word.length;
    room.game.status = "drawing";
    room.game.phaseEndsAt = Date.now() + DRAW_GUESS_ROUND_SECONDS * 1000;
    room.game.correctGuessers = [];
    this.gameStrokes = [];
    await this.state.storage.put("room", room);
    this.broadcast(event("GAME_ROUND_START", { drawerParticipantId: room.game.drawerParticipantId, wordLength: room.game.wordLength, phaseEndsAt: room.game.phaseEndsAt }));
    await this.scheduleAlarm(room);
  }

  async endDrawRound(room) {
    const revealedWord = room.game.word;
    const connectedIds = new Set(this.state.getWebSockets().map(s => (s.deserializeAttachment() || {}).participantId).filter(Boolean));
    room.game.roundsPlayed += 1;
    let nextIndex = -1;
    for (let i = room.game.turnIndex + 1; i < room.game.turnOrder.length; i++) {
      if (connectedIds.has(room.game.turnOrder[i])) { nextIndex = i; break; }
    }
    this.broadcast(event("GAME_ROUND_END", { word: revealedWord, scores: room.game.scores }));
    if (nextIndex === -1) {
      room.game.status = "game_over";
      room.game.word = null;
      await this.state.storage.put("room", room);
      this.broadcast(event("GAME_OVER", { scores: room.game.scores }));
      return;
    }
    room.game.turnIndex = nextIndex;
    room.game.drawerParticipantId = room.game.turnOrder[nextIndex];
    room.game.status = "choosing";
    room.game.word = null;
    room.game.wordLength = 0;
    room.game.choices = this.pickWordChoices();
    room.game.correctGuessers = [];
    room.game.phaseEndsAt = Date.now() + DRAW_GUESS_CHOOSE_SECONDS * 1000;
    await this.state.storage.put("room", room);
    this.broadcastGameState(room);
    this.sendYourTurn(room);
    await this.scheduleAlarm(room);
  }

  broadcastCharadesState(room) {
    const game = room.game;
    this.broadcast(event("CHARADES_STATE", { status: game.status, performerParticipantId: game.performerParticipantId, wordLength: game.wordLength, phaseEndsAt: game.phaseEndsAt, scores: game.scores, roundsPlayed: game.roundsPlayed, totalRounds: game.totalRounds }));
  }

  sendCharadesYourTurn(room) {
    const performerSocket = this.socketFor(room.game.performerParticipantId);
    if (performerSocket) try { performerSocket.send(event("CHARADES_YOUR_TURN", { choices: room.game.choices, phaseEndsAt: room.game.phaseEndsAt })); } catch {}
  }

  async beginCluePhase(room, word) {
    room.game.word = word;
    room.game.wordLength = word.length;
    room.game.status = "describing";
    room.game.phaseEndsAt = Date.now() + CHARADES_ROUND_SECONDS * 1000;
    room.game.correctGuessers = [];
    await this.state.storage.put("room", room);
    this.broadcast(event("CHARADES_ROUND_START", { performerParticipantId: room.game.performerParticipantId, wordLength: room.game.wordLength, phaseEndsAt: room.game.phaseEndsAt }));
    await this.scheduleAlarm(room);
  }

  async endCharadesRound(room) {
    const revealedWord = room.game.word;
    const connectedIds = new Set(this.state.getWebSockets().map(s => (s.deserializeAttachment() || {}).participantId).filter(Boolean));
    room.game.roundsPlayed += 1;
    let nextIndex = -1;
    for (let i = room.game.turnIndex + 1; i < room.game.turnOrder.length; i++) {
      if (connectedIds.has(room.game.turnOrder[i])) { nextIndex = i; break; }
    }
    this.broadcast(event("CHARADES_ROUND_END", { word: revealedWord, scores: room.game.scores }));
    if (nextIndex === -1) {
      room.game.status = "game_over";
      room.game.word = null;
      await this.state.storage.put("room", room);
      this.broadcast(event("CHARADES_OVER", { scores: room.game.scores }));
      return;
    }
    room.game.turnIndex = nextIndex;
    room.game.performerParticipantId = room.game.turnOrder[nextIndex];
    room.game.status = "choosing";
    room.game.word = null;
    room.game.wordLength = 0;
    room.game.choices = this.pickWordChoices();
    room.game.correctGuessers = [];
    room.game.phaseEndsAt = Date.now() + CHARADES_CHOOSE_SECONDS * 1000;
    await this.state.storage.put("room", room);
    this.broadcastCharadesState(room);
    this.sendCharadesYourTurn(room);
    await this.scheduleAlarm(room);
  }

  broadcastSnakeLadderState(room) {
    const game = room.game;
    this.broadcast(event("SNAKE_LADDER_STATE", { status: game.status, turnOrder: game.turnOrder, turnIndex: game.turnIndex, positions: game.positions, forfeited: game.forfeited, stakeCredits: game.stakeCredits, pot: game.pot, lastRoll: game.lastRoll, phaseEndsAt: game.phaseEndsAt }));
  }

  nextSnakeLadderTurnIndex(room, connectedIds) {
    const { turnOrder, forfeited } = room.game;
    for (let step = 1; step <= turnOrder.length; step++) {
      const index = (room.game.turnIndex + step) % turnOrder.length;
      const id = turnOrder[index];
      if (!forfeited.includes(id) && connectedIds.has(id)) return index;
    }
    return -1;
  }

  async rollSnakeLadder(room) {
    const connectedIds = new Set(this.state.getWebSockets().map(s => (s.deserializeAttachment() || {}).participantId).filter(Boolean));
    const currentId = room.game.turnOrder[room.game.turnIndex];
    const roll = 1 + Math.floor(Math.random() * 6);
    let position = room.game.positions[currentId] || 0;
    let landedOn = position + roll;
    let rawLanded = null;
    let tileType = "none";
    if (landedOn > SNAKE_LADDER_BOARD_SIZE) {
      landedOn = position; // overshoot: stay put, matches the classic "must land exactly on 100" house rule
    } else if (SNAKE_LADDER_TILES[landedOn] !== undefined) {
      rawLanded = landedOn;
      landedOn = SNAKE_LADDER_TILES[landedOn];
      tileType = landedOn < rawLanded ? "snake" : "ladder";
    }
    room.game.positions[currentId] = landedOn;
    room.game.lastRoll = { participantId: currentId, roll, landedOn, rawLanded, tileType };

    if (landedOn === SNAKE_LADDER_BOARD_SIZE) {
      room.game.status = "game_over";
      await this.state.storage.put("room", room);
      this.broadcastSnakeLadderState(room);
      if (room.game.pot > 0) {
        const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
        try {
          const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
          const result = await gamesService.settleSnakeLadderRound(room.game.accountByParticipant[currentId], room.game.pot, roomRef, room.game.turnOrder, `sl:${room.game.gameId}:settle`);
          this.broadcast(event("SNAKE_LADDER_OVER", { winnerParticipantId: currentId, payoutCredits: result?.payout_credits || 0 }));
        } catch {
          this.broadcast(event("SNAKE_LADDER_OVER", { winnerParticipantId: currentId, payoutCredits: 0, settlementFailed: true }));
        }
      } else {
        this.broadcast(event("SNAKE_LADDER_OVER", { winnerParticipantId: currentId, payoutCredits: 0 }));
      }
      return;
    }

    const nextIndex = this.nextSnakeLadderTurnIndex(room, connectedIds);
    if (nextIndex === -1) {
      // everyone else disconnected/forfeited -- the last player standing takes the pot without another roll
      room.game.status = "game_over";
      await this.state.storage.put("room", room);
      this.broadcastSnakeLadderState(room);
      if (room.game.pot > 0) {
        const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
        try {
          const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
          const result = await gamesService.settleSnakeLadderRound(room.game.accountByParticipant[currentId], room.game.pot, roomRef, room.game.turnOrder, `sl:${room.game.gameId}:settle`);
          this.broadcast(event("SNAKE_LADDER_OVER", { winnerParticipantId: currentId, payoutCredits: result?.payout_credits || 0, reason: "opponents_left" }));
        } catch {
          this.broadcast(event("SNAKE_LADDER_OVER", { winnerParticipantId: currentId, payoutCredits: 0, settlementFailed: true, reason: "opponents_left" }));
        }
      } else {
        this.broadcast(event("SNAKE_LADDER_OVER", { winnerParticipantId: currentId, payoutCredits: 0, reason: "opponents_left" }));
      }
      return;
    }
    room.game.turnIndex = nextIndex;
    room.game.phaseEndsAt = Date.now() + SNAKE_LADDER_TURN_SECONDS * 1000;
    await this.state.storage.put("room", room);
    this.broadcastSnakeLadderState(room);
    await this.scheduleAlarm(room);
  }

  publicRummyState(room) {
    const game = room.game;
    return { status: game.status, turnOrder: game.turnOrder, turnIndex: game.turnIndex, phase: game.phase, forfeited: game.forfeited, stakeCredits: game.stakeCredits, pot: game.pot, wildcardRank: game.wildcardRank, discardTop: game.discardPile[game.discardPile.length - 1] || null, closedCount: game.closedDeck.length, cardCounts: Object.fromEntries(Object.entries(game.hands).map(([id, cards]) => [id, cards.length])), phaseEndsAt: game.phaseEndsAt };
  }

  broadcastRummyState(room) {
    this.broadcast(event("RUMMY_STATE", this.publicRummyState(room)));
  }

  sendRummyHand(room, participantId) {
    const target = this.socketFor(participantId);
    if (!target) return;
    const hand = room.game.hands[participantId] || [];
    try { target.send(event("RUMMY_HAND", { hand, wildcardRank: room.game.wildcardRank })); } catch {}
  }

  reshuffleRummyDiscard(room) {
    const top = room.game.discardPile.pop();
    room.game.closedDeck = shuffled(room.game.discardPile);
    room.game.discardPile = top ? [top] : [];
  }

  drawRummyCard(room, participantId, source) {
    if (source === "closed") {
      if (!room.game.closedDeck.length) this.reshuffleRummyDiscard(room);
      const card = room.game.closedDeck.pop();
      if (card) room.game.hands[participantId].push(card);
    } else {
      const card = room.game.discardPile.pop();
      if (card) room.game.hands[participantId].push(card);
    }
  }

  nextRummyTurnIndex(room, connectedIds) {
    const { turnOrder, forfeited } = room.game;
    for (let step = 1; step <= turnOrder.length; step++) {
      const index = (room.game.turnIndex + step) % turnOrder.length;
      const id = turnOrder[index];
      if (!forfeited.includes(id) && connectedIds.has(id)) return index;
    }
    return -1;
  }

  async advanceRummyTurn(room, keepPhaseEndsAt) {
    const connectedIds = new Set(this.state.getWebSockets().map(s => (s.deserializeAttachment() || {}).participantId).filter(Boolean));
    const nextIndex = this.nextRummyTurnIndex(room, connectedIds);
    if (nextIndex === -1) {
      const survivorId = room.game.turnOrder.find(id => !room.game.forfeited.includes(id));
      await this.settleRummyGame(room, survivorId, "opponents_left");
      return;
    }
    room.game.turnIndex = nextIndex;
    room.game.phase = "draw";
    if (!keepPhaseEndsAt) room.game.phaseEndsAt = Date.now() + RUMMY_TURN_SECONDS * 1000;
    await this.state.storage.put("room", room);
    this.broadcastRummyState(room);
    await this.scheduleAlarm(room);
  }

  async settleRummyGame(room, winnerParticipantId, reason) {
    room.game.status = "game_over";
    await this.state.storage.put("room", room);
    this.broadcastRummyState(room);
    if (!winnerParticipantId) { this.broadcast(event("RUMMY_OVER", { winnerParticipantId: null, payoutCredits: 0, reason: reason || "no_winner" })); return; }
    if (room.game.pot > 0) {
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      try {
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        const result = await gamesService.settleRummyRound(room.game.accountByParticipant[winnerParticipantId], room.game.pot, roomRef, room.game.turnOrder, `rm:${room.game.gameId}:settle`);
        this.broadcast(event("RUMMY_OVER", { winnerParticipantId, payoutCredits: result?.payout_credits || 0, reason }));
      } catch {
        this.broadcast(event("RUMMY_OVER", { winnerParticipantId, payoutCredits: 0, settlementFailed: true, reason }));
      }
    } else {
      this.broadcast(event("RUMMY_OVER", { winnerParticipantId, payoutCredits: 0, reason }));
    }
  }

  async autoPlayRummyTurn(room) {
    const currentId = room.game.turnOrder[room.game.turnIndex];
    if (room.game.phase === "draw") this.drawRummyCard(room, currentId, room.game.closedDeck.length ? "closed" : "discard");
    const hand = room.game.hands[currentId] || [];
    if (hand.length) {
      const card = hand.splice(Math.floor(Math.random() * hand.length), 1)[0];
      room.game.discardPile.push(card);
    }
    this.sendRummyHand(room, currentId);
    await this.advanceRummyTurn(room);
  }

  async handleRummyDisconnect(participantId) {
    const room = (await this.state.storage.get("room")) || {};
    if (room.mode !== "rummy" || !room.game || room.game.status !== "playing") return;
    if (!room.game.turnOrder.includes(participantId) || room.game.forfeited.includes(participantId)) return;
    room.game.forfeited = [...room.game.forfeited, participantId];
    const wasCurrentTurn = room.game.turnOrder[room.game.turnIndex] === participantId;
    if (!wasCurrentTurn) {
      await this.state.storage.put("room", room);
      this.broadcastRummyState(room);
      return;
    }
    await this.advanceRummyTurn(room);
  }

  publicLudoState(room) {
    const game = room.game;
    return { status: game.status, turnOrder: game.turnOrder, turnIndex: game.turnIndex, phase: game.phase, colors: game.colors, tokens: game.tokens, lastRoll: game.lastRoll, movable: game.movable, forfeited: game.forfeited, stakeCredits: game.stakeCredits, pot: game.pot, phaseEndsAt: game.phaseEndsAt };
  }

  broadcastLudoState(room) {
    this.broadcast(event("LUDO_STATE", this.publicLudoState(room)));
  }

  nextLudoTurnIndex(room, connectedIds) {
    const { turnOrder, forfeited } = room.game;
    for (let step = 1; step <= turnOrder.length; step++) {
      const index = (room.game.turnIndex + step) % turnOrder.length;
      const id = turnOrder[index];
      if (!forfeited.includes(id) && connectedIds.has(id)) return index;
    }
    return -1;
  }

  async advanceLudoTurn(room) {
    const connectedIds = new Set(this.state.getWebSockets().map(s => (s.deserializeAttachment() || {}).participantId).filter(Boolean));
    const nextIndex = this.nextLudoTurnIndex(room, connectedIds);
    if (nextIndex === -1) {
      const survivorId = room.game.turnOrder.find(id => !room.game.forfeited.includes(id));
      await this.settleLudoGame(room, survivorId, "opponents_left");
      return;
    }
    room.game.turnIndex = nextIndex;
    room.game.phase = "await_roll";
    room.game.movable = [];
    room.game.consecutiveSixes = 0;
    room.game.phaseEndsAt = Date.now() + LUDO_TURN_SECONDS * 1000;
    await this.state.storage.put("room", room);
    this.broadcastLudoState(room);
    await this.scheduleAlarm(room);
  }

  async rollLudo(room) {
    const currentId = room.game.turnOrder[room.game.turnIndex];
    const roll = 1 + Math.floor(Math.random() * 6);
    room.game.lastRoll = roll;
    if (roll === 6) {
      room.game.consecutiveSixes += 1;
      if (room.game.consecutiveSixes >= LUDO_MAX_CONSECUTIVE_SIXES) {
        this.broadcast(event("LUDO_ROLLED", { participantId: currentId, roll, forfeitedTripleSix: true }));
        await this.advanceLudoTurn(room);
        return;
      }
    } else {
      room.game.consecutiveSixes = 0;
    }
    const movable = movableTokenIndexes(room.game.tokens[currentId], roll);
    this.broadcast(event("LUDO_ROLLED", { participantId: currentId, roll }));
    if (!movable.length) {
      await this.state.storage.put("room", room);
      await this.advanceLudoTurn(room);
      return;
    }
    if (movable.length === 1) {
      await this.moveLudo(room, currentId, movable[0]);
      return;
    }
    room.game.phase = "await_move";
    room.game.movable = movable;
    room.game.phaseEndsAt = Date.now() + LUDO_TURN_SECONDS * 1000;
    await this.state.storage.put("room", room);
    this.broadcastLudoState(room);
    await this.scheduleAlarm(room);
  }

  async moveLudo(room, participantId, tokenIndex) {
    const roll = room.game.lastRoll;
    const { finishedAll, extraTurn } = applyLudoMove(room.game.tokens, room.game.colors, participantId, tokenIndex, roll);
    if (finishedAll) {
      room.game.status = "game_over";
      room.game.movable = [];
      await this.settleLudoGame(room, participantId);
      return;
    }
    room.game.movable = [];
    if (extraTurn) {
      room.game.phase = "await_roll";
      room.game.phaseEndsAt = Date.now() + LUDO_TURN_SECONDS * 1000;
      await this.state.storage.put("room", room);
      this.broadcastLudoState(room);
      await this.scheduleAlarm(room);
      return;
    }
    await this.state.storage.put("room", room);
    this.broadcastLudoState(room);
    await this.advanceLudoTurn(room);
  }

  async settleLudoGame(room, winnerParticipantId, reason) {
    room.game.status = "game_over";
    await this.state.storage.put("room", room);
    this.broadcastLudoState(room);
    if (!winnerParticipantId) { this.broadcast(event("LUDO_OVER", { winnerParticipantId: null, payoutCredits: 0, reason: reason || "no_winner" })); return; }
    if (room.game.pot > 0) {
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      try {
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        const result = await gamesService.settleLudoRound(room.game.accountByParticipant[winnerParticipantId], room.game.pot, roomRef, room.game.turnOrder, `ld:${room.game.gameId}:settle`);
        this.broadcast(event("LUDO_OVER", { winnerParticipantId, payoutCredits: result?.payout_credits || 0, reason }));
      } catch {
        this.broadcast(event("LUDO_OVER", { winnerParticipantId, payoutCredits: 0, settlementFailed: true, reason }));
      }
    } else {
      this.broadcast(event("LUDO_OVER", { winnerParticipantId, payoutCredits: 0, reason }));
    }
  }

  async autoPlayLudoTurn(room) {
    const currentId = room.game.turnOrder[room.game.turnIndex];
    if (room.game.phase === "await_roll") {
      await this.rollLudo(room);
      return;
    }
    if (room.game.phase === "await_move" && room.game.movable.length) {
      await this.moveLudo(room, currentId, room.game.movable[0]);
      return;
    }
    await this.advanceLudoTurn(room);
  }

  async handleLudoDisconnect(participantId) {
    const room = (await this.state.storage.get("room")) || {};
    if (room.mode !== "ludo" || !room.game || room.game.status !== "playing") return;
    if (!room.game.turnOrder.includes(participantId) || room.game.forfeited.includes(participantId)) return;
    room.game.forfeited = [...room.game.forfeited, participantId];
    const wasCurrentTurn = room.game.turnOrder[room.game.turnIndex] === participantId;
    if (!wasCurrentTurn) {
      await this.state.storage.put("room", room);
      this.broadcastLudoState(room);
      return;
    }
    await this.advanceLudoTurn(room);
  }

  publicTeenPattiState(room) {
    const game = room.game;
    return { status: game.status, turnOrder: game.turnOrder, turnIndex: game.turnIndex, phase: game.phase, folded: game.folded, currentStake: game.currentStake, stakeCredits: game.stakeCredits, pot: game.pot, phaseEndsAt: game.phaseEndsAt };
  }

  broadcastTeenPattiState(room) {
    this.broadcast(event("TEEN_PATTI_STATE", this.publicTeenPattiState(room)));
  }

  sendTeenPattiHand(room, participantId) {
    const target = this.socketFor(participantId);
    if (!target) return;
    const hand = room.game.hands[participantId] || [];
    try { target.send(event("TEEN_PATTI_HAND", { hand })); } catch {}
  }

  activeTeenPattiPlayers(room) {
    return room.game.turnOrder.filter(id => !room.game.folded.includes(id));
  }

  nextTeenPattiTurnIndex(room, connectedIds) {
    const { turnOrder, folded } = room.game;
    for (let step = 1; step <= turnOrder.length; step++) {
      const index = (room.game.turnIndex + step) % turnOrder.length;
      const id = turnOrder[index];
      if (!folded.includes(id) && connectedIds.has(id)) return index;
    }
    return -1;
  }

  async advanceTeenPattiTurn(room) {
    const connectedIds = new Set(this.state.getWebSockets().map(s => (s.deserializeAttachment() || {}).participantId).filter(Boolean));
    const nextIndex = this.nextTeenPattiTurnIndex(room, connectedIds);
    if (nextIndex === -1) {
      const survivorId = this.activeTeenPattiPlayers(room)[0];
      await this.settleTeenPattiGame(room, survivorId, "opponents_left");
      return;
    }
    room.game.turnIndex = nextIndex;
    room.game.phaseEndsAt = Date.now() + TEEN_PATTI_TURN_SECONDS * 1000;
    await this.state.storage.put("room", room);
    this.broadcastTeenPattiState(room);
    await this.scheduleAlarm(room);
  }

  async actTeenPatti(room, participantId, action, socket) {
    const gamesService = room.game.stakeCredits > 0 ? new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch }) : null;
    const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
    if (action === "fold") {
      room.game.folded = [...room.game.folded, participantId];
      const remaining = this.activeTeenPattiPlayers(room);
      if (remaining.length <= 1) {
        await this.settleTeenPattiGame(room, remaining[0] || null, "fold_win");
        return;
      }
      await this.state.storage.put("room", room);
      await this.advanceTeenPattiTurn(room);
      return;
    }
    if (action === "call") {
      if (gamesService) {
        try {
          await gamesService.stakeTeenPatti(room.game.accountByParticipant[participantId], room.game.currentStake, roomRef, `tp:${room.game.gameId}:${participantId}:call:${room.game.callCount}`);
        } catch {
          try { socket.send(event("MESSAGE_REJECTED", { code: "teen_patti_call_failed" })); } catch {}
          return;
        }
        room.game.pot += room.game.currentStake;
      }
      room.game.callCount += 1;
      await this.state.storage.put("room", room);
      await this.advanceTeenPattiTurn(room);
      return;
    }
    if (action === "show") {
      const active = this.activeTeenPattiPlayers(room);
      if (active.length !== 2) { try { socket.send(event("MESSAGE_REJECTED", { code: "teen_patti_show_requires_two" })); } catch {} return; }
      if (gamesService) {
        try {
          await gamesService.stakeTeenPatti(room.game.accountByParticipant[participantId], room.game.currentStake, roomRef, `tp:${room.game.gameId}:${participantId}:call:${room.game.callCount}`);
        } catch {
          try { socket.send(event("MESSAGE_REJECTED", { code: "teen_patti_call_failed" })); } catch {}
          return;
        }
        room.game.pot += room.game.currentStake;
      }
      const opponentId = active.find(id => id !== participantId);
      const result = compareHands(room.game.hands[participantId], room.game.hands[opponentId]);
      const winnerId = result >= 0 ? participantId : opponentId;
      await this.settleTeenPattiGame(room, winnerId, "showdown");
      return;
    }
  }

  async settleTeenPattiGame(room, winnerParticipantId, reason) {
    room.game.status = "game_over";
    const hands = room.game.hands;
    await this.state.storage.put("room", room);
    this.broadcastTeenPattiState(room);
    if (!winnerParticipantId) { this.broadcast(event("TEEN_PATTI_OVER", { winnerParticipantId: null, payoutCredits: 0, reason: reason || "no_winner", hands })); return; }
    if (room.game.pot > 0) {
      const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
      try {
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        const result = await gamesService.settleTeenPattiRound(room.game.accountByParticipant[winnerParticipantId], room.game.pot, roomRef, room.game.turnOrder, `tp:${room.game.gameId}:settle`);
        this.broadcast(event("TEEN_PATTI_OVER", { winnerParticipantId, payoutCredits: result?.payout_credits || 0, reason, hands }));
      } catch {
        this.broadcast(event("TEEN_PATTI_OVER", { winnerParticipantId, payoutCredits: 0, settlementFailed: true, reason, hands }));
      }
    } else {
      this.broadcast(event("TEEN_PATTI_OVER", { winnerParticipantId, payoutCredits: 0, reason, hands }));
    }
  }

  async autoPlayTeenPattiTurn(room) {
    const currentId = room.game.turnOrder[room.game.turnIndex];
    await this.actTeenPatti(room, currentId, "fold", { send: () => {} });
  }

  async handleTeenPattiDisconnect(participantId) {
    const room = (await this.state.storage.get("room")) || {};
    if (room.mode !== "teen_patti" || !room.game || room.game.status !== "playing") return;
    if (!room.game.turnOrder.includes(participantId) || room.game.folded.includes(participantId)) return;
    room.game.folded = [...room.game.folded, participantId];
    const remaining = this.activeTeenPattiPlayers(room);
    if (remaining.length <= 1) {
      await this.settleTeenPattiGame(room, remaining[0] || null, "opponents_left");
      return;
    }
    const wasCurrentTurn = room.game.turnOrder[room.game.turnIndex] === participantId;
    if (!wasCurrentTurn) {
      await this.state.storage.put("room", room);
      this.broadcastTeenPattiState(room);
      return;
    }
    await this.advanceTeenPattiTurn(room);
  }

  publicAndarBaharState(room, participantId) {
    const game = room.game;
    return {
      status: game.status, stakeCredits: game.stakeCredits, pot: game.pot, middleCard: game.middleCard,
      phaseEndsAt: game.phaseEndsAt, andarTotal: game.andarTotal, baharTotal: game.baharTotal,
      andarCount: Object.values(game.bets).filter(b => b.side === "andar").length,
      baharCount: Object.values(game.bets).filter(b => b.side === "bahar").length,
      yourBet: (participantId && game.bets[participantId]?.side) || null,
      andarPile: game.andarPile || null, baharPile: game.baharPile || null, winningSide: game.winningSide || null,
    };
  }

  broadcastAndarBaharState(room) {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      try { socket.send(event("ANDAR_BAHAR_STATE", this.publicAndarBaharState(room, attachment.participantId))); } catch {}
    }
  }

  async resolveAndarBaharRound(room) {
    const { andarPile, baharPile, winningSide } = dealAndarBahar(room.game.deck, room.game.middleCard);
    room.game.andarPile = andarPile;
    room.game.baharPile = baharPile;
    room.game.winningSide = winningSide;
    room.game.status = "game_over";
    const pot = room.game.pot;
    const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
    if (pot > 0) {
      const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
      const winners = Object.entries(room.game.bets).filter(([, bet]) => bet.side === winningSide);
      const totalWinningStake = winners.reduce((sum, [, bet]) => sum + bet.amount, 0);
      const payoutPool = Math.floor(pot * 0.9);
      const houseTake = pot - payoutPool;
      if (winners.length === 0 || totalWinningStake === 0) {
        try { await gamesService.recordAndarBaharHouseTake(roomRef, pot, pot, winningSide); } catch {}
      } else {
        for (const [participantId, bet] of winners) {
          const share = Math.floor(payoutPool * (bet.amount / totalWinningStake));
          if (share <= 0) continue;
          try { await gamesService.settleAndarBaharPayout(bet.accountUserId, bet.amount, share, roomRef, winningSide, `ab:${room.game.gameId}:${participantId}:payout`); } catch {}
        }
        try { await gamesService.recordAndarBaharHouseTake(roomRef, houseTake, pot, winningSide); } catch {}
      }
    }
    await this.state.storage.put("room", room);
    this.broadcastAndarBaharState(room);
    this.broadcast(event("ANDAR_BAHAR_OVER", { andarPile, baharPile, winningSide, pot }));
  }

  publicBiddingState(room, participantId) {
    const game = room.game;
    return {
      status: game.status, pot: game.pot, phaseEndsAt: game.phaseEndsAt,
      bidCount: Object.keys(game.bids).length,
      yourBid: (participantId && game.bids[participantId]?.amount) || null,
      winnerParticipantId: game.winnerParticipantId || null, winningBid: game.winningBid || null,
      bids: game.status === "game_over" ? game.bids : null,
    };
  }

  broadcastBiddingState(room) {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      try { socket.send(event("BID_ROUND_STATE", this.publicBiddingState(room, attachment.participantId))); } catch {}
    }
  }

  async resolveBiddingRound(room) {
    room.game.status = "game_over";
    const pot = room.game.pot;
    const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
    const amounts = new Map();
    for (const [participantId, bid] of Object.entries(room.game.bids)) {
      amounts.set(bid.amount, (amounts.get(bid.amount) || []).concat(participantId));
    }
    const uniqueValues = [...amounts.entries()].filter(([, ids]) => ids.length === 1).map(([amount]) => amount).sort((a, b) => b - a);
    const winningBid = uniqueValues.length ? uniqueValues[0] : null;
    const winnerParticipantId = winningBid !== null ? amounts.get(winningBid)[0] : null;
    room.game.winningBid = winningBid;
    room.game.winnerParticipantId = winnerParticipantId;
    if (pot > 0) {
      const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
      if (!winnerParticipantId) {
        for (const [participantId, bid] of Object.entries(room.game.bids)) {
          try { await gamesService.refundBiddingStake(bid.accountUserId, bid.amount, roomRef, `bid:${room.game.gameId}:${participantId}:refund`); } catch {}
        }
      } else {
        const winningBidInfo = room.game.bids[winnerParticipantId];
        const payoutPool = Math.floor(pot * 0.9);
        const houseTake = pot - payoutPool;
        try { await gamesService.settleBiddingPayout(winningBidInfo.accountUserId, winningBidInfo.amount, payoutPool, roomRef, `bid:${room.game.gameId}:${winnerParticipantId}:payout`); } catch {}
        try { await gamesService.recordBiddingHouseTake(roomRef, houseTake, pot); } catch {}
      }
    }
    await this.state.storage.put("room", room);
    this.broadcastBiddingState(room);
    this.broadcast(event("BID_ROUND_OVER", { winnerParticipantId, winningBid, pot, bids: room.game.bids }));
  }

  publicTugOfWarState(room, participantId) {
    const game = room.game;
    return {
      status: game.status, stakeCredits: game.stakeCredits, pot: game.pot, players: game.players,
      scores: game.scores, targetScore: TUG_OF_WAR_TARGET_SCORE, phaseEndsAt: game.phaseEndsAt,
      question: game.currentQuestionIndex != null ? { question: TUG_OF_WAR_QUESTIONS_REF[game.currentQuestionIndex].q, options: TUG_OF_WAR_QUESTIONS_REF[game.currentQuestionIndex].options } : null,
      yourAnswered: Boolean(participantId && game.answers[participantId]),
      winnerParticipantId: game.winnerParticipantId || null,
    };
  }

  broadcastTugOfWarState(room) {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      try { socket.send(event("TUG_STATE", this.publicTugOfWarState(room, attachment.participantId))); } catch {}
    }
  }

  async resolveTugOfWarQuestion(room) {
    const correctIndex = TUG_OF_WAR_QUESTIONS_REF[room.game.currentQuestionIndex].a;
    const correctAnswers = Object.entries(room.game.answers).filter(([, ans]) => ans.optionIndex === correctIndex).sort((a, b) => a[1].at - b[1].at);
    if (correctAnswers.length) {
      const [winnerParticipantId] = correctAnswers[0];
      room.game.scores[winnerParticipantId] = (room.game.scores[winnerParticipantId] || 0) + 1;
    }
    const [p1, p2] = room.game.players;
    if ((room.game.scores[p1] || 0) >= TUG_OF_WAR_TARGET_SCORE || (room.game.scores[p2] || 0) >= TUG_OF_WAR_TARGET_SCORE) {
      await this.resolveTugOfWarGame(room);
      return;
    }
    const { index, question } = randomTugOfWarQuestion(room.game.askedIndexes);
    room.game.askedIndexes.push(index);
    room.game.currentQuestionIndex = index;
    room.game.answers = {};
    room.game.phaseEndsAt = Date.now() + TUG_OF_WAR_QUESTION_SECONDS * 1000;
    await this.state.storage.put("room", room);
    this.broadcastTugOfWarState(room);
    await this.scheduleAlarm(room);
  }

  async resolveTugOfWarGame(room) {
    room.game.status = "game_over";
    const [p1, p2] = room.game.players;
    const winnerParticipantId = (room.game.scores[p1] || 0) > (room.game.scores[p2] || 0) ? p1 : p2;
    room.game.winnerParticipantId = winnerParticipantId;
    const pot = room.game.pot;
    const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
    if (pot > 0) {
      const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
      const winnerAccountUserId = room.game.accountUserIds[winnerParticipantId];
      const payoutPool = Math.floor(pot * 0.9);
      const houseTake = pot - payoutPool;
      try { await gamesService.settleTugOfWarPayout(winnerAccountUserId, room.game.stakeCredits, payoutPool, roomRef, `tug:${room.game.gameId}:${winnerParticipantId}:payout`); } catch {}
      try { await gamesService.recordTugOfWarHouseTake(roomRef, houseTake, pot); } catch {}
    }
    await this.state.storage.put("room", room);
    this.broadcastTugOfWarState(room);
    this.broadcast(event("TUG_OVER", { winnerParticipantId, scores: room.game.scores, pot }));
  }

  dropConnectFourPiece(board, column, participantId) {
    for (let row = board.length - 1; row >= 0; row--) {
      if (!board[row][column]) { board[row][column] = participantId; return row; }
    }
    return -1;
  }

  connectFourWinCells(board, row, col, participantId) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of directions) {
      const cells = [[row, col]];
      for (const sign of [1, -1]) {
        let r = row + dr * sign, c = col + dc * sign;
        while (r >= 0 && r < board.length && c >= 0 && c < board[0].length && board[r][c] === participantId) {
          cells.push([r, c]);
          r += dr * sign; c += dc * sign;
        }
      }
      if (cells.length >= 4) return cells;
    }
    return null;
  }

  publicConnectFourState(room) {
    const game = room.game;
    return {
      status: game.status, stakeCredits: game.stakeCredits, pot: game.pot, players: game.players,
      board: game.board, turnParticipantId: game.turnParticipantId, phaseEndsAt: game.phaseEndsAt,
      winnerParticipantId: game.winnerParticipantId || null, winningCells: game.winningCells || null,
    };
  }

  broadcastConnectFourState(room) {
    this.broadcast(event("C4_STATE", this.publicConnectFourState(room)));
  }

  async resolveConnectFourGame(room, winnerParticipantId, winningCells) {
    room.game.status = "game_over";
    room.game.winnerParticipantId = winnerParticipantId;
    room.game.winningCells = winningCells;
    const pot = room.game.pot;
    const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
    if (pot > 0) {
      const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
      const winnerAccountUserId = room.game.accountUserIds[winnerParticipantId];
      const payoutPool = Math.floor(pot * 0.9);
      const houseTake = pot - payoutPool;
      try { await gamesService.settleConnectFourPayout(winnerAccountUserId, room.game.stakeCredits, payoutPool, roomRef, `c4:${room.game.gameId}:${winnerParticipantId}:payout`); } catch {}
      try { await gamesService.recordConnectFourHouseTake(roomRef, houseTake, pot); } catch {}
    }
    await this.state.storage.put("room", room);
    this.broadcastConnectFourState(room);
    this.broadcast(event("C4_OVER", { winnerParticipantId, winningCells, pot, reason: winningCells ? "four_in_a_row" : "opponent_forfeit" }));
  }

  async resolveConnectFourDraw(room) {
    room.game.status = "game_over";
    room.game.winnerParticipantId = null;
    const pot = room.game.pot;
    const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
    if (pot > 0 && room.game.stakeCredits > 0) {
      const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
      for (const participantId of room.game.players) {
        const accountUserId = room.game.accountUserIds[participantId];
        if (!accountUserId) continue;
        try { await gamesService.refundConnectFourStake(accountUserId, room.game.stakeCredits, roomRef, `c4:${room.game.gameId}:${participantId}:refund`); } catch {}
      }
    }
    await this.state.storage.put("room", room);
    this.broadcastConnectFourState(room);
    this.broadcast(event("C4_OVER", { winnerParticipantId: null, pot, reason: "draw" }));
  }

  async resolveConnectFourTimeout(room) {
    const loserParticipantId = room.game.turnParticipantId;
    const [p1, p2] = room.game.players;
    const winnerParticipantId = loserParticipantId === p1 ? p2 : p1;
    await this.resolveConnectFourGame(room, winnerParticipantId, null);
  }

  async handleConnectFourDisconnect(participantId) {
    const room = (await this.state.storage.get("room")) || {};
    if (room.mode !== "connect_four" || !room.game || room.game.status !== "playing") return;
    if (!room.game.players.includes(participantId)) return;
    const [p1, p2] = room.game.players;
    const winnerParticipantId = participantId === p1 ? p2 : p1;
    await this.resolveConnectFourGame(room, winnerParticipantId, null);
  }

  publicEliminationReflexState(room, participantId) {
    const game = room.game;
    return {
      status: game.status, stakeCredits: game.stakeCredits, pot: game.pot,
      active: game.active, eliminated: game.eliminated, roundNumber: game.roundNumber,
      armAt: game.status === "waiting_round" ? game.armAt : null,
      yourTapped: Boolean(participantId && game.taps[participantId]),
      winnerParticipantId: game.winnerParticipantId || null,
    };
  }

  broadcastEliminationReflexState(room) {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      try { socket.send(event("ELIM_STATE", this.publicEliminationReflexState(room, attachment.participantId))); } catch {}
    }
  }

  async eliminateReflexPlayer(room, participantId, reason) {
    room.game.active = room.game.active.filter(id => id !== participantId);
    room.game.eliminated.push({ participantId, reason, roundNumber: room.game.roundNumber });
    const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
    if (room.game.stakeCredits > 0) {
      const accountUserId = room.game.accountUserIds[participantId];
      const refundAmount = Math.floor(room.game.stakeCredits / 2);
      if (accountUserId && refundAmount > 0) {
        const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
        try {
          await gamesService.refundEliminationReflexStake(accountUserId, refundAmount, roomRef, `elim:${room.game.gameId}:${participantId}:elim-refund`);
          room.game.pot -= refundAmount;
        } catch {}
      }
    }
    if (room.game.active.length <= 1) {
      await this.finishEliminationReflexGame(room);
    } else {
      this.armNextEliminationReflexRound(room);
      await this.state.storage.put("room", room);
      this.broadcastEliminationReflexState(room);
      await this.scheduleAlarm(room);
    }
  }

  armNextEliminationReflexRound(room) {
    room.game.status = "waiting_round";
    room.game.taps = {};
    room.game.roundNumber += 1;
    room.game.armAt = Date.now() + ELIMINATION_REFLEX_ARM_MIN_MS + Math.floor(Math.random() * (ELIMINATION_REFLEX_ARM_MAX_MS - ELIMINATION_REFLEX_ARM_MIN_MS));
    room.game.phaseEndsAt = room.game.armAt;
  }

  async resolveEliminationReflexRound(room) {
    let slowestParticipantId = null;
    let slowestTime = -1;
    for (const participantId of room.game.active) {
      const tappedAt = room.game.taps[participantId] || Infinity;
      const responseTime = tappedAt === Infinity ? Infinity : tappedAt - room.game.armAt;
      if (responseTime > slowestTime) { slowestTime = responseTime; slowestParticipantId = participantId; }
    }
    await this.eliminateReflexPlayer(room, slowestParticipantId, "slowest");
  }

  async finishEliminationReflexGame(room) {
    room.game.status = "game_over";
    const winnerParticipantId = room.game.active[0] || null;
    room.game.winnerParticipantId = winnerParticipantId;
    const pot = room.game.pot;
    const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
    if (pot > 0 && winnerParticipantId) {
      const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
      const winnerAccountUserId = room.game.accountUserIds[winnerParticipantId];
      const payoutPool = Math.floor(pot * 0.9);
      const houseTake = pot - payoutPool;
      try { await gamesService.settleEliminationReflexPayout(winnerAccountUserId, room.game.stakeCredits, payoutPool, roomRef, `elim:${room.game.gameId}:${winnerParticipantId}:payout`); } catch {}
      try { await gamesService.recordEliminationReflexHouseTake(roomRef, houseTake, pot); } catch {}
    }
    await this.state.storage.put("room", room);
    this.broadcastEliminationReflexState(room);
    this.broadcast(event("ELIM_OVER", { winnerParticipantId, eliminated: room.game.eliminated, pot }));
  }

  publicPredictionPoolState(room, participantId) {
    const game = room.game;
    return {
      status: game.status, stakeCredits: game.stakeCredits, rangeMax: game.rangeMax, pot: game.pot,
      phaseEndsAt: game.phaseEndsAt, guessCount: Object.keys(game.guesses).length,
      yourGuess: (participantId && game.guesses[participantId]?.guess) || null,
      secretNumber: game.status === "game_over" ? game.secretNumber : null,
      winnerParticipantIds: game.winnerParticipantIds || null,
      guesses: game.status === "game_over" ? game.guesses : null,
    };
  }

  broadcastPredictionPoolState(room) {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      try { socket.send(event("PREDICT_STATE", this.publicPredictionPoolState(room, attachment.participantId))); } catch {}
    }
  }

  async resolvePredictionPoolRound(room) {
    room.game.status = "game_over";
    const pot = room.game.pot;
    const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
    const entries = Object.entries(room.game.guesses);
    let winnerParticipantIds = [];
    if (entries.length) {
      let bestDistance = Infinity;
      for (const [, guessInfo] of entries) {
        const distance = Math.abs(guessInfo.guess - room.game.secretNumber);
        if (distance < bestDistance) bestDistance = distance;
      }
      winnerParticipantIds = entries.filter(([, guessInfo]) => Math.abs(guessInfo.guess - room.game.secretNumber) === bestDistance).map(([participantId]) => participantId);
    }
    room.game.winnerParticipantIds = winnerParticipantIds;
    if (pot > 0) {
      const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
      if (!winnerParticipantIds.length) {
        try { await gamesService.recordPredictionPoolHouseTake(roomRef, pot, pot); } catch {}
      } else {
        const payoutPool = Math.floor(pot * 0.9);
        const houseTake = pot - payoutPool;
        const sharePerWinner = Math.floor(payoutPool / winnerParticipantIds.length);
        for (const participantId of winnerParticipantIds) {
          const guessInfo = room.game.guesses[participantId];
          if (sharePerWinner <= 0) continue;
          try { await gamesService.settlePredictionPoolPayout(guessInfo.accountUserId, guessInfo.amount, sharePerWinner, roomRef, `predict:${room.game.gameId}:${participantId}:payout`); } catch {}
        }
        try { await gamesService.recordPredictionPoolHouseTake(roomRef, houseTake, pot); } catch {}
      }
    }
    await this.state.storage.put("room", room);
    this.broadcastPredictionPoolState(room);
    this.broadcast(event("PREDICT_OVER", { secretNumber: room.game.secretNumber, winnerParticipantIds, pot }));
  }

  publicDragonTigerState(room, participantId) {
    const game = room.game;
    return {
      status: game.status, stakeCredits: game.stakeCredits, pot: game.pot,
      phaseEndsAt: game.phaseEndsAt, dragonTotal: game.dragonTotal, tigerTotal: game.tigerTotal,
      dragonCount: Object.values(game.bets).filter(b => b.side === "dragon").length,
      tigerCount: Object.values(game.bets).filter(b => b.side === "tiger").length,
      yourBet: (participantId && game.bets[participantId]?.side) || null,
      dragonCard: game.dragonCard || null, tigerCard: game.tigerCard || null, winningSide: game.winningSide || null,
    };
  }

  broadcastDragonTigerState(room) {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      try { socket.send(event("DRAGON_TIGER_STATE", this.publicDragonTigerState(room, attachment.participantId))); } catch {}
    }
  }

  async resolveDragonTigerRound(room) {
    const { dragonCard, tigerCard, winningSide } = dealDragonTiger(room.game.deck);
    room.game.dragonCard = dragonCard;
    room.game.tigerCard = tigerCard;
    room.game.winningSide = winningSide;
    room.game.status = "game_over";
    const pot = room.game.pot;
    const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
    if (pot > 0) {
      const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
      if (winningSide === "tie") {
        for (const [participantId, bet] of Object.entries(room.game.bets)) {
          if (bet.amount <= 0) continue;
          try { await gamesService.refundDragonTigerStake(bet.accountUserId, bet.amount, roomRef, `dt:${room.game.gameId}:${participantId}:refund`); } catch {}
        }
      } else {
        const winners = Object.entries(room.game.bets).filter(([, bet]) => bet.side === winningSide);
        const totalWinningStake = winners.reduce((sum, [, bet]) => sum + bet.amount, 0);
        const payoutPool = Math.floor(pot * 0.9);
        const houseTake = pot - payoutPool;
        if (winners.length === 0 || totalWinningStake === 0) {
          try { await gamesService.recordDragonTigerHouseTake(roomRef, pot, pot, winningSide); } catch {}
        } else {
          for (const [participantId, bet] of winners) {
            const share = Math.floor(payoutPool * (bet.amount / totalWinningStake));
            if (share <= 0) continue;
            try { await gamesService.settleDragonTigerPayout(bet.accountUserId, bet.amount, share, roomRef, winningSide, `dt:${room.game.gameId}:${participantId}:payout`); } catch {}
          }
          try { await gamesService.recordDragonTigerHouseTake(roomRef, houseTake, pot, winningSide); } catch {}
        }
      }
    }
    await this.state.storage.put("room", room);
    this.broadcastDragonTigerState(room);
    this.broadcast(event("DRAGON_TIGER_OVER", { dragonCard, tigerCard, winningSide, pot }));
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment() || {};
    if (attachment.seated && !attachment.isHost) {
      const room = (await this.state.storage.get("room")) || {};
      room.seatedParticipantIds = (room.seatedParticipantIds || []).filter(id => id !== attachment.participantId);
      if (room.mode === "game" && room.game && room.game.status === "drawing" && room.game.drawerParticipantId === attachment.participantId) {
        await this.state.storage.put("room", room);
        await this.endDrawRound(room);
      } else if (room.mode === "charades" && room.game && room.game.status === "describing" && room.game.performerParticipantId === attachment.participantId) {
        await this.state.storage.put("room", room);
        await this.endCharadesRound(room);
      } else {
        await this.state.storage.put("room", room);
      }
    }
    await this.handleSnakeLadderDisconnect(attachment.participantId);
    await this.handleRummyDisconnect(attachment.participantId);
    await this.handleLudoDisconnect(attachment.participantId);
    await this.handleTeenPattiDisconnect(attachment.participantId);
    await this.handleConnectFourDisconnect(attachment.participantId);
    this.broadcast(event("MEMBER_LEFT", { participantId: attachment.participantId }));
  }

  async handleSnakeLadderDisconnect(participantId) {
    const room = (await this.state.storage.get("room")) || {};
    if (room.mode !== "snake_ladder" || !room.game || room.game.status !== "playing") return;
    if (!room.game.turnOrder.includes(participantId) || room.game.forfeited.includes(participantId)) return;
    room.game.forfeited = [...room.game.forfeited, participantId];
    const wasCurrentTurn = room.game.turnOrder[room.game.turnIndex] === participantId;
    if (!wasCurrentTurn) {
      await this.state.storage.put("room", room);
      this.broadcastSnakeLadderState(room);
      return;
    }
    const connectedIds = new Set(this.state.getWebSockets().map(s => (s.deserializeAttachment() || {}).participantId).filter(Boolean));
    const nextIndex = this.nextSnakeLadderTurnIndex(room, connectedIds);
    if (nextIndex === -1) {
      room.game.status = "game_over";
      await this.state.storage.put("room", room);
      this.broadcastSnakeLadderState(room);
      const survivorId = room.game.turnOrder.find(id => !room.game.forfeited.includes(id));
      if (survivorId && room.game.pot > 0) {
        const roomRef = room.publicId || this.state.id?.toString?.() || "party-room";
        try {
          const gamesService = new GamesService({ url: this.env.SUPABASE_URL, serviceKey: this.env.SUPABASE_SERVICE_ROLE_KEY, fetcher: this.env.FETCHER || fetch });
          const result = await gamesService.settleSnakeLadderRound(room.game.accountByParticipant[survivorId], room.game.pot, roomRef, room.game.turnOrder, `sl:${room.game.gameId}:settle`);
          this.broadcast(event("SNAKE_LADDER_OVER", { winnerParticipantId: survivorId, payoutCredits: result?.payout_credits || 0, reason: "opponents_left" }));
        } catch {
          this.broadcast(event("SNAKE_LADDER_OVER", { winnerParticipantId: survivorId, payoutCredits: 0, settlementFailed: true, reason: "opponents_left" }));
        }
      } else if (survivorId) {
        this.broadcast(event("SNAKE_LADDER_OVER", { winnerParticipantId: survivorId, payoutCredits: 0, reason: "opponents_left" }));
      }
      return;
    }
    room.game.turnIndex = nextIndex;
    room.game.phaseEndsAt = Date.now() + SNAKE_LADDER_TURN_SECONDS * 1000;
    await this.state.storage.put("room", room);
    this.broadcastSnakeLadderState(room);
    await this.scheduleAlarm(room);
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
    if (room.game?.phaseEndsAt) candidates.push(room.game.phaseEndsAt);
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
    if (room.game?.phaseEndsAt && now >= room.game.phaseEndsAt) {
      if (room.mode === "game" && room.game.status === "choosing") {
        await this.beginDrawingPhase(room, room.game.choices[0]);
      } else if (room.mode === "game" && room.game.status === "drawing") {
        await this.endDrawRound(room);
      } else if (room.mode === "snake_ladder" && room.game.status === "playing") {
        await this.rollSnakeLadder(room);
      } else if (room.mode === "rummy" && room.game.status === "playing") {
        await this.autoPlayRummyTurn(room);
      } else if (room.mode === "ludo" && room.game.status === "playing") {
        await this.autoPlayLudoTurn(room);
      } else if (room.mode === "teen_patti" && room.game.status === "playing") {
        await this.autoPlayTeenPattiTurn(room);
      } else if (room.mode === "andar_bahar" && room.game.status === "betting") {
        await this.resolveAndarBaharRound(room);
      } else if (room.mode === "dragon_tiger" && room.game.status === "betting") {
        await this.resolveDragonTigerRound(room);
      } else if (room.mode === "bidding" && room.game.status === "bidding") {
        await this.resolveBiddingRound(room);
      } else if (room.mode === "tug_of_war" && room.game.status === "playing") {
        await this.resolveTugOfWarQuestion(room);
      } else if (room.mode === "connect_four" && room.game.status === "playing") {
        await this.resolveConnectFourTimeout(room);
      } else if (room.mode === "elimination_reflex" && room.game.status === "waiting_round") {
        room.game.status = "armed";
        room.game.phaseEndsAt = Date.now() + ELIMINATION_REFLEX_TAP_WINDOW_SECONDS * 1000;
        await this.state.storage.put("room", room);
        this.broadcastEliminationReflexState(room);
        await this.scheduleAlarm(room);
      } else if (room.mode === "elimination_reflex" && room.game.status === "armed") {
        await this.resolveEliminationReflexRound(room);
      } else if (room.mode === "prediction_pool" && room.game.status === "guessing") {
        await this.resolvePredictionPoolRound(room);
      } else if (room.mode === "charades" && room.game.status === "choosing") {
        await this.beginCluePhase(room, room.game.choices[0]);
      } else if (room.mode === "charades" && room.game.status === "describing") {
        await this.endCharadesRound(room);
      }
      return;
    }
    if (this.state.getWebSockets().length) await this.state.storage.setAlarm(now + HEARTBEAT_STALE_MS);
  }
}
