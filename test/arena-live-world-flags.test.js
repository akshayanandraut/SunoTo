import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { PartyRoomShard } from "../worker/src/durable/PartyRoomShard.js";
import { clearConfigCache } from "../worker/src/services/ConfigService.js";
import { DEFAULT_FLAGS } from "../worker/src/policies/flagPolicy.js";

function makeEnv({ arenaEnabled, isPremium }) {
  return {
    SUPABASE_URL: "https://project",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    FETCHER: async url => {
      if (url.includes("app_config")) return Response.json([{ value: { ...DEFAULT_FLAGS, arena_enabled: arenaEnabled }, version: 1, updated_at: "now" }]);
      if (url.includes("profiles")) return Response.json([{ is_premium: isPremium }]);
      throw new Error(`unexpected fetch: ${url}`);
    }
  };
}

function makeState() {
  const storage = new Map();
  return {
    id: { toString: () => "room-1" },
    getWebSockets: () => [],
    storage: {
      get: async key => storage.get(key),
      put: async (key, value) => { storage.set(key, value); }
    }
  };
}

function makeSocket(attachment) {
  const sent = [];
  return { sent, deserializeAttachment: () => attachment, send: payload => sent.push(JSON.parse(payload)) };
}

describe("arena mode is gated by arena_enabled and premium, at the Durable Object layer", () => {
  it("rejects MODE_CHANGE to arena with arena_disabled when the flag is off, regardless of premium", async () => {
    clearConfigCache();
    const shard = new PartyRoomShard(makeState(), makeEnv({ arenaEnabled: false, isPremium: true }));
    const socket = makeSocket({ isHost: true, participantId: "p1", accountUserId: "user-1" });
    await shard.webSocketMessage(socket, JSON.stringify({ type: "MODE_CHANGE", payload: { mode: "arena" } }));
    assert.equal(socket.sent.length, 1);
    assert.equal(socket.sent[0].type, "MESSAGE_REJECTED");
    assert.equal(socket.sent[0].payload.code, "arena_disabled");
  });

  it("rejects MODE_CHANGE to arena with arena_requires_premium when the flag is on but the host isn't premium", async () => {
    clearConfigCache();
    const shard = new PartyRoomShard(makeState(), makeEnv({ arenaEnabled: true, isPremium: false }));
    const socket = makeSocket({ isHost: true, participantId: "p1", accountUserId: "user-1" });
    await shard.webSocketMessage(socket, JSON.stringify({ type: "MODE_CHANGE", payload: { mode: "arena" } }));
    assert.equal(socket.sent.length, 1);
    assert.equal(socket.sent[0].payload.code, "arena_requires_premium");
  });

  it("allows MODE_CHANGE to arena when the flag is on and the host is premium", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new PartyRoomShard(state, makeEnv({ arenaEnabled: true, isPremium: true }));
    const socket = makeSocket({ isHost: true, participantId: "p1", accountUserId: "user-1" });
    await shard.webSocketMessage(socket, JSON.stringify({ type: "MODE_CHANGE", payload: { mode: "arena" } }));
    assert.equal(socket.sent.length, 0);
    const room = await state.storage.get("room");
    assert.equal(room.mode, "arena");
  });

  it("a non-host cannot switch the room into arena mode", async () => {
    clearConfigCache();
    const state = makeState();
    const shard = new PartyRoomShard(state, makeEnv({ arenaEnabled: true, isPremium: true }));
    const socket = makeSocket({ isHost: false, participantId: "p2", accountUserId: "user-2" });
    await shard.webSocketMessage(socket, JSON.stringify({ type: "MODE_CHANGE", payload: { mode: "arena" } }));
    assert.equal(socket.sent.length, 0);
    assert.equal(await state.storage.get("room"), undefined);
  });

  it("stops relaying AVATAR_STATE once arena_enabled flips off mid-session, even though the room is still in arena mode", async () => {
    clearConfigCache();
    const state = makeState();
    await state.storage.put("room", { mode: "arena", seatedParticipantIds: ["p1"] });
    const shard = new PartyRoomShard(state, makeEnv({ arenaEnabled: false, isPremium: true }));
    const socket = makeSocket({ isHost: false, seated: true, participantId: "p1", accountUserId: "user-1" });
    let broadcastCalled = false;
    shard.broadcast = () => { broadcastCalled = true; };
    await shard.webSocketMessage(socket, JSON.stringify({ type: "AVATAR_STATE", payload: { x: 1, y: 0, z: 1, yaw: 0, action: "walk" } }));
    assert.equal(broadcastCalled, false);
  });

  it("relays AVATAR_STATE normally while arena_enabled stays on", async () => {
    clearConfigCache();
    const state = makeState();
    await state.storage.put("room", { mode: "arena", seatedParticipantIds: ["p1"] });
    const shard = new PartyRoomShard(state, makeEnv({ arenaEnabled: true, isPremium: true }));
    const socket = makeSocket({ isHost: false, seated: true, participantId: "p1", accountUserId: "user-1" });
    let broadcastPayload = null;
    shard.broadcast = payload => { broadcastPayload = JSON.parse(payload); };
    await shard.webSocketMessage(socket, JSON.stringify({ type: "AVATAR_STATE", payload: { x: 1, y: 0, z: 1, yaw: 0, action: "walk" } }));
    assert.equal(broadcastPayload.type, "AVATAR_STATE");
    assert.equal(broadcastPayload.payload.participantId, "p1");
  });
});
