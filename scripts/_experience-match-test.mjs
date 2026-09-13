import { readFileSync } from "node:fs";

const vars = Object.fromEntries(
  readFileSync("worker/.dev.vars", "utf8").split("\n").filter(l => l.includes("=")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).trim()];
  })
);
const ANON_KEY = "sb_publishable_7JwfinWsnZ7W1mAKUi0sFw_pV4j4FjE";
const API_BASE = "http://127.0.0.1:8787/api/v1";

async function createTestUser(label, { premium = false } = {}) {
  const email = `exp-test-${label}-${Date.now()}@mailinator.com`;
  const password = "TestPass123!";
  const res = await fetch(`${vars.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: vars.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${vars.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await res.json();
  if (premium) {
    await fetch(`${vars.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${data.id}`, {
      method: "PATCH",
      headers: { apikey: vars.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${vars.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ is_premium: true, premium_expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }),
    });
  }
  const signInRes = await fetch(`${vars.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  const signIn = await signInRes.json();
  return { userId: data.id, email, accessToken: signIn.access_token };
}

async function anonSession(label) {
  const res = await fetch(`${API_BASE}/anonymous/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ anonymousId: `exp-${label}-${Date.now()}`, localSecret: "x".repeat(24) }),
  });
  return (await res.json()).token;
}

async function search(anonToken, accountToken, { preferences = {}, mode = "text" } = {}) {
  const res = await fetch(`${API_BASE}/match/search`, {
    method: "POST",
    headers: { authorization: `Bearer ${anonToken}`, "x-account-authorization": accountToken ? `Bearer ${accountToken}` : "", "content-type": "application/json" },
    body: JSON.stringify({ profile: { age: 25, gender: "Male", languages: ["English"] }, preferences, mode }),
  });
  return { status: res.status, data: await res.json() };
}

async function pollResult(anonToken) {
  const res = await fetch(`${API_BASE}/match/result`, { headers: { authorization: `Bearer ${anonToken}` } });
  return { status: res.status, data: await res.json() };
}

(async () => {
  console.log("--- 1. Non-premium account rejected from experience search ---");
  const nonPremium = await createTestUser("nonpremium", { premium: false });
  const nonPremiumAnon = await anonSession("nonpremium");
  const rejected = await search(nonPremiumAnon, nonPremium.accessToken, { preferences: { experienceType: "deep_talk" } });
  console.log("rejected search:", rejected.status, JSON.stringify(rejected.data));
  if (rejected.data.error !== "experience_match_requires_premium") throw new Error("FAIL: expected experience_match_requires_premium");

  console.log("\n--- 2. Two premium accounts with the SAME experience type match each other ---");
  const p1 = await createTestUser("p1", { premium: true });
  const p2 = await createTestUser("p2", { premium: true });
  const p1Anon = await anonSession("p1");
  const p2Anon = await anonSession("p2");
  const search1 = await search(p1Anon, p1.accessToken, { preferences: { experienceType: "deep_talk" } });
  console.log("p1 search result:", search1.status, JSON.stringify(search1.data));
  if (search1.status !== 200 || search1.data.status !== "searching") throw new Error(`FAIL: expected p1 to be searching, got ${JSON.stringify(search1.data)}`);

  const search2 = await search(p2Anon, p2.accessToken, { preferences: { experienceType: "deep_talk" } });
  console.log("p2 search result (should match p1 immediately):", search2.status, JSON.stringify(search2.data));
  if (search2.data.status !== "matched") throw new Error("FAIL: expected p2 to match p1 immediately (same experienceType)");
  if (search2.data.mode !== "text") throw new Error(`FAIL: deep_talk should stay text mode, got ${search2.data.mode}`);

  console.log("\n--- 3. Video-required experience type forces video mode ---");
  const p3 = await createTestUser("p3", { premium: true });
  const p4 = await createTestUser("p4", { premium: true });
  const p3Anon = await anonSession("p3");
  const p4Anon = await anonSession("p4");
  await search(p3Anon, p3.accessToken, { preferences: { experienceType: "candlelit_dinner" }, mode: "text" });
  const videoMatch = await search(p4Anon, p4.accessToken, { preferences: { experienceType: "candlelit_dinner" }, mode: "text" });
  console.log("candlelit_dinner match result:", JSON.stringify(videoMatch.data));
  if (videoMatch.data.mode !== "video") throw new Error(`FAIL: expected forced video mode, got ${videoMatch.data.mode}`);

  console.log("\n--- 4. Different experience types do NOT match each other (strict typing) ---");
  const p5 = await createTestUser("p5", { premium: true });
  const p6 = await createTestUser("p6", { premium: true });
  const p5Anon = await anonSession("p5");
  const p6Anon = await anonSession("p6");
  await search(p5Anon, p5.accessToken, { preferences: { experienceType: "flirty_fun" } });
  const mismatchSearch = await search(p6Anon, p6.accessToken, { preferences: { experienceType: "adventure_chat" } });
  console.log("mismatch search result (should still be searching, not matched to p5):", JSON.stringify(mismatchSearch.data));
  if (mismatchSearch.data.status === "matched" && mismatchSearch.data.peerId) {
    // Confirm it did NOT match p5 specifically by checking p5's own result is still searching
    const p5Result = await pollResult(p5Anon);
    console.log("p5's own result after p6 searched with different type:", JSON.stringify(p5Result.data));
    if (p5Result.data.status === "matched") throw new Error("FAIL: p5 and p6 should not have matched (different experienceType, no timeout yet)");
  }

  console.log("\nPASS: Surprise Match experience-type matching fully verified — premium gate, same-type pairing, forced video for date-style types, strict type isolation.");
})().catch(err => { console.error("TEST FAILED:", err.message); process.exit(1); });
