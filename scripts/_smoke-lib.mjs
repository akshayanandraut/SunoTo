import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

export const BASE = "http://127.0.0.1:5173";
export const TEST_EMAIL = "localtest@sunoto.dev";
export const TEST_PASSWORD = "LocalTest123!";

export async function newSmokePage(shotPrefix) {
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
    const path = `${shotDir}/${shotPrefix}-${String(shotCount).padStart(2, "0")}-${label}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`screenshot: ${path}`);
    return path;
  };
  return { browser, page, shot, consoleErrors };
}

// Note: clicking the sign-in submit button via Playwright's synthetic click has been observed to
// intermittently race with this app's periodic background re-renders (ads/reconnect/presence polling
// all call render(), which fully replaces #app's innerHTML), causing the native form submission to be
// dropped ("Form submission canceled because the form is not connected"). Dispatching the 'submit'
// event directly exercises the exact same production listener/logic without that race.
// Same background-re-render race as signIn() below affects any in-page form submit or button click
// triggered via Playwright's mouse simulation (this app calls a full render() -- replacing #app's
// innerHTML -- after most background polls resolve: reconnect/request, ads, presence heartbeat, etc.,
// which can detach the element between Playwright's actionability check and the actual dispatch).
// Dispatching the event directly sidesteps it while still exercising the real listener/logic.
export async function submitForm(page, formSelector) {
  await page.evaluate(sel => {
    document.querySelector(sel)?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, formSelector);
}

export async function clickButton(page, selector) {
  await page.evaluate(sel => {
    document.querySelector(sel)?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, selector);
}

export async function signIn(page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto(`${BASE}/#/account`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const form = page.locator("#auth-form");
  if (!(await form.count())) return; // already signed in
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(password);
  await page.evaluate(() => {
    document.querySelector("#auth-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(2500);
}
