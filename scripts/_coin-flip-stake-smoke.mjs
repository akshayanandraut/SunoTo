import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5173";
const shotDir = "C:/pvt/SunoTo/scripts/_shots";
mkdirSync(shotDir, { recursive: true });
let shotCount = 0;
const shot = async (page, label) => {
  shotCount += 1;
  const path = `${shotDir}/coinflip-${String(shotCount).padStart(2, "0")}-${label}.png`;
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
  const email = `coinflip-stake-test-${Date.now()}@mailinator.com`;
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

  const grantResp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/apply_wallet_entry`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ target_user_id: userId, credit_delta: 200000, ledger_type: "smoke_test_grant", ledger_reason: "coin flip stake smoke test", ledger_idempotency_key: `smoke-${userId}` }),
  }).catch(() => null);
  console.log("Credit grant attempt status:", grantResp?.status ?? "n/a");

  await page.goto(`${BASE}/#account`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Create an account or sign in", { timeout: 15000 });
  await page.fill("#auth-form [name=email]", email);
  await page.fill("#auth-form [name=password]", password);
  await page.click("#auth-form button.btn-primary");
  await page.waitForTimeout(2000);

  await page.click('nav [data-route="games"]');
  await page.waitForTimeout(800);
  await page.click('[data-route="coin-flip"]');
  await page.waitForTimeout(800);

  const optInBtn = page.locator("#betting-optin-btn");
  if (await optInBtn.count()) {
    console.log("Betting opt-in gate shown — clicking through it first.");
    await shot(page, "optin-gate");
    await optInBtn.click();
    await page.waitForTimeout(1000);
  }

  await page.waitForSelector("#coin-flip-form", { timeout: 10000 });
  await shot(page, "idle");

  const oddsChipTexts = await page.locator(".odds-chips .chip").allTextContents();
  console.log("Odds chip texts:", oddsChipTexts);
  const introLine = await page.locator("text=Bonus-win odds are tuned separately for each stake bracket").count();
  console.log("Intro line present:", introLine > 0);

  const stakeInput = page.locator("#coin-flip-form [name=stakeSparks]");
  await stakeInput.fill("77");
  const valueBeforeSubmit = await stakeInput.inputValue();
  console.log("Stake value right before submit:", valueBeforeSubmit);

  await page.click("#coin-flip-form button.btn-primary");
  // catch the value immediately after the synchronous mid-flip re-render (the "Flipping..." state),
  // since that's the very first render pass that would wipe a hardcoded value="5" literal
  await page.waitForTimeout(300);
  const stakeValueMidFlip = await page.locator("#coin-flip-form [name=stakeSparks]").inputValue().catch(() => "N/A (disabled/detached)");
  console.log("Stake value mid-flip (form likely disabled, checking underlying value attr):", stakeValueMidFlip);

  await page.waitForTimeout(2200);
  await shot(page, "after-flip");
  const stakeValueAfterFlip = await page.locator("#coin-flip-form [name=stakeSparks]").inputValue();
  console.log("Stake value AFTER flip completed:", stakeValueAfterFlip);
  console.log("RESULT: stake persistence", stakeValueAfterFlip === "77" ? "PASS" : "FAIL");

  const resultBanner = await page.locator(".result-banner").textContent().catch(() => "n/a");
  console.log("Result banner:", resultBanner);
  const balanceHasGrouping = /Balance: [\d,]+ Sparks/.test(resultBanner || "") && (resultBanner || "").includes(",");
  console.log("Balance text has thousands grouping:", balanceHasGrouping, "(only meaningful if balance >= 1000 Sparks)");
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
