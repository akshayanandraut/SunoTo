# TASKS.md — SunoTo backlog, for autonomous task-by-task execution

This file is the complete, current backlog for the SunoTo repo (`C:\pvt\SunoTo`), compiled 2026-09-06 from a
full audit of `ROADMAP.md`, `QUESTIONS.md`, and the live codebase. It is written so a smaller/cheaper model can
pick up **one task at a time** and execute it without needing the rest of this conversation's context.

## How to work this file

- Pick the **first unchecked task** in the first non-"BLOCKED" section, top to bottom. Sections are ordered by
  priority (P0 = do first). Within a section, order is also priority order.
- **Skip anything in the "BLOCKED" section.** Those tasks need a decision or an action only the human owner can
  make (money, legal, real-world accounts). Do not attempt to fake, stub around, or unblock them yourself. Just
  leave them checked `[ ]` and move on.
- When a task is done: check its box (`[x]`), and append one short line under it starting with `DONE 2026-MM-DD:`
  describing exactly what changed (file paths + what you verified). This is the same logging convention already
  used in `ROADMAP.md`/`QUESTIONS.md` in this repo — keep the log entry factual and specific, not a summary of
  effort.
- If you discover a task's premise is already stale (the thing is actually already built/fixed), don't build it
  again — verify with a real grep/read, log `RESOLVED, already done — no change needed:` with the evidence, check
  the box, and move to the next task.
- **Standing rule from the project owner**: build autonomously, don't leave open questions pending — make the
  sensible call yourself and log the reasoning, the same way `QUESTIONS.md` already documents several autonomous
  calls made earlier in this project (e.g. guest-win reward sizing, ad-earning model choice, donations page).
  This applies to every task below except the ones explicitly marked BLOCKED.
- Default verification level per task:
  - Pure code/content changes (bug fixes, copy fixes, new backend logic): run `node --check` on every touched
    `.js` file. Do not run the full test suite or start dev servers unless the task is specifically a
    "browser-verify" task.
  - Tasks titled "Browser-verify …": these *require* actually running the app and driving it — use the `run`
    skill / the existing pattern in `scripts/playwright-smoke.mjs` and the various `scripts/_*.mjs` one-off
    driver scripts in this repo (e.g. `scripts/_guest-win-smoke.mjs`, `scripts/_membership-move-smoke.mjs`) as a
    template: start the worker (`http://127.0.0.1:8787`) and Vite dev server (`http://localhost:5173`) if not
    already running, drive the flow with Playwright, take screenshots, check for console errors, then delete any
    temporary test data/accounts you created and reset any config you toggled back to its original value. Delete
    your scratch driver script when done (repo convention: throwaway scripts live at `scripts/_*.mjs` and are not
    committed/kept).
- Never commit or push anything unless explicitly asked.
- Never run destructive git operations, never touch real payment/Razorpay dashboard settings, never message or
  post anything externally.

---

## SECTION 0 — BLOCKED (needs the human owner; do not attempt)

- [ ] **T-001. Create the Razorpay recurring-billing plan for streaming membership.**
  `RAZORPAY_STREAMING_PLAN_ID` is not set in `worker/wrangler.toml` or `worker/.dev.vars`. Until a real ₹250/month
  recurring plan exists in the Razorpay dashboard and its plan ID is set as a worker var/secret, every streaming
  membership subscribe attempt throws `streaming_membership_not_configured`
  (`worker/src/services/StreamingMembershipService.js` lines 9-10). This is an external, hard-to-reverse
  financial/account action in a third-party dashboard — do not attempt to fabricate a plan ID or bypass this
  check. Skip this task entirely; it can only be closed by the human owner.

- [ ] **T-002. Browser-verify the streaming membership subscribe → verify → status flow end-to-end.**
  Blocked by T-001 — there is no real plan ID to subscribe against yet (only a mock fallback
  `env.razorpay.mock ? "plan_MOCKDEV" : null` exists for local dev). Do not attempt in a live/production context.
  If you want partial coverage, you may exercise this against the **mock** Razorpay path only, in a local dev
  environment, and log clearly that this only proves the code path, not the real integration.

---

## SECTION 1 — P0: Browser-verify features that are already built but never click-through tested

