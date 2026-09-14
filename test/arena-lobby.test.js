import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { ArenaLobbyShard } from "../worker/src/durable/ArenaLobbyShard.js";
import { clearConfigCache } from "../worker/src/services/ConfigService.js";
import { DEFAULT_FLAGS } from "../worker/src/policies/flagPolicy.js";

function makeEnv({ arenaEnabled = true, isPremium = true, maxPlayers = 24 } = {}) {
  return {
    SUPABASE_URL: "https://project",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    FETCHER: async url => {
      if (url.includes("app_config") && url.includes("key=eq.flags")) return Response.json([{ value: { ...DEFAULT_FLAGS, arena_enabled: arenaEnabled }, version: 1, updated_at: "now" }]);
      if (url.includes("app_config") && url.includes("key=eq.arena")) return Response.json([{ value: { maxPlayers }, version: 1, updated_at: "now" }]);
      if (url.includes("profiles")) return Response.json([{ is_premium: isPremium }]);
      throw new Error(`unexpected fetch: ${url}`);
    }
  };
}

function makeState(existingSockets = []) {
  const sockets = existingSockets.slice();
  return { getWebSockets: () => sockets, _sockets: sockets };
}

function makeExistingSocket(participantId) {
  return { deserializeAttachment: () => ({ participantId }), send: () => {}, close: () => {} };
}

function makeSocket(state, attachment) {
  const sent = [];
  const socket = { sent, deserializeAttachment: () => attachment, send: payload => sent.push(JSON.parse(payload)) };
  state._sockets.push(socket);
  return socket;
}

function socketRequest({ participantId = "participant-1", accountUserId = "acct-1" } = {}) {
  return new Request(`https://arena-lobby.internal/socket?participantId=${participantId}&accountUserId=${accountUserId}`, { headers: { Upgrade: "websocket" } });
}

describe("arena lobby join gating", () => {
  it("rejects joining with arena_disabled when the flag is off", async () => {
    clearConfigCache();
    const shard = new ArenaLobbyShard(makeState(), makeEnv({ arenaEnabled: false }));
    const response = await shard.fetch(socketRequest());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "arena_disabled" });
  });

  it("rejects a non-premium account with arena_requires_premium", async () => {
    clearConfigCache();
    const shard = new ArenaLobbyShard(makeState(), makeEnv({ isPremium: false }));
    const response = await shard.fetch(socketRequest());
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "arena_requires_premium" });
  });

  it("rejects a malformed participant id", async () => {
    clearConfigCache();
    const shard = new ArenaLobbyShard(makeState(), makeEnv());
    const response = await shard.fetch(socketRequest({ participantId: "x" }));
    assert.equal(response.status, 400);
  });

  it("rejects joining once the lobby is at the configured capacity", async () => {
    clearConfigCache();
    const existing = Array.from({ length: 5 }, (_, i) => makeExistingSocket(`other-${i}`));
    const shard = new ArenaLobbyShard(makeState(existing), makeEnv({ maxPlayers: 5 }));
    const response = await shard.fetch(socketRequest({ participantId: "newcomer" }));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "arena_lobby_full" });
  });

  it("does not count a reconnecting participant's own stale socket against capacity", async () => {
    clearConfigCache();
    let closed = false;
    const staleSocket = { deserializeAttachment: () => ({ participantId: "participant-1" }), send: () => {}, close: () => { closed = true; } };
    const existing = [staleSocket, ...Array.from({ length: 4 }, (_, i) => makeExistingSocket(`other-${i}`))];
    const shard = new ArenaLobbyShard(makeState(existing), makeEnv({ maxPlayers: 5 }));
    // Capacity math (4 others + the reconnecting participant-1 replacing itself) should pass even though 5
    // sockets exist. We can't reach WebSocketPair() in plain Node, but we can confirm the stale socket gets
    // closed and the function doesn't reject for capacity before it would attempt the actual upgrade.
    try { await shard.fetch(socketRequest({ participantId: "participant-1" })); } catch { /* WebSocketPair is not available outside the Workers runtime */ }
    assert.equal(closed, true);
  });
});

describe("arena lobby relay", () => {
  it("relays valid AVATAR_STATE to everyone else and rejects out-of-bounds coordinates", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    const a = makeSocket(state, { participantId: "a" });
    const b = makeSocket(state, { participantId: "b" });
    await shard.webSocketMessage(a, JSON.stringify({ type: "AVATAR_STATE", payload: { x: 1, y: 0, z: 1, yaw: 0, action: "walk" } }));
    assert.equal(b.sent.length, 1);
    assert.equal(b.sent[0].type, "AVATAR_STATE");
    assert.equal(b.sent[0].payload.participantId, "a");
    assert.equal(a.sent.length, 0, "the sender should not receive its own broadcast");
    b.sent.length = 0;
    await shard.webSocketMessage(a, JSON.stringify({ type: "AVATAR_STATE", payload: { x: 9999, y: 0, z: 1, yaw: 0, action: "walk" } }));
    assert.equal(b.sent.length, 0, "an out-of-bounds position must not be relayed");
  });

  it("stops relaying AVATAR_STATE once arena_enabled flips off mid-session", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv({ arenaEnabled: false }));
    const a = makeSocket(state, { participantId: "a" });
    const b = makeSocket(state, { participantId: "b" });
    await shard.webSocketMessage(a, JSON.stringify({ type: "AVATAR_STATE", payload: { x: 1, y: 0, z: 1, yaw: 0, action: "walk" } }));
    assert.equal(b.sent.length, 0);
  });

  it("relays ARENA_MESSAGE chat and rejects an empty or oversized message", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    const a = makeSocket(state, { participantId: "a" });
    const b = makeSocket(state, { participantId: "b" });
    await shard.webSocketMessage(a, JSON.stringify({ type: "ARENA_MESSAGE", payload: { text: "hey everyone" } }));
    assert.equal(b.sent.length, 1);
    assert.equal(b.sent[0].payload.text, "hey everyone");
    assert.equal(b.sent[0].payload.participantId, "a");
    b.sent.length = 0;
    await shard.webSocketMessage(a, JSON.stringify({ type: "ARENA_MESSAGE", payload: { text: "   " } }));
    await shard.webSocketMessage(a, JSON.stringify({ type: "ARENA_MESSAGE", payload: { text: "x".repeat(301) } }));
    assert.equal(b.sent.length, 0);
  });

  it("broadcasts MEMBER_LEFT to everyone else when a socket closes", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    const a = makeSocket(state, { participantId: "a" });
    const b = makeSocket(state, { participantId: "b" });
    await shard.webSocketClose(a);
    assert.equal(b.sent.length, 1);
    assert.equal(b.sent[0].type, "MEMBER_LEFT");
    assert.equal(b.sent[0].payload.participantId, "a");
  });
});
