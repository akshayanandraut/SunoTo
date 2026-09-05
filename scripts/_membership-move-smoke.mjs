import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5173";
const shotDir = "C:/pvt/SunoTo/scripts/_shots";
mkdirSync(shotDir, { recursive: true });
let shotCount = 0;
const shot = async (page, label) => {
  shotCount += 1;
  const path = `${shotDir}/mm-${String(shotCount).padStart(2, "0")}-${label}.png`;
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
  const email = `membership-move-test-${Date.now()}@mailinator.com`;
  const password = "TestPass123!";
  console.log("Creating pre-confirmed test user via Supabase admin API...");
  const createResp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const createData = await createResp.json();
  if (!createResp.ok) throw new Error(`admin create user failed: ${JSON.stringify(createData)}`);
  userId = createData.id;
  console.log("Test user created:", email);

  await page.goto(`${BASE}/#account`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Create an account or sign in", { timeout: 15000 });
  await page.fill("#auth-form [name=email]", email);
  await page.fill("#auth-form [name=password]", password);
  await page.click("#auth-form button.btn-primary");
  await page.waitForTimeout(2500);
  console.log("URL after sign-in:", page.url());
  await shot(page, "after-signin");

  await page.goto(`${BASE}/#account`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await shot(page, "account-forced");
  const accountBody = await page.locator("body").textContent();
  const accountHasMembership = accountBody.includes("Membership") && accountBody.includes("Days of platform access") && accountBody.includes("Redeem Sparks for days");
  const accountHasPlanCards = await page.locator("[data-membership-plan]").count();
  const accountHasAutoDebit = await page.locator("#auto-debit-premium-toggle").count();
  console.log("On /account: membership block present:", accountHasMembership, "| plan cards:", accountHasPlanCards, "| auto-debit toggle:", accountHasAutoDebit);

  await page.goto(`${BASE}/#games`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await shot(page, "games-forced");
  const gamesBody = await page.locator("body").textContent();
  const gamesHasMembership = gamesBody.includes("Days of platform access") || gamesBody.includes("Redeem Sparks for days");
  const gamesHasPlanCards = await page.locator("[data-membership-plan]").count();
  console.log("On /games: membership block present (should be false):", gamesHasMembership, "| plan cards (should be 0):", gamesHasPlanCards);

  console.log("\nRESULT:", accountHasMembership && accountHasPlanCards === 3 && accountHasAutoDebit === 1 && !gamesHasMembership && gamesHasPlanCards === 0 ? "PASS" : "FAIL");
} catch (err) {
  console.error("SMOKE TEST ERROR:", err.message);
} finally {
  if (userId) {
    console.log("Cleaning up test user...");
    const delResp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    console.log("Delete status:", delResp.status);
  }
  console.log("Console errors captured:", JSON.stringify(consoleErrors, null, 2));
  await browser.close();
}