Each of these features is fully coded and (per `ROADMAP.md`/`QUESTIONS.md`) passed `node --check`, but was never
driven in a real browser, or was only partially driven. Goal for each: drive the real flow with Playwright, fix
any bug you find along the way (this repo's history shows real bugs are regularly caught exactly this way — e.g.
the guest-win claim's snake_case/camelCase mismatch, the missing `"guest-win"` rate-limit bucket, the party-room
creation `gen_random_bytes`/camelCase bugs), then log what you found and fixed.

- [ ] **T-010. Browser-verify Coin Tower (solo game) end-to-end.**
  Route: `#/coin-tower` (registered in `web/js/views.js`, `GAME_MENU`/`GAME_ROUTES` in `web/js/app.js`). Sign in
  with a test account, opt in to real-stake games if prompted, stake a small amount, confirm the coin-pusher
  cabinet animation plays, the outcome label ("TOPPLE! 🎉" / "Pushed off — win!" / "Nudged back — refunded" / "No
  win this drop") matches the actual server result, wallet balance updates correctly, and the winners-ticker
  updates. Zero console errors required. Per `QUESTIONS.md` line 57: "Not yet live-browser-tested."

- [ ] **T-011. Browser-verify 777 Slots (solo game) end-to-end.**
  Route: `#/slots-777`. Backend: `worker/src/services/GamesService.js` `playSlots777`; routes
  `/api/v1/games/slots-777/{symbols,play,leaderboard}`. Stake, confirm the 3-reel spin animation resolves to the
  true server symbols (any-two-match consolation payout, three-of-a-kind payout, three-sevens jackpot), wallet
  updates, leaderboard updates. Per `QUESTIONS.md` line 62: "Not verified in-browser this pass."

- [ ] **T-012. Browser-verify Scratch Card (solo game) end-to-end.**
  Route: `#/scratch-card`. Tap one of the 9 tiles, confirm the ~900ms reveal delay shows the true server
  tile/outcome (small win / rare big win / blank), wallet updates. Per `QUESTIONS.md` line 68: "Not verified
  in-browser this pass."

- [ ] **T-013. Browser-verify Wheel of Fortune full spin-to-settle, including the betting opt-in step.**
  Route: `#/wheel`. Previous attempt (`scripts/_wheel-label-smoke.mjs`) confirmed the idle wheel's labels/legend
  render correctly but could not complete an actual spin because the betting-opt-in consent UI wasn't driven.
  This time, actually click through the real opt-in consent button (`bettingGate()` helper in `web/js/views.js`,
  `#betting-optin-btn`) with Playwright, then submit a stake and confirm the wheel lands on the segment matching
  the true server result, wallet updates, winners-ticker updates.

- [ ] **T-014. Browser-verify the games-menu / per-game-page IA rebuild across all 8 routes.**
  `web/js/views.js`'s `gamesView` is now a card-grid menu only; each game (`wheel`, `coin-flip`, `coin-tower`,
  `streak-ladder`, `sparks-pool`, `trivia`, `roulette`, `sportsbook`) has its own route wrapped in `gameShell()`.
  Click through the menu into every one of the 8 game pages, confirm each loads its live data (odds/leaderboard),
  the wallet strip and daily-cap notice render, back-to-games navigation works, and — specifically — confirm data
  keeps refreshing on repeated visits to the same route (this was the exact bug class the `GAME_ROUTES` Set fix
  in `web/js/app.js` was meant to close; re-visiting a route twice in a row without a full page reload is the key
  regression check). Per `QUESTIONS.md` line 61: "Not verified in-browser this pass."

- [ ] **T-015. Browser-verify Tug of War Trivia's full 2-player gameplay (not just the seat-count guard).**
  Party-room mode `tug_of_war`, handlers in `worker/src/durable/PartyRoomShard.js` (`TUG_START`/`TUG_ANSWER`/
  `TUG_STATE`/`TUG_OVER`), question bank `worker/src/policies/tugOfWarQuestions.js`. Only the "needs exactly 2
  seated players" rejection message has been verified so far (`QUESTIONS.md` line 149). This task must actually
  seat exactly 2 players, start a round, answer several rapid-fire questions correctly/incorrectly from both
  sides, confirm the rope-meter/score updates correctly, confirm first-to-5 ends the round, and confirm the pot
  payout math (stake × 2, minus 10% rake, to the winner) is correct.

