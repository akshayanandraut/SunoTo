import { readFileSync } from "node:fs";

const vars = Object.fromEntries(
  readFileSync("worker/.dev.vars", "utf8").split("\n").filter(l => l.includes("=")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).trim()];
  })
);
const ANON_KEY = "sb_publishable_7JwfinWsnZ7W1mAKUi0sFw_pV4j4FjE";
const API_BASE = "http://127.0.0.1:8787/api/v1";
const createdUserIds = [];

async function deleteTestUsers() {
  for (const userId of createdUserIds) {
    await fetch(`${vars.SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: { apikey: vars.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${vars.SUPABASE_SERVICE_ROLE_KEY}` } }).catch(() => {});
  }
}

async function createTestUser(label) {
  const email = `exp-video-${label}-${Date.now()}@mailinator.com`;
  const password = "TestPass123!";
  const res = await fetch(`${vars.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: vars.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${vars.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await res.json();
  await fetch(`${vars.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${data.id}`, {
    method: "PATCH",
    headers: { apikey: vars.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${vars.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ is_premium: true, premium_expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }),
  });
  const signInRes = await fetch(`${vars.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  const signIn = await signInRes.json();
  createdUserIds.push(data.id);
  return { userId: data.id, email, accessToken: signIn.access_token };
}

async function anonSession(label) {
  const res = await fetch(`${API_BASE}/anonymous/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ anonymousId: `exp-video-${label}-${Date.now()}`, localSecret: "x".repeat(24) }),
  });
  return (await res.json()).token;
}

async function search(anonToken, accountToken, preferences) {
  const res = await fetch(`${API_BASE}/match/search`, {
    method: "POST",
    headers: { authorization: `Bearer ${anonToken}`, "x-account-authorization": `Bearer ${accountToken}`, "content-type": "application/json" },
    body: JSON.stringify({ profile: { age: 25, gender: "Male", languages: ["English"] }, preferences, mode: "text" }),
  });
  return (await res.json());
}

function connectChat(sessionId, anonToken) {
  const url = new URL(`${API_BASE}/chat/${sessionId}/socket`);
  url.protocol = "ws:";
  const socket = new WebSocket(url.toString(), ["random-chat.v1", `rc-auth.${anonToken}`]);
  const events = [];
  socket.addEventListener("message", e => events.push(JSON.parse(e.data)));
  return { socket, events };
}

function waitFor(events, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const found = events.find(predicate);
      if (found) return resolve(found);
      if (Date.now() > deadline) return reject(new Error("timeout waiting for event"));
      setTimeout(check, 50);
    };
    check();
  });
}

(async () => {
  const p1 = await createTestUser("p1");
  const p2 = await createTestUser("p2");
  const p1Anon = await anonSession("p1");
  const p2Anon = await anonSession("p2");

  console.log("Both searching for candlelit_dinner...");
  await search(p1Anon, p1.accessToken, { experienceType: "candlelit_dinner" });
  const matchResult = await search(p2Anon, p2.accessToken, { experienceType: "candlelit_dinner" });
  console.log("Matched:", matchResult.status, "mode:", matchResult.mode, "sessionId:", matchResult.sessionId);
  if (matchResult.status !== "matched" || matchResult.mode !== "video") throw new Error("FAIL: expected video match");

  console.log("Connecting both to the chat WebSocket...");
  const c1 = connectChat(matchResult.sessionId, p1Anon);
  const c2 = connectChat(matchResult.sessionId, p2Anon);
  await new Promise((resolve, reject) => { c1.socket.addEventListener("open", resolve); c1.socket.addEventListener("error", reject); });
  await new Promise((resolve, reject) => { c2.socket.addEventListener("open", resolve); c2.socket.addEventListener("error", reject); });

  console.log("Waiting for VIDEO_ELIGIBLE on both sides...");
  const e1 = await waitFor(c1.events, e => e.type === "VIDEO_ELIGIBLE");
  const e2 = await waitFor(c2.events, e => e.type === "VIDEO_ELIGIBLE");
  console.log("p1 got VIDEO_ELIGIBLE:", JSON.stringify(e1));
  console.log("p2 got VIDEO_ELIGIBLE:", JSON.stringify(e2));

  c1.socket.close(); c2.socket.close();
  console.log("\nPASS: Experience-type video date bypasses the video-beta config gate and both sides receive VIDEO_ELIGIBLE.");
})().catch(err => { console.error("TEST FAILED:", err.message); process.exitCode = 1; }).finally(deleteTestUsers);
