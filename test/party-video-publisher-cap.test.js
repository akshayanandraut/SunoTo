import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { PartyRoomShard } from "../worker/src/durable/PartyRoomShard.js";
import { MAX_VIDEO_PUBLISHERS } from "../worker/src/policies/partyRoomPolicy.js";

function makeState() {
  const storage = new Map();
  const sockets = [];
  return {
    id: { toString: () => "room-1" },
    getWebSockets: () => sockets,
    _sockets: sockets,
    storage: {
      get: async key => storage.get(key),
      put: async (key, value) => { storage.set(key, value); },
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

let analyticsCalls;
function makeShard(state) {
  analyticsCalls = [];
  return new PartyRoomShard(state, {
    SUPABASE_URL: "https://project",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    FETCHER: async (url, options) => { analyticsCalls.push({ url, body: JSON.parse(options.body) }); return Response.json(true); }
  });
}

async function setupRoom(playerCount) {
  const state = makeState();
  const players = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  await state.storage.put("room", { mode: "audio_video", hostUserId: "host", seatedParticipantIds: players, coHostAccountIds: [], preauthorizedAccountIds: [], bannedAccountIds: [], videoPublisherIds: [] });
  const shard = makeShard(state);
  const sockets = {};
  players.forEach((id, i) => { sockets[id] = makeSocket(state, { isHost: i === 0, seated: true, participantId: id, accountUserId: `acct-${id}` }); });
  return { state, shard, players, sockets };
}

describe("party room video publisher cap", () => {
  it("accepts publishers up to the cap and broadcasts PARTY_VIDEO_PUBLISHER_JOINED", async () => {
    const { state, shard, players, sockets } = await setupRoom(6);
    for (let i = 0; i < MAX_VIDEO_PUBLISHERS; i++) {
      await shard.webSocketMessage(sockets[players[i]], JSON.stringify({ type: "VIDEO_START", payload: {} }));
    }
    const room = await state.storage.get("room");
    assert.equal(room.videoPublisherIds.length, MAX_VIDEO_PUBLISHERS);
    const lastJoiner = players[MAX_VIDEO_PUBLISHERS - 1];
    assert.ok(sockets[players[0]].sent.some(m => m.type === "PARTY_VIDEO_PUBLISHER_JOINED" && m.payload.participantId === lastJoiner));
  });

  it("rejects a publisher past the cap with video_publisher_cap_reached and records analytics", async () => {
    const { state, shard, players, sockets } = await setupRoom(6);
    for (let i = 0; i < MAX_VIDEO_PUBLISHERS; i++) {
      await shard.webSocketMessage(sockets[players[i]], JSON.stringify({ type: "VIDEO_START", payload: {} }));
    }
    const fifth = players[MAX_VIDEO_PUBLISHERS];
    await shard.webSocketMessage(sockets[fifth], JSON.stringify({ type: "VIDEO_START", payload: {} }));
    const room = await state.storage.get("room");
    assert.equal(room.videoPublisherIds.length, MAX_VIDEO_PUBLISHERS);
    assert.ok(!room.videoPublisherIds.includes(fifth));
    assert.equal(sockets[fifth].sent.at(-1).payload.code, "video_publisher_cap_reached");
    assert.ok(analyticsCalls.some(call => call.body.target_event_name === "party_video_publisher_cap_hit"));
  });

  it("frees a slot when a publisher explicitly stops", async () => {
    const { state, shard, players, sockets } = await setupRoom(6);
    for (let i = 0; i < MAX_VIDEO_PUBLISHERS; i++) {
      await shard.webSocketMessage(sockets[players[i]], JSON.stringify({ type: "VIDEO_START", payload: {} }));
    }
    await shard.webSocketMessage(sockets[players[0]], JSON.stringify({ type: "VIDEO_STOP", payload: {} }));
    let room = await state.storage.get("room");
    assert.equal(room.videoPublisherIds.length, MAX_VIDEO_PUBLISHERS - 1);
    const fifth = players[MAX_VIDEO_PUBLISHERS];
    await shard.webSocketMessage(sockets[fifth], JSON.stringify({ type: "VIDEO_START", payload: {} }));
    room = await state.storage.get("room");
    assert.equal(room.videoPublisherIds.length, MAX_VIDEO_PUBLISHERS);
    assert.ok(room.videoPublisherIds.includes(fifth));
  });

  it("frees a slot and notifies everyone when a publisher disconnects", async () => {
    const { state, shard, players, sockets } = await setupRoom(6);
    await shard.webSocketMessage(sockets[players[0]], JSON.stringify({ type: "VIDEO_START", payload: {} }));
    state._sockets.splice(state._sockets.indexOf(sockets[players[0]]), 1);
    await shard.webSocketClose(sockets[players[0]]);
    const room = await state.storage.get("room");
    assert.equal(room.videoPublisherIds.length, 0);
    assert.ok(sockets[players[1]].sent.some(m => m.type === "PARTY_VIDEO_PUBLISHER_LEFT" && m.payload.participantId === players[0]));
  });

  it("does not double-count a participant who sends VIDEO_START twice", async () => {
    const { state, shard, players, sockets } = await setupRoom(3);
    await shard.webSocketMessage(sockets[players[0]], JSON.stringify({ type: "VIDEO_START", payload: {} }));
    await shard.webSocketMessage(sockets[players[0]], JSON.stringify({ type: "VIDEO_START", payload: {} }));
    const room = await state.storage.get("room");
    assert.equal(room.videoPublisherIds.length, 1);
  });
});