- [ ] **T-016. Browser-verify Elimination Reflex's full 3-4 player gameplay (not just the seat-count guard).**
  Party-room mode `elimination_reflex`, handlers in `worker/src/durable/PartyRoomShard.js` (`ELIM_START`/
  `ELIM_TAP`/`ELIM_STATE`/`ELIM_OVER`), constants `ELIMINATION_REFLEX_MIN_PLAYERS=3`/`MAX_PLAYERS=4`/
  `ARM_MIN_MS`/`ARM_MAX_MS` in `worker/src/policies/partyRoomPolicy.js`. Seat 3 or 4 players, start a round,
  test both the false-start path (tap before armed → instant elimination) and the normal path (slowest tapper
  once armed is eliminated), confirm the pro-rata half-refund on elimination, confirm the last player standing
  takes the pot minus rake.

- [ ] **T-017. Browser-verify the radio channel terminology change and "Custom channels — coming soon" card.**
  `web/js/views.js` party lobby: confirm the "Radio channels" section at the top lists both curated channels
  with working "Join channel →" buttons, confirm in-room copy says "channel" not "room" throughout when
  `room.roomType==="radio"` (no join-code line, no invite form), confirm the room-type dropdown on the create
  form no longer offers "Radio (public)", and confirm the "Custom channels — coming soon" static card renders in
  place of the old public-radio-rooms directory. Per `QUESTIONS.md` line 173: "Not browser-verified this pass."

- [ ] **T-018. Browser-verify the party-room seat-moderation flow end-to-end.**
  Covers: spectator requests a seat, host/co-host approves or denies, host appoints/revokes a co-host (target
  must have `profiles.is_premium=true`), co-host bans a participant, host pre-authorizes a user by account ID for
  an auto-granted seat, and confirm the host itself cannot be banned. State/events are in
  `worker/src/durable/PartyRoomShard.js` and `web/js/app.js`'s `handlePartyEvent()`
  (`SEAT_REQUESTED`/`SEAT_GRANTED`/`SEAT_DENIED`/`SEAT_REVOKED`/`MEMBER_SEATED`/`MEMBER_UNSEATED`/
  `MEMBER_BANNED`/`COHOST_APPOINTED`/`COHOST_REVOKED`/`PREAUTHORIZE_ACCEPTED`). Per ROADMAP.md Slice 16: "Not yet
  done: browser-verify the full moderation flow end-to-end."

- [ ] **T-019. Browser-verify typing indicators end-to-end (1:1 chat and party chat).**
  Two-browser-context Playwright test: one participant types, confirm the other sees the typing indicator appear
  and disappear correctly in both random 1:1 chat and party-room chat. Per ROADMAP.md: "Not yet done:
  browser-verify typing indicators... end-to-end."

- [ ] **T-020. Browser-verify disappearing photos end-to-end.**
  Send a photo in a 1:1 chat, confirm it displays for its configured duration then actually disappears from the
  DOM/UI for the recipient, and confirm no copy of it persists anywhere client-visible after expiry. Per
  ROADMAP.md: "Not yet done: browser-verify... disappearing photos end-to-end."

- [ ] **T-021. Browser-verify paid verification (₹100) end-to-end.**
  Account page "Verify profile (₹100)" button, RPC `request_verification` (requires ≥15 distinct access days in
  the last 30). For a real click-through you'll need a test account with enough `daily_entitlements` rows to
  pass the 15-day check — either seed that table directly for a throwaway test user (documented pattern: this
  session's summary shows direct-REST seeding is the accepted approach when an RPC's precondition can't be
  naturally met in a short test), or confirm the correct rejection message appears for an account that hasn't
  met the bar yet, then seed and confirm the success path (charges 100 credits, sets `profiles.verified_at`,
  button flips to "✓ Verified profile"). Clean up any seeded rows afterward.

- [ ] **T-022. Browser-verify avatar upload end-to-end.**
  Account page, verified-profile section, `#avatar-upload` button → `POST /api/v1/avatar` (R2-backed via
  `RADIO_BUCKET`) → `set_avatar_url` RPC. Upload a real test image, confirm it renders in the account page and
  persists on reload.

