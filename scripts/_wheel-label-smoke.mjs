import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5173";
const shotDir = "C:/pvt/SunoTo/scripts/_shots";
mkdirSync(shotDir, { recursive: true });
let shotCount = 0;
const shot = async (page, label) => {
  shotCount += 1;
  const path = `${shotDir}/wheel-${String(shotCount).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`screenshot: ${path}`);
};
const consoleErrors = [];
let userId = null;

const browser = await chromium.launch();
const page = await browser.newContext().then(ctx => ctx.newPage());
page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", err => consoleErrors.push(`pageerror: ${err.message}`));

try {
  const email = `wheel-label-test-${Date.now()}@mailinator.com`;
  const password = "TestPass123!";
  const createResp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const createData = await createResp.json();
  if (!createResp.ok) throw new Error(`admin create user failed: ${JSON.stringify(createData)}`);
  userId = createData.id;
  console.log("Test user created:", email);

  // give the fresh user some credits so the spin form is enabled
  const grantResp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/apply_wallet_entry`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ target_user_id: userId, credit_delta: 100000, ledger_type: "smoke_test_grant", ledger_reason: "wheel label smoke test", ledger_idempotency_key: `smoke-${userId}` }),
  }).catch(() => null);
  console.log("Credit grant attempt status:", grantResp?.status ?? "n/a", grantResp?.ok ? await grantResp.clone().text() : "");

  await page.goto(`${BASE}/#account`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Create an account or sign in", { timeout: 15000 });
  await page.fill("#auth-form [name=email]", email);
  await page.fill("#auth-form [name=password]", password);
  await page.click("#auth-form button.btn-primary");
  await page.waitForTimeout(2000);

  // stay in-SPA (no page.goto/hash reload) so the freshly-signed-in session isn't raced by a full reload
  await page.click('nav [data-route="games"]');
  await page.waitForTimeout(800);
  await page.click('[data-route="wheel"]');
  await page.waitForSelector(".wof-wheel-outer", { timeout: 10000 });
  await shot(page, "idle-wheel");

  const labelTexts = await page.locator(".wof-label").allTextContents();
  console.log("On-wheel labels found:", labelTexts);

  const chipSwatches = await page.locator(".odds-chips .chip-swatch").count();
  console.log("Legend swatches found:", chipSwatches);

  const balanceText = await page.locator(".wallet-chip strong").first().textContent().catch(() => "0");
  console.log("Sparks balance:", balanceText);

  if (parseInt((balanceText || "0").replace(/,/g, ""), 10) >= 10) {
    await page.click("#wheel-spin-form button.btn-primary");
    await page.waitForTimeout(4500);
    await shot(page, "after-spin");
    const hubText = await page.locator(".wof-hub").textContent();
    console.log("Hub text after spin:", hubText);
    const resultBanner = await page.locator(".result-banner").textContent().catch(() => "n/a");
    console.log("Result banner:", resultBanner);
  } else {
    console.log("Skipping spin — test account has no Sparks (credit grant RPC likely unavailable). Idle-wheel screenshot still validates the label fix.");
  }
} catch (err) {
  console.error("SMOKE TEST ERROR:", err.message);
  await shot(page, "error-state").catch(() => {});
} finally {
  if (userId) {
    const delResp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    console.log("Delete status:", delResp.status);
  }
  console.log("Console errors captured:", JSON.stringify(consoleErrors, null, 2));
  await browser.close();
}
