import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:5173";
const shotDir = "C:/pvt/SunoTo/.playwright-shots";
mkdirSync(shotDir, { recursive: true });

const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", err => errors.push(String(err)));

async function shot(name) {
  await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true });
  console.log(`screenshot: ${name}.png`);
}

// Sign in
await page.goto(`${BASE}/#/account`);
await page.waitForSelector("text=Sign in", { timeout: 15000 }).catch(() => {});
await shot("01-account-initial");

const authForm = page.locator("#auth-form");
if (await authForm.count()) {
  await authForm.locator('input[name="email"]').fill("localtest@sunoto.dev");
  await authForm.locator('input[name="password"]').fill("LocalTest123!");
  await authForm.locator("button.btn-primary").click();
  await page.waitForTimeout(2500);
}
await shot("02-account-signed-in");

// Games tab
await page.goto(`${BASE}/#/games`);
await page.waitForTimeout(2000);
await shot("03-games-tab");

const reflexForm = page.locator("#reflex-stake-form");
if (await reflexForm.count()) {
  await reflexForm.locator('input[name="stakeSparks"]').fill("1");
  await reflexForm.locator("button").click();
  await page.waitForTimeout(3500); // let the pad turn green
  await shot("04-reflex-waiting-or-go");
  const pad = page.locator("#reflex-pad");
  await pad.click();
  await page.waitForTimeout(1500);
  await shot("05-reflex-result");
} else {
  console.log("Reflex Tap form not found");
}

// Forums tab
await page.goto(`${BASE}/#/forums`);
await page.waitForTimeout(1500);
await shot("06-forums-topic-list");

const joinBtn = page.locator('[data-forum-join="general"]');
if (await joinBtn.count()) {
  await joinBtn.click();
  await page.waitForTimeout(1000);
  const input = page.locator("#forum-input");
  await input.fill("Hello from Playwright smoke test");
  await page.locator("#forum-post-form button").click();
  await page.waitForTimeout(1000);
  await shot("07-forums-message-sent");
} else {
  console.log("Forum join button not found");
}

console.log("CONSOLE_ERRORS:", JSON.stringify(errors, null, 2));
await browser.close();