- [ ] **T-023. Browser-verify private-ad rendering across all 4 placements.**
  Placements: `top`, `bottom`, `desktopSide`, `interstitial` (config shape in `app_config.ads.placements`,
  `web/js/ads.js` `mountAds()`). Create one temporary active private ad per slot via the admin panel or direct
  REST, load the home page and confirm each configured placement actually renders the ad creative, then delete
  the temporary ads and restore the original `ads` config if you changed it.

- [ ] **T-024. Browser-verify the admin "Activity" tab.**
  Admin panel (`web/js/admin.js` `activityView`): confirm live-activity metrics render, hourly snapshot table
  populates, and the private-ads management table (enable/disable/edit/delete) works against real data. Requires
  the configured super-admin account credentials — if unavailable, document exactly what was and wasn't
  reachable rather than skipping the task silently.

- [ ] **T-025. Browser-verify the daily login streak bonus feature (built 2026-09-06).**
  Migration `supabase/migrations/202609030002_daily_login_streak.sql`, RPCs `claim_daily_streak_bonus`/
  `daily_streak_status`, routes `/api/v1/games/daily-streak/{status,claim}`, account-page section
  `dailyStreakSection` in `web/js/views.js` (`#daily-streak-claim-btn`). This entire feature was built this
  session and has **never been run** — confirm: (1) first claim of the day credits `baseCreditsPerDay × 1`
  Sparks and shows "1-day streak"; (2) claiming again same day is a no-op idempotent replay (button should show
  "already claimed" state, not re-credit); (3) claiming on a second consecutive UTC day increments the streak
  and reward to `baseCreditsPerDay × 2`; (4) skipping a day resets the streak back to 1 on the next claim; (5)
  the admin Config tab's new "Daily login streak" panel loads current values and a small edit (e.g. toggle
  `enabled`, then toggle back) saves and persists. You will likely need to manipulate `claim_date` rows directly
  in `daily_streak_claims` via REST to simulate "yesterday" for the increment/reset checks rather than waiting
  real days — that's expected and fine, clean up the rows afterward.

- [ ] **T-026. Browser-verify Connect Four's full playthrough (win detection was code-audited as correct but never re-driven live).**
  `PartyRoomShard.js` `C4_MOVE` handler / `connectFourWinCells` / `resolveConnectFourGame`. Play a full game to a
  win, confirm `C4_OVER` broadcasts the correct `winnerParticipantId`/`winningCells`/`pot` and the UI reflects it
  (not just `C4_STATE`). Lower priority than the tasks above since the code path was already read and confirmed
  correct — this is a final confidence check, not expected to find a bug.

---

## SECTION 2 — P1: Concrete, self-contained bug fixes (no ambiguity, no design decisions)

- [ ] **T-030. Fix the hardcoded-`value` stake-input reset bug on the Sportsbook per-market stake input.**
  Same defect class already fixed for Wheel/Coin Flip/Coin Tower/Slots 777/Scratch Card/Streak Ladder/Roulette/
  Reflex Tap (see `QUESTIONS.md` lines 1-8 for the full root-cause writeup and the fix pattern): a template
  literal in `web/js/views.js` bakes a literal `value="..."` into the `<input>`, so every re-render (including
  mid-action disabled-button re-renders) snaps the typed value back to the default. Fix: bind the input to
  `state.sportsBetStake ?? "<default>"` (nullish coalescing, not `||`) and add a silent `input` event listener in
  `web/js/app.js` that updates state without forcing a re-render — copy the exact pattern used for the other 8
  games' stake inputs (grep `web/js/app.js` for one of the existing `??"5"` / `??"10"` state bindings next to a
  matching silent-input-listener block to find the template to copy).

- [ ] **T-031. Fix the same hardcoded-`value` bug on the Account page's `#recharge-amount` input.**
  `web/js/views.js` `accountView`'s `recharge-form`. Same fix pattern as T-030.

- [ ] **T-032. Fix the same hardcoded-`value` bug on the Membership `#redeem-sparks-form` days field.**
  `web/js/views.js` `membershipSection`'s `redeem-sparks-form`. Same fix pattern as T-030.

