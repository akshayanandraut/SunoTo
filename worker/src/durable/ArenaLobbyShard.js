import { validArenaAvatarState, DEFAULT_ARENA_CONFIG } from "../policies/arenaPolicy.js";
import { isPremiumAccount } from "../auth/supabaseUser.js";
import { ConfigService } from "../services/ConfigService.js";

const MAX_CHAT_LENGTH = 300;

function event(type, payload = {}) {
  return JSON.stringify({ type, payload, ts: Date.now() });
}

// A single global auto-join lobby -- the "total strangers" Arena experience, as opposed to
// PartyRoomShard's arena mode which only runs among people already sharing a party room. Deliberately
// minimal: no seating, no games, no chat history -- just presence, movement relay, and open chat,
// reusing the exact same bounds/whitelist validation PartyRoomShard's arena mode uses (arenaPolicy.js)
// so the two never drift apart. "Per region" sharding (naming lobbies by region instead of "global")
// is a natural next step once there's enough traffic to need it -- not attempted here.
export class ArenaLobbyShard {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async flags() {
    try { return (await new ConfigService(this.env, this.env.FETCHER || fetch).flags()).config; } catch { return null; }
  }

  async arenaConfig() {
    try { return (await new ConfigService(this.env, this.env.FETCHER || fetch).arena()).config; } catch { return DEFAULT_ARENA_CONFIG; }
  }

  memberIds(exclude) {
    return this.state.getWebSockets().filter(socket => socket !== exclude).map(socket => (socket.deserializeAttachment() || {}).participantId).filter(Boolean);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/count") {
      return Response.json({ count: this.state.getWebSockets().length });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "websocket_upgrade_required" }, { status: 426 });
    }

    const participantId = url.searchParams.get("participantId");
    const accountUserId = url.searchParams.get("accountUserId") || null;
    if (!participantId || !/^[a-zA-Z0-9_-]{8,100}$/.test(participantId)) {
      return Response.json({ error: "invalid_participant" }, { status: 400 });
    }

    const flags = await this.flags();
    if (!flags?.arena_enabled) return Response.json({ error: "arena_disabled" }, { status: 503 });
    if (!await isPremiumAccount(this.env, accountUserId, this.env.FETCHER || fetch)) {
      return Response.json({ error: "arena_requires_premium" }, { status: 403 });
    }

    // A reconnect (refresh, flaky network) shouldn't permanently eat a capacity slot -- close any
    // stale socket for this same participant before counting who else is currently connected.
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      if (attachment.participantId === participantId) { try { socket.close(4001, "replaced_by_new_connection"); } catch {} }
    }

    const arenaConfig = await this.arenaConfig();
    const connectedCount = this.state.getWebSockets().filter(socket => (socket.deserializeAttachment() || {}).participantId !== participantId).length;
    if (connectedCount >= arenaConfig.maxPlayers) {
      return Response.json({ error: "arena_lobby_full" }, { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ participantId, accountUserId, joinedAt: Date.now() });

    server.send(event("READY", { participantId, members: this.memberIds(server), maxPlayers: arenaConfig.maxPlayers }));
    this.broadcast(event("MEMBER_JOINED", { participantId }), server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, raw) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    const attachment = socket.deserializeAttachment() || {};
    const { type, payload = {} } = parsed;

    if (type === "AVATAR_STATE") {
      const validated = validArenaAvatarState(payload);
      if (!validated) return;
      const flags = await this.flags();
      if (!flags?.arena_enabled) return;
      this.broadcast(event("AVATAR_STATE", { participantId: attachment.participantId, ...validated }), socket);
      return;
    }

    if (type === "ARENA_MESSAGE" && typeof payload.text === "string" && payload.text.trim().length && payload.text.length <= MAX_CHAT_LENGTH) {
      this.broadcast(event("ARENA_MESSAGE", { participantId: attachment.participantId, text: payload.text.trim() }), socket);
      return;
    }
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment() || {};
    this.broadcast(event("MEMBER_LEFT", { participantId: attachment.participantId }), socket);
  }

  webSocketError(socket) { return this.webSocketClose(socket); }

  broadcast(payload, exclude) {
    for (const socket of this.state.getWebSockets()) if (socket !== exclude) try { socket.send(payload); } catch {}
  }
}
