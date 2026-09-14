import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { PartyRoomShard } from "../worker/src/durable/PartyRoomShard.js";
import { MAFIA_ROLES } from "../worker/src/policies/mafiaEngine.js";

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
  const socket = { sent, deserializeAttachment: () => attachment, send: payload => sent.push(JSON.parse(payload)), lastRole: () => sent.filter(m => m.type === "MAFIA_ROLE").at(-1)?.payload };
  state._sockets.push(socket);
  return socket;
}

function makeShard(state) {
  return new PartyRoomShard(state, { SUPABASE_URL: "https://project", SUPABASE_SERVICE_ROLE_KEY: "secret", FETCHER: async () => Response.json([]) });
}

async function setupRoom(playerCount) {
  const state = makeState();
  const players = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  await state.storage.put("room", { mode: "mafia", hostUserId: "host", seatedParticipantIds: players, coHostAccountIds: [], preauthorizedAccountIds: [], bannedAccountIds: [] });
  const shard = makeShard(state);
  const sockets = {};
  players.forEach((id, i) => { sockets[id] = makeSocket(state, { isHost: i === 0, seated: true, participantId: id, accountUserId: `acct-${id}` }); });
  return { state, shard, players, sockets };
}

describe("mafia game start", () => {
  it("rejects starting with fewer than 5 players", async () => {
    const { shard, sockets } = await setupRoom(4);
    await shard.webSocketMessage(sockets.p0, JSON.stringify({ type: "MAFIA_START", payload: {} }));
    assert.equal(sockets.p0.sent.at(-1).payload.code, "mafia_needs_five_to_ten_players");
  });

  it("assigns exactly one mafia, one detective, and the rest villagers to 6 players", async () => {
    const { state, shard, players, sockets } = await setupRoom(6);
    await shard.webSocketMessage(sockets.p0, JSON.stringify({ type: "MAFIA_START", payload: {} }));
    const room = await state.storage.get("room");
    assert.equal(room.game.status, "night");
    const roles = Object.values(room.game.roles);
    assert.equal(roles.filter(r => r === MAFIA_ROLES.MAFIA).length, 1);
    assert.equal(roles.filter(r => r === MAFIA_ROLES.DETECTIVE).length, 1);
    assert.equal(roles.filter(r => r === MAFIA_ROLES.VILLAGER).length, 4);
    for (const id of players) assert.ok(sockets[id].lastRole(), `${id} should have received a private role`);
  });

  it("only the host can start the game", async () => {
    const { state, shard, sockets } = await setupRoom(5);
    await shard.webSocketMessage(sockets.p1, JSON.stringify({ type: "MAFIA_START", payload: {} }));
    assert.equal((await state.storage.get("room")).game, undefined);
  });
});

describe("mafia full round flow", () => {
  it("plays a night kill, a day vote, and reaches a winner", async () => {
    const { state, shard, players, sockets } = await setupRoom(5);
    await shard.webSocketMessage(sockets.p0, JSON.stringify({ type: "MAFIA_START", payload: {} }));
    let room = await state.storage.get("room");
    const mafiaId = players.find(id => room.game.roles[id] === MAFIA_ROLES.MAFIA);
    const villagerIds = players.filter(id => room.game.roles[id] !== MAFIA_ROLES.MAFIA);
    const victim = villagerIds[0];

    await shard.webSocketMessage(sockets[mafiaId], JSON.stringify({ type: "MAFIA_NIGHT_ACTION", payload: { targetId: victim } }));
    room = await state.storage.get("room");
    assert.equal(room.game.status, "day_discussion");
    assert.ok(!room.game.alive.includes(victim));
    assert.equal(room.game.eliminated.at(-1).participantId, victim);

    room.game.status = "day_vote";
    await state.storage.put("room", room);
    const remainingVillagers = villagerIds.filter(id => id !== victim);
    for (const voter of room.game.alive) {
      await shard.webSocketMessage(sockets[voter], JSON.stringify({ type: "MAFIA_VOTE", payload: { targetId: mafiaId } }));
    }
    room = await state.storage.get("room");
    assert.equal(room.game.status, "game_over");
    assert.equal(room.game.winner, "villagers");
    assert.ok(!room.game.alive.includes(mafiaId));
  });

  it("a dead player's chat is dropped, and mafia night chat stays private to mafia teammates", async () => {
    const { state, shard, players, sockets } = await setupRoom(8);
    await shard.webSocketMessage(sockets.p0, JSON.stringify({ type: "MAFIA_START", payload: {} }));
    const room = await state.storage.get("room");
    const mafiaIds = players.filter(id => room.game.roles[id] === MAFIA_ROLES.MAFIA);
    assert.ok(mafiaIds.length >= 2, "8 players should assign at least 2 mafia");
    const [speaker, teammate] = mafiaIds;
    const villagerId = players.find(id => room.game.roles[id] !== MAFIA_ROLES.MAFIA);
    for (const s of Object.values(sockets)) s.sent.length = 0;
    await shard.webSocketMessage(sockets[villagerId], JSON.stringify({ type: "ROOM_MESSAGE", payload: { text: "can we talk at night?" } }));
    for (const id of players) assert.ok(!sockets[id].sent.some(m => m.type === "ROOM_MESSAGE"), `${id} should not receive villager chat during the night`);
    await shard.webSocketMessage(sockets[speaker], JSON.stringify({ type: "ROOM_MESSAGE", payload: { text: "let's get the doctor" } }));
    assert.ok(sockets[teammate].sent.some(m => m.type === "ROOM_MESSAGE" && m.payload.mafiaOnly), "the mafia teammate should receive the private night message");
    assert.ok(!sockets[villagerId].sent.some(m => m.type === "ROOM_MESSAGE"), "villagers must never see mafia night chat");
  });

  it("removes a disconnected player from play and can trigger a win", async () => {
    const { state, shard, players, sockets } = await setupRoom(5);
    await shard.webSocketMessage(sockets.p0, JSON.stringify({ type: "MAFIA_START", payload: {} }));
    const room = await state.storage.get("room");
    const mafiaId = players.find(id => room.game.roles[id] === MAFIA_ROLES.MAFIA);
    const attachment = sockets[mafiaId].deserializeAttachment();
    state._sockets.splice(state._sockets.indexOf(sockets[mafiaId]), 1);
    await shard.webSocketClose(sockets[mafiaId]);
    const after = await state.storage.get("room");
    assert.ok(!after.game.alive.includes(mafiaId));
    assert.equal(after.game.status, "game_over");
    assert.equal(after.game.winner, "villagers");
  });
});