- [ ] **T-033. Fix the same hardcoded-`value` bug on the party-room Bidding game's `#bidding-bid-input`.**
  `web/js/views.js` bidding party-room panel. Same fix pattern as T-030.

- [ ] **T-034. Generalize the `betting_opt_in_required` error copy.**
  `web/js/app.js`, `FRIENDLY_ERRORS.betting_opt_in_required` currently hardcodes "Turn on Roulette & Sportsbook
  first to play this game" even when the error fires from Wheel, Coin Flip, Coin Tower, Slots 777, Scratch Card,
  Streak Ladder, or Sparks Pool. Reword to something game-agnostic, e.g. "Turn on real-stake games first to play
  this — refresh the page if you don't see the option." (matches the copy already used elsewhere for this same
  concept per `QUESTIONS.md` line 6 — reuse that exact wording for consistency instead of inventing new copy).

- [ ] **T-035. Standardize the "no wins yet" empty-state copy across every winners-ticker section.**
  `web/js/views.js`: most game leaderboard empty-states say `"No wins yet — be the first."`, but Reflex Tap says
  `"No wins yet today — be the first."` and Sportsbook says `"No bets placed yet."`. Decide one consistent
  wording per context (wins vs bets are genuinely different concepts, so Sportsbook's distinct copy is
  defensible — but Reflex's "today" qualifier is the odd one out among the win-based games and should match the
  other 7). Make Reflex Tap consistent with the other solo/chance games' wording.

- [ ] **T-036. Fix the ambiguous "coming soon" reference to specific games on the Games kill-switch page.**
  `web/js/views.js` line ~76: when `featureFlags.games_enabled===false`, the fallback copy says "Wheel of
  Fortune, Jackpot and Daily Trivia are on their way." This is stale — Jackpot was renamed to "Sparks Pool" and
  the games catalog has grown to 12+ games. Update the copy to something that won't go stale again, e.g. "Our
  games are on their way. Check back soon." (Note: confirm first via `worker/src/policies/flagPolicy.js` /
  `requireFlags` that this is genuinely just a kill-switch fallback message and not a real stub — it is, per this
  session's earlier audit — so this is a pure copy fix, not a feature-gating change.)

---

## SECTION 3 — P1: Content / recurring maintenance

