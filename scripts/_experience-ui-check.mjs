import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const vars = Object.fromEntries(
  readFileSync("worker/.dev.vars", "utf8").split("\n").filter(l => l.includes("=")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).trim()];
  })
);
const BASE = "http://127.0.0.1:5173";

async function createTestUser(label, premium) {
  const email = `exp-ui-${label}-${Date.now()}@mailinator.com`;
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
  return { email, password };
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/#/account`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const form = page.locator("#auth-form");
  if (await form.count()) {
    await form.locator('input[name="email"]').fill(email);
    await form.locator('input[name="password"]').fill(password);
    await page.evaluate(() => document.querySelector("#auth-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await page.waitForTimeout(2500);
  }
}

(async () => {
  const nonPremium = await createTestUser("nonprem", false);
  const premium = await createTestUser("prem", true);

  const browser = await chromium.launch();

  console.log("--- Non-premium user sees upsell teaser, not the picker ---");
  const page1 = await browser.newContext().then(c => c.newPage());
  await signIn(page1, nonPremium.email, nonPremium.password);
  await page1.goto(`${BASE}/#/onboarding`, { waitUntil: "domcontentloaded" });
  await page1.waitForTimeout(2000);
  const hasUpsell = await page1.locator("#experience-match-upsell").count();
  const hasChips = await page1.locator("[data-experience-type]").count();
  console.log("Non-premium: upsell shown:", hasUpsell > 0, "| chips shown:", hasChips > 0);
  if (hasUpsell === 0 || hasChips > 0) throw new Error("FAIL: non-premium should see upsell, not chips");

  console.log("\n--- Premium user sees the 9 experience-type chips ---");
  const page2 = await browser.newContext().then(c => c.newPage());
  await signIn(page2, premium.email, premium.password);
  await page2.goto(`${BASE}/#/onboarding`, { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(2000);
  const chipCount = await page2.locator("[data-experience-type]").count();
  console.log("Premium: chip count:", chipCount);
  if (chipCount !== 9) throw new Error(`FAIL: expected 9 experience chips, got ${chipCount}`);

  console.log("Selecting 'Candlelit Dinner' chip...");
  await page2.locator('[data-experience-type="candlelit_dinner"]').click();
  const hiddenValue = await page2.locator('input[name="experienceType"]').inputValue();
  console.log("Hidden input value after click:", hiddenValue);
  if (hiddenValue !== "candlelit_dinner") throw new Error("FAIL: hidden input should be set to candlelit_dinner");

  console.log("Clicking again to deselect...");
  await page2.locator('[data-experience-type="candlelit_dinner"]').click();
  const hiddenValueAfterToggleOff = await page2.locator('input[name="experienceType"]').inputValue();
  console.log("Hidden input value after toggle-off:", hiddenValueAfterToggleOff);
  if (hiddenValueAfterToggleOff !== "") throw new Error("FAIL: hidden input should be cleared after toggle-off");

  console.log("\n--- Home page teaser is visible ---");
  await page2.goto(`${BASE}/#/home`, { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(1000);
  const homeText = await page2.locator("body").textContent();
  console.log("Home page mentions 'Surprise Match':", homeText.includes("Surprise Match"));
  if (!homeText.includes("Surprise Match")) throw new Error("FAIL: home page should tease Surprise Match");

  await browser.close();
  console.log("\nPASS: Surprise Match UI fully verified (premium gate, 9 chips, single-select toggle, home page discoverability).");
})().catch(err => { console.error("TEST FAILED:", err.message); process.exit(1); });
