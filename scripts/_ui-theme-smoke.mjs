import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5173";
const shotDir = "C:/pvt/SunoTo/scripts/_shots";
mkdirSync(shotDir, { recursive: true });
let shotCount = 0;
const shot = async (page, label) => {
  shotCount += 1;
  const path = `${shotDir}/${String(shotCount).padStart(2, "0")}-uitheme-${label}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`screenshot: ${path}`);
};

const consoleErrors = [];
const browser = await chromium.launch();
const page = await browser.newContext().then(ctx => ctx.newPage());
page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", err => consoleErrors.push(`pageerror: ${err.message}`));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Meet someone new", { timeout: 15000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000);
  await shot(page, "classic-home");

  const switcher = page.locator(".ui-theme-switch");
  console.log("switcher present:", await switcher.count() > 0);

  for (const themeId of ["compact", "rounded", "editorial", "classic"]) {
    await switcher.locator("[data-ui-theme-toggle]").click();
    await page.waitForTimeout(150);
    await page.locator(`.ui-theme-option[data-ui-theme="${themeId}"]`).click();
    await page.waitForTimeout(300);
    const applied = await page.evaluate(() => document.documentElement.dataset.uiTheme);
    console.log(`applied theme ${themeId}:`, applied);
    await shot(page, themeId);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const persisted = await page.evaluate(() => document.documentElement.dataset.uiTheme);
  console.log("theme persisted after reload:", persisted);
  await shot(page, "after-reload");

  await page.click("[data-route='account']");
  await page.waitForTimeout(800);
  await shot(page, "account-page");
} catch (err) {
  console.error("SMOKE TEST ERROR:", err.message);
  await shot(page, "error-state").catch(() => {});
} finally {
  console.log("Console errors captured:", JSON.stringify(consoleErrors, null, 2));
  await browser.close();
}
