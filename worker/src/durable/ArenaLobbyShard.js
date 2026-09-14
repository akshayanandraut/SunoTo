import { validArenaAvatarState, DEFAULT_ARENA_CONFIG } from "../policies/arenaPolicy.js";
import { isPremiumAccount } from "../auth/supabaseUser.js";
import { ConfigService } from "../services/ConfigService.js";
import { RLGG_MIN_PLAYERS, RLGG_ROUND_INTERVAL_SECONDS, RLGG_ROUND_DURATION_SECONDS, RLGG_GREEN_MIN_SECONDS, RLGG_GREEN_MAX_SECONDS, RLGG_RED_MIN_SECONDS, RLGG_RED_MAX_SECONDS, randomPhaseSeconds, movedDuringRedPhase } from "../policies/redLightGreenLightEngine.js";

const MAX_CHAT_LENGTH = 300;

function event(type, payload = {}) {
  return JSON.stringify({ type, payload, ts: Date.now() });
}

function freshRlggState() {
  return { status: "waiting", alive: [], eliminated: [], nextRoundAt: Date.now() + RLGG_ROUND_INTERVAL_SECONDS * 1000, phaseEndsAt: null, roundEndsAt: null, redPhaseStartPositions: {} };
}

// A single global auto-join lobby -- the "total strangers" Arena experience, as opposed to
// PartyRoomShard's arena mode which only runs among people already sharing a party room. Deliberately
// minimal: no seating, no other games -- just presence, movement relay, open chat, and a Red Light /
// Green Light round every 5 minutes (T-099), reusing the exact same bounds/whitelist validation
// PartyRoomShard's arena mode uses (arenaPolicy.js) so the two never drift apart. "Per region"
// sharding (naming lobbies by region instead of "global") is a natural next step once there's enough
// traffic to need it -- not attempted here.
export class ArenaLobbyShard {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.lastPosition = new Map(); // in-memory only, rebuilt from traffic -- never worth persisting
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

  async rlggState() {
    let rlgg = await this.state.storage.get("rlgg");
    if (!rlgg) { rlgg = freshRlggState(); await this.state.storage.put("rlgg", rlgg); await this.scheduleRlggAlarm(rlgg); }
    return rlgg;
  }

  async scheduleRlggAlarm(rlgg) {
    const next = rlgg.status === "waiting" ? rlgg.nextRoundAt : Math.min(rlgg.phaseEndsAt, rlgg.roundEndsAt);
    if (next) await this.state.storage.setAlarm(next);
  }

  async startRlggRound(rlgg) {
    const players = this.memberIds();
    if (players.length < RLGG_MIN_PLAYERS) {
      rlgg.nextRoundAt = Date.now() + RLGG_ROUND_INTERVAL_SECONDS * 1000;
      await this.state.storage.put("rlgg", rlgg);
      await this.scheduleRlggAlarm(rlgg);
      return;
    }
    const now = Date.now();
    const next = { status: "green", alive: players, eliminated: [], roundEndsAt: now + RLGG_ROUND_DURATION_SECONDS * 1000, phaseEndsAt: now + randomPhaseSeconds(RLGG_GREEN_MIN_SECONDS, RLGG_GREEN_MAX_SECONDS) * 1000, redPhaseStartPositions: {}, nextRoundAt: null };
    await this.state.storage.put("rlgg", next);
    this.broadcast(event("RLGG_ROUND_START", { alive: players, status: "green", phaseEndsAt: next.phaseEndsAt }));
    await this.scheduleRlggAlarm(next);
  }

  async advanceRlggPhase(rlgg) {
    const now = Date.now();
    if (rlgg.status === "green") {
      rlgg.status = "red";
      rlgg.redPhaseStartPositions = Object.fromEntries(rlgg.alive.map(id => [id, this.lastPosition.get(id) || null]));
      rlgg.phaseEndsAt = now + randomPhaseSeconds(RLGG_RED_MIN_SECONDS, RLGG_RED_MAX_SECONDS) * 1000;
    } else {
      rlgg.status = "green";
      rlgg.phaseEndsAt = now + randomPhaseSeconds(RLGG_GREEN_MIN_SECONDS, RLGG_GREEN_MAX_SECONDS) * 1000;
    }
    await this.state.storage.put("rlgg", rlgg);
    this.broadcast(event("RLGG_PHASE_CHANGED", { status: rlgg.status, phaseEndsAt: rlgg.phaseEndsAt }));
    await this.scheduleRlggAlarm(rlgg);
  }

  async endRlggRound(rlgg) {
    this.broadcast(event("RLGG_ROUND_OVER", { survivors: rlgg.alive }));
    const ended = freshRlggState();
    await this.state.storage.put("rlgg", ended);
    await this.scheduleRlggAlarm(ended);
  }

  async eliminateRlggPlayer(rlgg, participantId) {
    if (!rlgg.alive.includes(participantId)) return;
    rlgg.alive = rlgg.alive.filter(id => id !== participantId);
    rlgg.eliminated = [...rlgg.eliminated, participantId];
    await this.state.storage.put("rlgg", rlgg);
    this.broadcast(event("RLGG_ELIMINATED", { participantId }));
    if (rlgg.alive.length <= 1) await this.endRlggRound(rlgg);
  }

  async alarm() {
    const rlgg = await this.rlggState();
    const now = Date.now();
    if (rlgg.status === "waiting") {
      if (now >= rlgg.nextRoundAt) await this.startRlggRound(rlgg);
      return;
    }
    if (now >= rlgg.roundEndsAt || rlgg.alive.length <= 1) { await this.endRlggRound(rlgg); return; }
    if (now >= rlgg.phaseEndsAt) await this.advanceRlggPhase(rlgg);
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

    const rlgg = await this.rlggState();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ participantId, accountUserId, joinedAt: Date.now() });

    server.send(event("READY", { participantId, members: this.memberIds(server), maxPlayers: arenaConfig.maxPlayers, rlgg: { status: rlgg.status, alive: rlgg.alive, eliminated: rlgg.eliminated, phaseEndsAt: rlgg.phaseEndsAt, nextRoundAt: rlgg.nextRoundAt } }));
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
      this.lastPosition.set(attachment.participantId, { x: validated.x, z: validated.z });
      const rlgg = await this.state.storage.get("rlgg");
      if (rlgg && (rlgg.status === "green" || rlgg.status === "red") && rlgg.eliminated.includes(attachment.participantId)) return; // frozen for the rest of this round
      if (rlgg?.status === "red" && rlgg.alive.includes(attachment.participantId) && movedDuringRedPhase(rlgg.redPhaseStartPositions[attachment.participantId], validated)) {
        await this.eliminateRlggPlayer(rlgg, attachment.participantId);
      }
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
    this.lastPosition.delete(attachment.participantId);
    const rlgg = await this.state.storage.get("rlgg");
    if (rlgg?.alive.includes(attachment.participantId)) await this.eliminateRlggPlayer(rlgg, attachment.participantId);
    this.broadcast(event("MEMBER_LEFT", { participantId: attachment.participantId }), socket);
  }

  webSocketError(socket) { return this.webSocketClose(socket); }

  broadcast(payload, exclude) {
    for (const socket of this.state.getWebSockets()) if (socket !== exclude) try { socket.send(payload); } catch {}
  }
}
