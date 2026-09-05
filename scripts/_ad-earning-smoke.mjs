import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5173";
const shotDir = "C:/pvt/SunoTo/scripts/_shots";
mkdirSync(shotDir, { recursive: true });
let shotCount = 0;
const shot = async (page, label) => {
  shotCount += 1;
  const path = `${shotDir}/${String(shotCount).padStart(2, "0")}-adearning-${label}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`screenshot: ${path}`);
};

const EMAIL = process.env.AD_EARNING_TEST_EMAIL;
const PASSWORD = process.env.AD_EARNING_TEST_PASSWORD || "TestPass123!";
if (!EMAIL) throw new Error("set AD_EARNING_TEST_EMAIL to the pre-provisioned premium test user's email");

const consoleErrors = [];
const browser = await chromium.launch();
const page = await browser.newContext().then(ctx => ctx.newPage());
page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", err => consoleErrors.push(`pageerror: ${err.message}`));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Meet someone new", { timeout: 15000 });

  await page.click("[data-route='account']");
  await page.waitForSelector("text=Create an account or sign in", { timeout: 10000 });
  await shot(page, "signin-page");

  await page.fill("#auth-form [name=email]", EMAIL);
  await page.fill("#auth-form [name=password]", PASSWORD);
  await page.click("#auth-form button.btn-primary");
  await page.waitForTimeout(3000);
  await shot(page, "after-signin");

  await page.click("[data-route='account']");
  await page.waitForTimeout(1000);
  await shot(page, "account-page");

  const section = page.locator("#ad-earning");
  const found = await section.count() > 0;
  console.log("Earn Sparks panel present:", found);
  if (!found) {
    const bodyText = await page.locator("body").textContent();
    console.log("Body text snippet:", bodyText.slice(0, 500));
    throw new Error("ad-earning section not found on account page");
  }

  const watchBtn = page.locator("#ad-earning-watch-btn");
  console.log("Watch button text:", await watchBtn.textContent());
  await watchBtn.click();
  await page.waitForTimeout(800);
  await shot(page, "watching");

  const adSlot = page.locator("#ad-earning-slot img");
  console.log("Ad image mounted:", await adSlot.count() > 0);

  console.log("Waiting for dwell countdown to finish...");
  await page.waitForFunction(() => {
    const btn = document.querySelector("#ad-earning-watch-btn");
    return btn && btn.textContent.includes("Claim reward");
  }, { timeout: 15000 });
  await shot(page, "ready-to-claim");

  const walletBefore = await page.locator(".wallet-badge").textContent().catch(() => "n/a");
  console.log("Wallet before claim:", walletBefore);

  await page.locator("#ad-earning-watch-btn").click();
  await page.waitForTimeout(1500);
  await shot(page, "after-claim");

  const bodyText = await page.locator("body").textContent();
  console.log("Sparks credited message present:", bodyText.includes("Sparks credited"));
  const walletAfter = await page.locator(".wallet-badge").textContent().catch(() => "n/a");
  console.log("Wallet after claim:", walletAfter);
} catch (err) {
  console.error("SMOKE TEST ERROR:", err.message);
  await shot(page, "error-state").catch(() => {});
} finally {
  console.log("Console errors captured:", JSON.stringify(consoleErrors, null, 2));
  await browser.close();
}
