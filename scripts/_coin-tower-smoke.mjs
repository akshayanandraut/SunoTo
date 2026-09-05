import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:5173";
const shotDir = "C:/pvt/SunoTo/scripts/_shots";
mkdirSync(shotDir, { recursive: true });
let shotCount = 0;
const consoleErrors = [];

const browser = await chromium.launch();
const page = await browser.newContext().then(ctx => ctx.newPage());
page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", err => consoleErrors.push(`pageerror: ${err.message}`));

const shot = async label => {
  shotCount += 1;
  const path = `${shotDir}/ct-${String(shotCount).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`screenshot: ${path}`);
};

try {
  await page.goto(`${BASE}/#/account`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const authForm = page.locator("#auth-form");
  if (await authForm.count()) {
    await authForm.locator('input[name="email"]').fill("localtest@sunoto.dev");
    await authForm.locator('input[name="password"]').fill("LocalTest123!");
    await authForm.locator("button.btn-primary").click();
    await page.waitForTimeout(2500);
  }
  await shot("signed-in");

  await page.goto(`${BASE}/#/coin-tower`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await shot("coin-tower-initial");

  const optInBtn = page.locator("#betting-optin-btn");
  if (await optInBtn.count()) {
    console.log("Betting opt-in gate shown, clicking through...");
    await optInBtn.click();
    await page.waitForTimeout(1500);
    await shot("after-opt-in");
  }

  const balanceBefore = await page.locator(".wallet-badge").textContent().catch(() => "n/a");
  console.log("Wallet balance before:", balanceBefore);

  const form = page.locator("#coin-tower-form");
  if (!(await form.count())) throw new Error("coin-tower-form not found after opt-in");
  await form.locator('input[name="stakeSparks"]').fill("2");
  await form.locator("button").click();
  await page.waitForTimeout(500);
  await shot("dropping");
  await page.waitForTimeout(2500);
  await shot("result");

  const balanceAfter = await page.locator(".wallet-badge").textContent().catch(() => "n/a");
  console.log("Wallet balance after:", balanceAfter);

  const bodyText = await page.locator("body").textContent();
  const outcomeMatch = ["TOPPLE", "Pushed off", "Nudged back", "No win this drop"].find(s => bodyText.includes(s));
  console.log("Outcome label found:", outcomeMatch || "NONE FOUND");

  const ticker = await page.locator(".winners-ticker, .muted:has-text('No wins yet')").first().textContent().catch(() => "n/a");
  console.log("Winners ticker snippet:", ticker);
} catch (err) {
  console.error("SMOKE TEST ERROR:", err.message);
  await shot("error-state").catch(() => {});
} finally {
  console.log("Console errors captured:", JSON.stringify(consoleErrors, null, 2));
  await browser.close();
}