- [ ] **T-040. Reseed `daily_trivia_scheduled_questions` for dates after 2026-09-16.**
  The trivia question bank was last seeded through 2026-09-16 (13 days, seeded 2026-09-03). Once that runs out,
  `get_or_create_open_trivia_round()` silently falls back to repeating the same 5 hardcoded default questions
  every day (see `supabase/migrations/202608270025_games_admin_authoring.sql`), which is a real
  content/retention gap even though it doesn't error. Author another 10-14 days of varied general-knowledge /
  India-flavored trivia questions (5 questions/day, each with `question`/`options`(array,≥2)/`correct_index`)
  and insert them into `public.daily_trivia_scheduled_questions` via direct Supabase REST POST using the real
  credentials in `worker/.dev.vars` (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` — **not** the placeholder values
  in the root `.env.local`), with `Prefer: resolution=merge-duplicates`, exactly like the original seeding pass.
  Write the batch to a scratch file under `scripts/_*.json`, POST it, verify HTTP 201, then delete the scratch
  file. Check ROADMAP.md's Trivia slice for the exact prior seeding note and follow the same approach.

---

## SECTION 4 — P2: Hardening / audits / small new admin capability

- [ ] **T-050. Audit whether any stale "1 Spark = 1 ticket, max 100" Sparks Pool (Jackpot) code path still exists.**
  `QUESTIONS.md` has two entries dated the same day that appear to describe different states of Sparks Pool's
  ticket mechanic: one says the tap-counter rebuild (`.jackpot-tier-grid`, `state.jackpotTierCounts`) was built
  and pushed live (`202608310042_jackpot_no_ticket_cap.sql` removed the old 100-ticket cap); another, in the same
  day's log, says the copy-audit pass "did NOT yet rebuild Sparks Pool's ticket mechanic (still the old flow)."
  Read `web/js/views.js`'s current Sparks Pool view and `web/js/app.js`'s `[data-jackpot-tier]` handlers directly
  to determine which description is current. If the tap-counter UI is live (expected), just log
  `RESOLVED, already done` with the file/line evidence and check the box — no code change needed. If you somehow
  find the old typed-quantity-input flow still present instead, rebuild it per the tap-counter description in
  `QUESTIONS.md` line 59.

- [ ] **T-051. Stricter odds non-disclosure: stop sending raw probability numbers to the client at all.**
  The house-cut copy audit (`QUESTIONS.md` line 60) removed every percentage/odds number from the *rendered* UI
  copy, but the underlying API responses (`state.wheelOdds`, `coinFlipOdds`, `coinTowerOdds`, `scratchCardOdds`,
  `streakLadderOdds`, `reflexTapTiers`, etc. — see `GamesService.js`'s `*Odds`/`*Tiers` methods) still return the
  real `weight_bp`/`win_probability_bp`/`multiplier_bp` fields to any client that inspects network traffic. This
  is optional hardening, not a bug — decide whether it's worth doing given the effort (stripping fields
  server-side in each `GamesService` method's `select=` query, or in a shared response-shaping helper) versus the
  low practical risk (a curious user reading devtools network tab, not a public API). If you do it, make sure you
  don't break the game UI that still needs the label/tier-name fields — only strip the numeric odds fields, keep
  labels.

- [ ] **T-052. Build a party-room-specific "close room" / "ban from this room" admin action.**
  Per ROADMAP.md Slice 7: party-room reports correctly land in the existing admin `reports` feed (reusing
  `record_report`, keyed by the room's `public_id`), but there is no admin-panel action to close a specific
  room or kick everyone from it — an admin can currently only restrict the underlying *account* via the existing
  restriction tools, not act on the *room* itself. Add a new admin RPC (e.g. `admin_close_party_room(admin_id
  uuid, room_public_id text, reason text)` following the exact same security-definer + `admin_audit` insert
  pattern as every other `admin_*` RPC in this codebase — see `admin_update_wheel_segments` in
  `202608270025_games_admin_authoring.sql` for the template) that marks the room closed/ends all active
  sessions in it, a `worker/src/services/AdminService.js` method + route, and a "Close room" button next to
  party-room entries somewhere reachable in `web/js/admin.js` (there may not be a rooms list view yet — you may
  need to add one, e.g. under the existing `activityView` or a new small panel).

- [ ] **T-053. Consider auto-restriction/kick logic for party-room participants who accumulate multiple reports.**
  Currently a reported party-room participant just accumulates rows in the existing `reports` table for manual
  admin review — there's no automatic kick/restriction threshold like some other moderation surfaces in this app
  may have. Check whether 1:1 chat already has an automatic restriction-on-report-threshold mechanism (grep
  `RestrictionService`/`SafetyService` for any existing risk-score auto-action) — if such a pattern already
  exists elsewhere, extend it to party rooms for consistency; if no such pattern exists anywhere in the app, this
  may be an intentional "manual review only" design choice — log your finding either way before deciding whether
  to build anything.

- [ ] **T-054. Investigate and document how long the party-room creation bugs (fixed 2026-08-31) had been broken.**
  Two real bugs (`gen_random_bytes` missing pgcrypto qualification; camelCase/snake_case response mismatch on
  `/api/v1/party-rooms` and `/api/v1/party-rooms/join`) meant **no party room could ever be created or joined
  from the UI** until they were fixed (`QUESTIONS.md` lines 151-155). Run `git log -p` / `git blame` on
  `worker/src/index.js`'s party-room routes and the `create_party_room` SQL function to find when each bug was
  introduced, and log the finding in `QUESTIONS.md` for the record. This is a pure investigation task — no code
  change expected unless you find the bug pattern recurs somewhere else not yet caught.

---

## SECTION 5 — P3: Larger builds needing real design work (each is its own project, not a quick task)

### Digital store

- [ ] **T-060. Decide and log a safe, buildable v1 scope for the "Store" page (currently a placeholder).**
  `web/js/views.js` `storeView` is a "Coming soon" stub. The original ask was a marketplace for buying/selling
  premium *artwork* — but a real user-to-user marketplace with payment splitting to artists is a much bigger
  legal/financial surface (seller payouts, tax/1099-equivalent reporting, dispute handling) than this app has
  anywhere else, and mirrors the exact kind of real-money-handling risk that caused the donations-page idea to be
  rejected entirely (`QUESTIONS.md` "Donations/crisis-relief page — DECIDED NOT TO BUILD"). Per this project's
  standing autonomous-decision pattern, make the same kind of call here rather than leaving it stubbed forever:
  **recommended safe v1** — a platform-owned catalog of digital cosmetic goods (chat themes, profile
  frames/badges, radio channel artwork slots, etc.) purchasable directly with Sparks/Credits, admin-uploaded and
  admin-priced (reusing the existing `app_config`-style admin panel pattern), with **no user-to-user resale and
  no real-money payout to third parties** — i.e., architecturally identical to how Premium/Streaming membership
  already sell for Sparks, just a different SKU type. This avoids the payout/marketplace legal surface entirely
  while still shipping *something* real instead of a permanent stub. Log this decision in `QUESTIONS.md` (or
  update this task with your own reasoning if you judge differently), then proceed to T-061 only if you're
  confident in the scope — if not confident, leave this checked "decision logged, build deferred" and stop here
  rather than guessing at a marketplace/payout design.

- [ ] **T-061. Build the digital store v1 (cosmetic goods, Sparks/Credits-only, admin-curated catalog) per the scope decided in T-060.**
  Only attempt this after T-060's scope is settled. Follow the existing patterns exactly: a new `app_config`-style
  or dedicated `store_items` table (RLS-locked, service-role only, admin-managed via a new `admin_*` RPC modeled
  on `admin_update_wheel_segments`), a `purchase_store_item` RPC modeled on `claim_ad_reward`'s idempotency
  pattern (charges Credits via `apply_wallet_entry`, records ownership), worker routes + `GamesService`-style
  service methods, an admin panel section to add/edit/remove catalog items, and a real `storeView` in
  `web/js/views.js` replacing the stub.

### Radio bot-listener / bot-chat simulation

- [ ] **T-062. Design the bot-listener/bot-chat simulation for future custom radio channels.**
  User's stated plan (`QUESTIONS.md` line 168): future channel hosts should get simulated bot listeners and bot
  chat activity so hosting a new channel feels engaged from day one, before custom/user-hosted channels are
  re-enabled (currently gated to "Custom channels — coming soon"). Design (don't build yet): how many simulated
  listeners appear and how they ramp/decay over a session (the existing smoothed-random-walk pattern in
  `web/js/radio-active-users.js`'s `nextRadioListenerCount` is a good reference for "looks organic, not robotic"
  motion — reuse that technique rather than a flat/fake-looking number), and what bot chat messages would say and
  how often, without it reading as deceptive to a host who knows their real audience size (this is adjacent to
  the "fabricated social proof" dark-pattern concern already raised and refused once in this project for the
  chance-games epic — read `QUESTIONS.md`'s "Chance games... refused in original form" section before designing
  this, and make sure whatever you design here is clearly framed as ambient atmosphere for a new/empty room, not
  a claim of real listener counts, to avoid the same dark-pattern problem in a new form).

- [ ] **T-063. Build the bot-listener/bot-chat simulation per the design from T-062, then re-enable custom radio channel creation.**
  Only attempt after T-062. Re-enable the "Radio (public)" room type in the create-room dropdown
  (`web/js/views.js`, currently filtered out via `ROOM_TYPES.filter(type=>type.id!=="radio")`) and replace the
  "Custom channels — coming soon" card with a real directory once bot engagement is in place.

### Group video for Party Rooms (blocks full-group-video Charades)

- [ ] **T-064. Research and decide the group-video approach for Party Rooms (mesh vs SFU).**
  The only WebRTC path today (`web/js/video-call.js`) is 1:1 mesh, used in random chat. Party rooms need up to
  10 simultaneous video participants (`MAX_ROOM_MEMBERS=10`), which is impractical as a full mesh (each peer
  would need up to 9 simultaneous connections). Research options given this stack is Cloudflare
  Workers/Durable-Objects-based: Cloudflare Calls (SFU-as-a-service, first-party fit for a Cloudflare Workers
  app), a self-hosted SFU, or a capped mesh (e.g. only the first N video participants get video, rest are
  audio/chat-only) as a cheaper interim. Log a recommendation with tradeoffs (cost, given this project's
  standing "minimize infra cost, offload to clients" directive; implementation complexity; latency) before
  building anything.

- [ ] **T-065. Implement group video signaling in `PartyRoomShard.js` per the approach chosen in T-064.**
  Extend beyond the current 1:1 `VIDEO_OFFER`/`VIDEO_ANSWER`/`VIDEO_ICE_CANDIDATE` pattern to however many-peers
  the chosen approach needs (SFU: one connection per peer to the SFU; mesh: N-1 connections per peer with
  renegotiation on join/leave).

- [ ] **T-066. Build the group video UI (grid of video tiles) for Party Rooms.**
  `web/js/views.js`/`web/js/app.js` — a responsive grid of participant video tiles for the party room view, with
  the same mute/camera-toggle/connecting-indicator UX already built for 1:1 video (`web/js/video-call.js`
  `setTrackEnabled`) extended to each tile.

- [ ] **T-067. Build full-group-video Charades on top of the group video infra from T-064–T-066.**
  Only attempt after group video exists. This was the original request that text-based Charades (already built
  and verified) was an interim substitute for.

---

## SECTION 6 — P3: Unconfirmed / optional future ideas (low priority, not re-confirmed by the user recently)

- [ ] **T-070. (Optional, not confirmed) Scrabble multiplayer party-room game.**
  The original games-epic brainstorm mentioned "Scrabble/Ludo/Snake & Ladder/Rummy" as candidate multiplayer
  board games. Ludo, Snake & Ladder, and Rummy are all built and live; Scrabble was never revisited in the later
  2026-08-31 brainstorm (which produced Bidding/Tug of War/Elimination Reflex/Prediction Pool/Streak Ladder
  instead) and was not explicitly re-requested. Treat as a low-priority backlog idea only — if you pick this up,
  scope it properly first (Scrabble's tile-rack/board/dictionary-validation complexity is significantly higher
  than any game built so far in this app) rather than assuming it fits the existing lightweight game patterns.

- [ ] **T-071. (Optional cleanup, explicitly judged not worth it before) Remove dead `publicRadioRooms` plumbing.**
  `state.publicRadioRooms` and `partyApi.publicRadioRooms` in `web/js/app.js` are unused now that the custom
  radio directory was removed (`QUESTIONS.md` line 172 explicitly judged this "harmless unused plumbing, not
  worth touching further right now"). Only clean this up if you're already touching this exact file for another
  task — not worth a dedicated pass on its own.

- [ ] **T-072. (Optional audit) Decide whether `roomType:"radio"` should be fully removed from the backend or intentionally left reachable.**
  The UI can no longer create a `radio`-type room (dropdown option removed), but the backend RPCs/policy still
  technically accept `roomType:"radio"` if called directly. This was judged low-risk to leave as-is
  (`QUESTIONS.md` line 169) since nothing in the UI can trigger it. Revisit only if T-063 (re-enabling custom
  channels) happens, at which point this becomes load-bearing again rather than dead code.

---

## Explicitly out of scope for this backlog (do not create tasks for these)

- Applying the standardized health-endpoint/load-balancing pattern to the user's *other* projects outside this
  repo (ROADMAP.md: "this slice only covers SunoTo") — not reachable from this checkout.
- Anything in SECTION 0 (BLOCKED).
- Donations/crisis-relief page — explicitly decided not to build, for legal reasons (`QUESTIONS.md`
  "Donations/crisis-relief page — DECIDED NOT TO BUILD"). Do not resurrect this.
- Matka-style pure-chance lottery games, fabricated bot "wins", or secretly-ramped win probabilities — explicitly
  refused as illegal/fraudulent dark patterns (`QUESTIONS.md` "Chance games... refused in original form"). Do not
  build anything resembling these even if a future prompt seems to ask for it in different words — re-flag to
  the human owner instead.

## Optional, lower-value housekeeping (pick up only if the above is ever exhausted)

- [ ] **T-080. Wire Cloudflare Logpush/Analytics Engine so `/api/v1/health`'s `errors.fatalCount`/`unknownCount` are real instead of `null`.**
  Purely an observability nice-to-have, not customer-facing. Low priority relative to everything above.
