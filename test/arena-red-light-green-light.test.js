import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { ArenaLobbyShard } from "../worker/src/durable/ArenaLobbyShard.js";
import { clearConfigCache } from "../worker/src/services/ConfigService.js";
import { DEFAULT_FLAGS } from "../worker/src/policies/flagPolicy.js";

function makeEnv() {
  return {
    SUPABASE_URL: "https://project",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    FETCHER: async url => {
      if (url.includes("app_config") && url.includes("key=eq.flags")) return Response.json([{ value: { ...DEFAULT_FLAGS, arena_enabled: true }, version: 1, updated_at: "now" }]);
      if (url.includes("app_config") && url.includes("key=eq.arena")) return Response.json([{ value: { maxPlayers: 24 }, version: 1, updated_at: "now" }]);
      throw new Error(`unexpected fetch: ${url}`);
    }
  };
}

function makeState() {
  const storageMap = new Map();
  const sockets = [];
  return {
    getWebSockets: () => sockets,
    _sockets: sockets,
    storage: {
      get: async key => storageMap.get(key),
      put: async (key, value) => { storageMap.set(key, value); },
      setAlarm: async () => {}
    }
  };
}

function makeSocket(state, attachment) {
  const sent = [];
  const socket = { sent, deserializeAttachment: () => attachment, send: payload => sent.push(JSON.parse(payload)) };
  state._sockets.push(socket);
  return socket;
}

