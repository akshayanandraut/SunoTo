// Manual browser verification for T-023 (private-ad rendering across all 4 placements) and T-024
// (admin Activity tab). Deliberately named without a "-test.mjs" suffix so `node --test` does not
// auto-discover and run it as part of the permanent suite -- it needs a real admin session and two
// live dev servers (worker + vite), and mutates real private_ads rows (cleaned up at the end).
//
// Setup before running:
//   1. Create a confirmed throwaway Supabase auth user (service-role admin API), note its id.
//   2. Set ADMIN_USER_ID=<that id> and ADMIN_REQUIRE_AAL2=false in worker/.dev.vars (local-only,
//      gitignored) so the local admin auth check accepts it without real MFA enrollment.
//   3. Run `npm run worker:dev` and `npm run dev` in the background.
//   4. ADMIN_TEST_EMAIL=... ADMIN_TEST_PASSWORD=... FRONTEND_BASE=http://127.0.0.1:<vite-port> node scripts/_admin-verify.mjs
//   5. Afterward: delete the throwaway auth user and remove ADMIN_USER_ID/ADMIN_REQUIRE_AAL2 from
//      worker/.dev.vars again -- don't leave a standing admin backdoor in local config.
import { chromium } from "playwright";

const FRONTEND = process.env.FRONTEND_BASE || "http://127.0.0.1:5174";
const ADMIN_EMAIL = process.env.ADMIN_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

