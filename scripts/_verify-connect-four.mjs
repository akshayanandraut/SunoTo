import fs from "node:fs";
import crypto from "node:crypto";

const envText = fs.readFileSync(new URL("../worker/.dev.vars", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_SECRET = env.ANON_SESSION_SECRET;
const BASE = "http://127.0.0.1:8789/api/v1";

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function signAnonymousToken(claims, secret) {
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = crypto.createHmac("sha256", secret).update(payload).digest();
  return `${payload}.${b64url(sig)}`;
}

async function sbAdmin(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...opts, headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", ...opts.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function createTestUser(email, password) {
  const user = await sbAdmin("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true }) });
  const token = await sbAdmin("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
  return { id: user.id, accessToken: token.access_token };
}

async function fund(userId, credits) {
  await sbAdmin("/rest/v1/rpc/apply_wallet_entry", {
    method: "POST",
    body: JSON.stringify({ target_user_id: userId, credit_delta: credits, ledger_type: "verify_test_topup", ledger_reason: "verify script topup", ledger_idempotency_key: `verify:${userId}:${crypto.randomUUID()}` }),
  });
}

async function main() {
  const stamp = Date.now();
  const hostEmail = `c4-verify-host-${stamp}@example.com`;
  const guestEmail = `c4-verify-guest-${stamp}@example.com`;
  const password = "Verify-Password-123!";

  console.log("creating test users...");
  const host = await createTestUser(hostEmail, password);
  const guest = await createTestUser(guestEmail, password);
  await fund(host.id, 15000);
  await fund(guest.id, 5000);
  console.log("funded host and guest with 5000 credits each");

  const createRes = await fetch(`${BASE}/party-rooms`, {
    method: "POST",
    headers: { authorization: `Bearer ${host.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ roomType: "audio", priceTier: "basic", name: "C4 Verify Room", months: 1 }),
  });
  const room = await createRes.json();
  if (!room.publicId) throw new Error(`room create failed: ${JSON.stringify(room)}`);
  console.log("room created", room.publicId);

  const hostParticipantId = crypto.randomUUID();
  const guestParticipantId = crypto.randomUUID();
  const hostAnon = signAnonymousToken({ v: 1, sub: hostParticipantId, exp: Math.floor(Date.now() / 1000) + 3600 }, ANON_SECRET);
  const guestAnon = signAnonymousToken({ v: 1, sub: guestParticipantId, exp: Math.floor(Date.now() / 1000) + 3600 }, ANON_SECRET);

  function connect({ participantId, accountToken, isHost, anonToken }) {
    const url = new URL(`${BASE}/party-rooms/${room.publicId}/socket`);
    url.protocol = "ws:";
    url.searchParams.set("participantId", participantId);
    url.searchParams.set("accountToken", accountToken);
    if (isHost) url.searchParams.set("isHost", "1");
    url.searchParams.set("roomType", "audio");
    return new WebSocket(url.toString(), ["party-room.v1", `rc-auth.${anonToken}`]);
  }

  const hostSocket = connect({ participantId: hostParticipantId, accountToken: host.accessToken, isHost: true, anonToken: hostAnon });
  const guestSocket = connect({ participantId: guestParticipantId, accountToken: guest.accessToken, isHost: false, anonToken: guestAnon });

  const events = { host: [], guest: [] };
  function wireLog(socket, key) {
    socket.addEventListener("message", ev => {
      const parsed = JSON.parse(ev.data);
      events[key].push(parsed);
      console.log(`[${key}]`, parsed.type, JSON.stringify(parsed.payload).slice(0, 300));
    });
  }
  wireLog(hostSocket, "host");
  wireLog(guestSocket, "guest");

  function waitFor(key, type, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const found0 = events[key].find(e => e.type === type);
      if (found0) return resolve(found0);
      const interval = setInterval(() => {
        const found = events[key].find(e => e.type === type);
        if (found) { clearInterval(interval); clearTimeout(timer); resolve(found); }
      }, 50);
      const timer = setTimeout(() => { clearInterval(interval); reject(new Error(`timeout waiting for ${type} on ${key}`)); }, timeoutMs);
    });
  }
  function send(socket, type, payload = {}) { socket.send(JSON.stringify({ type, payload })); }

  await new Promise((resolve, reject) => { hostSocket.addEventListener("open", resolve); hostSocket.addEventListener("error", reject); });
  await waitFor("host", "READY");
  await new Promise((resolve, reject) => { guestSocket.addEventListener("open", resolve); guestSocket.addEventListener("error", reject); });
  await waitFor("guest", "READY");
  console.log("both sockets connected and READY");

  send(guestSocket, "SEAT_REQUEST", {});
  await waitFor("host", "SEAT_REQUESTED", 5000).catch(() => {});
  send(hostSocket, "SEAT_APPROVE", { targetParticipantId: guestParticipantId });
  await new Promise(r => setTimeout(r, 300));

  send(hostSocket, "MODE_CHANGE", { mode: "connect_four" });
  await waitFor("host", "ROOM_MODE_CHANGED");
  console.log("mode switched to connect_four");

  send(hostSocket, "C4_START", { stakeCredits: 500 });
  const state1 = await waitFor("host", "C4_STATE");
  console.log("game started, pot =", state1.payload.pot, "turn =", state1.payload.turnParticipantId === hostParticipantId ? "host" : "guest");

  function columnOwnerBoard(board) { return board; }

  async function dropAndWait(participantId, socket, key, column) {
    send(socket, "C4_MOVE", { column });
    await new Promise(r => setTimeout(r, 150));
  }

  // Force a horizontal win for host on the bottom row: host plays columns 0,1,2,3, guest plays elsewhere (col 6 each time, different rows won't matter since guest just fills col 6).
  const moves = [
    [hostSocket, "host", 0],
    [guestSocket, "guest", 6],
    [hostSocket, "host", 1],
    [guestSocket, "guest", 6],
    [hostSocket, "host", 2],
    [guestSocket, "guest", 6],
    [hostSocket, "host", 3],
  ];
  let overEvent = null;
  for (const [socket, key, column] of moves) {
    events.host = events.host.filter(e => e.type !== "C4_OVER" && e.type !== "C4_STATE");
    events.guest = events.guest.filter(e => e.type !== "C4_OVER" && e.type !== "C4_STATE");
    send(socket, "C4_MOVE", { column });
    await new Promise(r => setTimeout(r, 300));
    const state = events.host.find(e => e.type === "C4_STATE");
    console.log(`after ${key} plays col ${column}: turn=${state?.payload?.turnParticipantId} status=${state?.payload?.status}`);
    const over = events.host.find(e => e.type === "C4_OVER");
    if (over) { overEvent = over; break; }
  }

  if (!overEvent) { console.log("full host event log:", JSON.stringify(events.host)); throw new Error("expected C4_OVER after four-in-a-row but game did not end"); }
  console.log("C4_OVER payload:", JSON.stringify(overEvent.payload));
  const pot = overEvent.payload.pot;
  const expectedPayout = Math.floor(pot * 0.9);
  console.log(`pot=${pot} expectedPayout(winner, 90%)=${expectedPayout} houseTake(10%)=${pot - expectedPayout}`);
  if (overEvent.payload.winnerParticipantId !== hostParticipantId) throw new Error("expected host to win the horizontal four-in-a-row");
  if (overEvent.payload.reason !== "four_in_a_row") throw new Error(`expected reason four_in_a_row, got ${overEvent.payload.reason}`);

  console.log("VERIFICATION PASSED");
  hostSocket.close();
  guestSocket.close();

  console.log("cleaning up test users...");
  await sbAdmin(`/auth/v1/admin/users/${host.id}`, { method: "DELETE" }).catch(() => {});
  await sbAdmin(`/auth/v1/admin/users/${guest.id}`, { method: "DELETE" }).catch(() => {});
  process.exit(0);
}

main().catch(err => { console.error("VERIFICATION FAILED", err); process.exit(1); });