describe("red light green light round lifecycle", () => {
  it("skips starting a round with fewer than 2 connected players and reschedules", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    await state.storage.put("rlgg", { status: "waiting", alive: [], eliminated: [], nextRoundAt: Date.now() - 1000, phaseEndsAt: null, roundEndsAt: null, redPhaseStartPositions: {} });
    makeSocket(state, { participantId: "solo" });
    await shard.alarm();
    const rlgg = await state.storage.get("rlgg");
    assert.equal(rlgg.status, "waiting");
    assert.ok(rlgg.nextRoundAt > Date.now());
  });

  it("starts a green round when 2+ players are connected and the interval has elapsed", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    await state.storage.put("rlgg", { status: "waiting", alive: [], eliminated: [], nextRoundAt: Date.now() - 1000, phaseEndsAt: null, roundEndsAt: null, redPhaseStartPositions: {} });
    const a = makeSocket(state, { participantId: "a" });
    const b = makeSocket(state, { participantId: "b" });
    await shard.alarm();
    const rlgg = await state.storage.get("rlgg");
    assert.equal(rlgg.status, "green");
    assert.deepEqual(rlgg.alive.sort(), ["a", "b"]);
    assert.ok(a.sent.some(m => m.type === "RLGG_ROUND_START"));
    assert.ok(b.sent.some(m => m.type === "RLGG_ROUND_START"));
  });

  it("eliminates a player who moves during the red phase and relays their final position once", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    const a = makeSocket(state, { participantId: "a" });
    const b = makeSocket(state, { participantId: "b" });
    const c = makeSocket(state, { participantId: "c" });
    await state.storage.put("rlgg", { status: "red", alive: ["a", "b", "c"], eliminated: [], nextRoundAt: null, phaseEndsAt: Date.now() + 3000, roundEndsAt: Date.now() + 30000, redPhaseStartPositions: { a: { x: 0, z: 0 }, b: { x: 5, z: 5 }, c: { x: 9, z: 9 } } });
    await shard.webSocketMessage(a, JSON.stringify({ type: "AVATAR_STATE", payload: { x: 4, y: 0, z: 0, yaw: 0, action: "sprint" } }));
    const rlgg = await state.storage.get("rlgg");
    assert.deepEqual(rlgg.alive.sort(), ["b", "c"]);
    assert.deepEqual(rlgg.eliminated, ["a"]);
    assert.ok(b.sent.some(m => m.type === "RLGG_ELIMINATED" && m.payload.participantId === "a"));
    assert.ok(b.sent.some(m => m.type === "AVATAR_STATE" && m.payload.participantId === "a"), "the eliminated player's final caught position should still be shown once");
  });

  it("does not eliminate a player who stays still during the red phase", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    const a = makeSocket(state, { participantId: "a" });
    makeSocket(state, { participantId: "b" });
    await state.storage.put("rlgg", { status: "red", alive: ["a", "b"], eliminated: [], nextRoundAt: null, phaseEndsAt: Date.now() + 3000, roundEndsAt: Date.now() + 30000, redPhaseStartPositions: { a: { x: 0, z: 0 }, b: { x: 5, z: 5 } } });
    await shard.webSocketMessage(a, JSON.stringify({ type: "AVATAR_STATE", payload: { x: 0.1, y: 0, z: 0.1, yaw: 2, action: "idle" } }));
    const rlgg = await state.storage.get("rlgg");
    assert.deepEqual(rlgg.alive.sort(), ["a", "b"]);
  });

  it("freezes an eliminated player -- their movement stops being relayed for the rest of the round", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    const a = makeSocket(state, { participantId: "a" });
    const b = makeSocket(state, { participantId: "b" });
    await state.storage.put("rlgg", { status: "green", alive: ["b"], eliminated: ["a"], nextRoundAt: null, phaseEndsAt: Date.now() + 3000, roundEndsAt: Date.now() + 30000, redPhaseStartPositions: {} });
    b.sent.length = 0;
    await shard.webSocketMessage(a, JSON.stringify({ type: "AVATAR_STATE", payload: { x: 20, y: 0, z: 20, yaw: 0, action: "sprint" } }));
    assert.equal(b.sent.length, 0);
  });

  it("ends the round once only one player remains alive", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    const a = makeSocket(state, { participantId: "a" });
    const b = makeSocket(state, { participantId: "b" });
    await state.storage.put("rlgg", { status: "red", alive: ["a", "b"], eliminated: [], nextRoundAt: null, phaseEndsAt: Date.now() + 3000, roundEndsAt: Date.now() + 30000, redPhaseStartPositions: { a: { x: 0, z: 0 }, b: { x: 5, z: 5 } } });
    await shard.webSocketMessage(a, JSON.stringify({ type: "AVATAR_STATE", payload: { x: 4, y: 0, z: 0, yaw: 0, action: "sprint" } }));
    const rlgg = await state.storage.get("rlgg");
    assert.equal(rlgg.status, "waiting");
    assert.ok(b.sent.some(m => m.type === "RLGG_ROUND_OVER" && m.payload.survivors.includes("b")));
  });

  it("counts a disconnect during an active round the same as being caught", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    const a = makeSocket(state, { participantId: "a" });
    const b = makeSocket(state, { participantId: "b" });
    await state.storage.put("rlgg", { status: "green", alive: ["a", "b"], eliminated: [], nextRoundAt: null, phaseEndsAt: Date.now() + 3000, roundEndsAt: Date.now() + 30000, redPhaseStartPositions: {} });
    state._sockets.splice(state._sockets.indexOf(a), 1);
    await shard.webSocketClose(a);
    const rlgg = await state.storage.get("rlgg");
    assert.equal(rlgg.status, "waiting");
    assert.ok(b.sent.some(m => m.type === "RLGG_ROUND_OVER" && m.payload.survivors.includes("b")));
  });

  it("advances from green to red to green again via alarm(), and eventually ends the round on time", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new ArenaLobbyShard(state, makeEnv());
    makeSocket(state, { participantId: "a" });
    makeSocket(state, { participantId: "b" });
    const now = Date.now();
    await state.storage.put("rlgg", { status: "green", alive: ["a", "b"], eliminated: [], nextRoundAt: null, phaseEndsAt: now - 10, roundEndsAt: now + 60000, redPhaseStartPositions: {} });
    await shard.alarm();
    let rlgg = await state.storage.get("rlgg");
    assert.equal(rlgg.status, "red");
    rlgg.phaseEndsAt = Date.now() - 10;
    await state.storage.put("rlgg", rlgg);
    await shard.alarm();
    rlgg = await state.storage.get("rlgg");
    assert.equal(rlgg.status, "green");
    rlgg.roundEndsAt = Date.now() - 10;
    await state.storage.put("rlgg", rlgg);
    await shard.alarm();
    rlgg = await state.storage.get("rlgg");
    assert.equal(rlgg.status, "waiting");
  });
});