// Every admin action goes through run() -> "Saving..." -> load() -> "Data loaded...", replacing
// #admin-content's DOM wholesale. Waiting only for "Data loaded" is a race if that text is already
// present from a *previous* cycle -- wait for the transient "Saving" state first so we know we're
// observing a genuinely new cycle, not a stale one.
async function waitForAdminReload(page) {
  await page.waitForFunction(() => document.querySelector("#admin-status")?.textContent?.includes("Saving"), { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("#admin-status")?.textContent?.includes("Data loaded"), { timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch();
  const adminContext = await browser.newContext();
  const page = await adminContext.newPage();

  console.log("--- signing in as the admin test account ---");
  await page.goto(`${FRONTEND}/#/account`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#auth-form", { timeout: 15000 });
  await page.fill('#auth-form input[name="email"]', ADMIN_EMAIL);
  await page.fill('#auth-form input[name="password"]', ADMIN_PASSWORD);
  await page.dispatchEvent("#auth-form", "submit");
  // A successful sign-in navigates away to #/home -- go back to #/account to confirm the signed-in state.
  await page.waitForFunction(() => location.hash === "#/home", { timeout: 15000 });
  await page.goto(`${FRONTEND}/#/account`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#signout", { timeout: 15000 });
  assert(true, "signed in on the main site");

  console.log("--- creating one private ad per placement ---");
  await page.goto(`${FRONTEND}/admin.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-admin-tab="activity"]', { timeout: 15000 });
  await page.click('[data-admin-tab="activity"]');
  await page.waitForSelector("#private-ad-form", { timeout: 15000 });

  const createdSlots = [];
  for (const slot of ["top", "bottom", "desktopSide", "interstitial"]) {
    // Every admin form submit triggers run() -> load(), a full ~30-endpoint reload that replaces
    // #admin-content's DOM wholesale. Waiting for that reload to fully settle before the next fill
    // avoids racing a page.fill() against elements that are about to be torn down and rebuilt.
    await page.fill('#private-ad-form input[name="slot"]', slot);
    await page.fill('#private-ad-form input[name="title"]', `T-023 test ad (${slot})`);
    await page.fill('#private-ad-form input[name="imageUrl"]', "https://placehold.co/300x100.png");
    await page.fill('#private-ad-form input[name="targetUrl"]', "https://example.com");
    await page.dispatchEvent("#private-ad-form", "submit");
    await waitForAdminReload(page);
    await page.waitForSelector("#private-ad-form", { timeout: 15000 });
    const contentText = await page.locator("#admin-content").innerText();
    assert(contentText.includes(`T-023 test ad (${slot})`), `created a private ad for slot "${slot}"`);
    createdSlots.push(slot);
  }

  console.log("--- verifying the Activity tab itself ---");
  const activityText = await page.locator("#admin-content").innerText();
  assert(activityText.includes("Hourly snapshots"), "Hourly snapshots table heading renders");
  assert(activityText.includes("Private ads"), "Private ads management table heading renders");
  assert(activityText.includes("T-023 test ad (top)"), "the top-slot ad appears in the private ads table");

  console.log("--- verifying each *enabled* placement actually renders the ad creative on the home page ---");
  const configResponse = await page.request.get(`${process.env.WORKER_BASE || "http://127.0.0.1:8787/api/v1"}/config/public`);
  const liveAdsConfig = (await configResponse.json()).ads;
  const enabledSlots = ["top", "bottom", "desktopSide"].filter(slot => liveAdsConfig.placements[slot]);
  const disabledSlots = ["top", "bottom", "desktopSide"].filter(slot => !liveAdsConfig.placements[slot]);
  if (disabledSlots.length) console.log(`NOTE: placements disabled in the live config (not a bug, existing config, left untouched): ${disabledSlots.join(", ")}`);

  const guestContext = await browser.newContext();
  const homePage = await guestContext.newPage();
  await homePage.goto(`${FRONTEND}/#/home`, { waitUntil: "domcontentloaded" });
  await homePage.waitForTimeout(1500); // ad fetches are async (fetchPrivateAd) after mountAds sets up the slot

  for (const slot of enabledSlots) {
    const img = homePage.locator(`.ad-slot-${slot} .ad-card-private img`);
    await img.waitFor({ state: "attached", timeout: 10000 });
    const src = await img.getAttribute("src");
    assert(src === "https://placehold.co/300x100.png", `.ad-slot-${slot} renders the configured creative`);
  }

  if (liveAdsConfig.placements.interstitial) {
    console.log("--- verifying the interstitial placement (seeding scanCount so the app's own render cycle triggers it naturally) ---");
    // Forcing a one-off mountAds() call via page.evaluate fights the app's own render() loop --
    // render() unconditionally re-calls mountAds() with the *real* scanCount on every state change
    // (active-user ticks, etc.), which immediately wipes a manually-forced interstitial back out.
    // Seeding sessionStorage before the app boots makes the app's own natural render cycle produce
    // the interstitial consistently, so it doesn't get raced away by the app's own background timers.
    const interstitialContext = await browser.newContext();
    const interstitialPage = await interstitialContext.newPage();
    await interstitialPage.addInitScript(() => sessionStorage.setItem("random-chat.scan-count", "6"));
    await interstitialPage.goto(`${FRONTEND}/#/home`, { waitUntil: "domcontentloaded" });
    const interstitialImg = interstitialPage.locator(".ad-interstitial .ad-card-private img");
    await interstitialImg.waitFor({ state: "attached", timeout: 10000 });
    const interstitialSrc = await interstitialImg.getAttribute("src");
    assert(interstitialSrc === "https://placehold.co/300x100.png", "the interstitial placement renders the configured creative");
    await interstitialContext.close();
  } else {
    console.log("NOTE: interstitial placement disabled in the live config (not a bug, existing config, left untouched) -- skipped.");
  }

  console.log("--- cleaning up the 4 test private ads ---");
  await page.bringToFront();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.click('[data-admin-tab="activity"]');
  await page.waitForSelector("#private-ad-form", { timeout: 15000 });
  for (const slot of createdSlots) {
    page.once("dialog", dialog => dialog.accept());
    const row = page.locator("table tr", { hasText: `T-023 test ad (${slot})` }).first();
    await row.locator('button:has-text("Delete")').click();
    await waitForAdminReload(page);
    await page.waitForSelector("#private-ad-form", { timeout: 15000 });
  }
  const finalText = await page.locator("#admin-content").innerText();
  for (const slot of createdSlots) assert(!finalText.includes(`T-023 test ad (${slot})`), `test ad for slot "${slot}" was deleted`);

  await browser.close();
  console.log("ALL CHECKS PASSED");
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
