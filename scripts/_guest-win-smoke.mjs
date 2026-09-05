import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5173";
const shotDir = "C:/pvt/SunoTo/scripts/_shots";
mkdirSync(shotDir, { recursive: true });
let shotCount = 0;
const shot = async (page, label) => {
  shotCount += 1;
  const path = `${shotDir}/${String(shotCount).padStart(2, "0")}-${label}.png`;
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
  await shot(page, "home-loaded");

  const playButton = page.locator("#guest-win-play");
  await playButton.waitFor({ timeout: 10000 }).catch(() => {});
  if (await playButton.count()) {
    console.log("Found guest-win play button, clicking...");
    await shot(page, "before-play");
    let won = false;
    for (let attempt = 0; attempt < 5 && !won; attempt++) {
      const btn = page.locator("#guest-win-play");
      if (!(await btn.count())) break;
      await btn.click();
      await page.waitForTimeout(1500);
      const wonCard = page.locator(".guest-win-won");
      if (await wonCard.count()) { won = true; break; }
      const lostText = await page.locator(".guest-win-card").textContent().catch(() => "");
      console.log(`Attempt ${attempt + 1} result text: ${lostText}`);
      if (lostText && lostText.includes("cooldown")) break;
    }
    await shot(page, "after-play-attempts");
    if (won) {
      const cardText = await page.locator(".guest-win-won").textContent();
      console.log("WON card text:", cardText);
      const timerText = await page.locator("#guest-win-timer").textContent().catch(() => "n/a");
      console.log("Countdown timer shows:", timerText);
      await page.waitForTimeout(2000);
      const timerText2 = await page.locator("#guest-win-timer").textContent().catch(() => "n/a");
      console.log("Countdown timer 2s later:", timerText2, timerText2 !== timerText ? "(ticking OK)" : "(NOT TICKING)");

      await page.locator(".guest-win-won button[data-route='account']").click();
      await page.waitForSelector("text=Create an account or sign in", { timeout: 10000 });
      await shot(page, "account-page-signup");

      const email = `guestwin-test-${Date.now()}@mailinator.com`;
      const password = "TestPass123!";

      console.log("Creating pre-confirmed test user via Supabase admin API (bypassing email-send rate limit)...");
      const createResp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      const createData = await createResp.json();
      if (!createResp.ok) throw new Error(`admin create user failed: ${JSON.stringify(createData)}`);
      console.log("Test user created and confirmed:", email);

      await shot(page, "account-page-signin");
      await page.fill("#auth-form [name=email]", email);
      await page.fill("#auth-form [name=password]", password);
      await page.click("#auth-form button.btn-primary");
      await page.waitForTimeout(3000);
      await shot(page, "after-signin-submit");

      const bodyText = await page.locator("body").textContent();
      console.log("Post-signin account message present:", bodyText.includes("Sparks credited"));
      console.log("Premium upsell present:", bodyText.includes("Go further with Premium"));

      const walletBadge = page.locator(".wallet-badge");
      console.log("Wallet badge present:", await walletBadge.count() > 0);
      if (await walletBadge.count()) console.log("Wallet badge text:", await walletBadge.textContent());
    } else {
      console.log("Did not win within attempts (possibly cooldown from a prior run, or bad luck at 90%).");
    }
  } else {
    console.log("guest-win-play button NOT FOUND on home page (already signed in from a prior session, or feature not rendering).");
    await shot(page, "no-play-button");
  }
} catch (err) {
  console.error("SMOKE TEST ERROR:", err.message);
  await shot(page, "error-state").catch(() => {});
} finally {
  console.log("Console errors captured:", JSON.stringify(consoleErrors, null, 2));
  await browser.close();
}
