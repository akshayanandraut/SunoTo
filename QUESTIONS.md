# Open Questions

Tracks decisions the user still needs to make. Updated alongside ROADMAP.md.

## Epic sequencing (after Slice 14)
- ~~Which of the three remaining epics should be built next?~~ **RESOLVED: Trust & safety first.**

## Trust & safety epic — scope resolved, build in progress
- Screenshot/recording: **visual deterrents only** — blur content on window-blur/devtools-open, show warnings. Not foolproof (no real OS-level API for this on the web), applies to non-streaming-membership users.
- Streaming membership (₹250/month): **recurring subscription** via a new Razorpay subscription/mandate flow (not the existing one-off `RazorpayService` charge pattern).
- Recording/streaming notice to peer: **persistent banner** for the whole session when the other participant holds an active streaming membership.
- Paid verification (₹100) consistency rule: **logged in on ≥15 of the last 30 days**. Unlocks profile picture + verified badge.

## Trust & safety epic — implementation follow-ups (new)
- `RAZORPAY_STREAMING_PLAN_ID` must be created in the Razorpay dashboard (a ₹250/month recurring plan) and set as a worker var/secret before subscriptions can be created — not yet done.
- `202608260018_trust_safety.sql` needs `npx supabase db push`.
- Verification unlocks "the ability to have a profile picture" per the original request, but the actual avatar upload UI was not built this slice (only the `avatar_url`/`verified_at` columns exist). Build this when picking the epic back up, or fold it into a later slice — which?

## Party rooms epic — RESOLVED, built (Slice 16, 2026-08-27)
- Spectator/viewer cap: **unlimited**. Only seats are capped at `MAX_ROOM_MEMBERS=10`.
- Seat request flow: **approval required every time**, except host-appointed co-hosts and host pre-authorized users get an auto-granted seat. Both co-host and pre-authorization require the target to hold `profiles.is_premium=true` — reusing the existing flag rather than a new payment product, per explicit user philosophy: keep prices low, maximize reach (India first, global later).
- Co-host powers: **approve/deny/revoke seats + ban participants** (same as host except appointing/revoking other co-hosts, which is host-only). Host cannot be banned.

## Games platform epic — scoping started 2026-08-27, questions open
User's direction: bring in 3rd-party games, let people wager using a **separate token currency** (not the existing "Credits" wallet), redeemable at a fixed **1 token = ₹1 (i.e. same rate as Credits)**, with winnings pool payouts at a fixed **1:100 factor between Credits and this new currency**. Withdrawal of winnings is **manual** (user contacts support) rather than automated, specifically to reduce legal exposure.

**Legal flag raised to user, not yet acknowledged**: manual/contact-based withdrawal does not change the legal classification — Indian real-money-gaming rules (28% GST, TDS under Section 194BA on net winnings, and state-level bans in Tamil Nadu/Karnataka/Andhra Pradesh/Telangana) are triggered by value convertible to real money changing hands, not by whether payout is automated or manual. This should be treated as a real-money-adjacent product for compliance purposes. Flagging again before any build starts — needs explicit acknowledgment.

**Open questions — ALL RESOLVED 2026-08-27:**
1. ~~Name for the new winnings currency~~ **RESOLVED: "Sparks"**, represented with a ⚡ lightning/thunder icon. Deliberately not gambling-coded (rejected "Chips").
2. ~~Integration approach for 3rd-party games~~ **RESOLVED: in-house games preferred, not 3rd-party integration.**
3. ~~Pool/wagering model~~ **RESOLVED (implicitly): pool-based, rank-weighted payout** — user described pot splits by ranking (correctness/response time), not 1:1 peer stakes.

**Sparks mechanics, confirmed 2026-08-27 (ratio corrected 2026-08-27 after verifying `prepare_payment_order` SQL):**
- **Existing Credits peg, verified from source** (`supabase/migrations/202608250001_phase10_offers.sql:44`, `base_credits:=target_amount_paise;`): `credit_amount` is set directly equal to `amount_paise`. Since 1 rupee = 100 paise, this means **₹1 = 100 Credits** (1 Credit = 1 paise). My earlier assumption of ₹1 = 1 Credit was wrong.
- **Exchange ratio, corrected: 1 Spark = 100 Credits = ₹1** (Sparks are the *larger* unit — opposite of what I'd documented before). This matches the user's exact statement: "1 INR = 1 Spark = 100 Credits."
- **Bidirectional conversion**: users can convert Credits → Sparks and Sparks → Credits.
- **Minimum balance to start: 100 Sparks** (= ₹100 worth) — a user must hold at least 100 Sparks before they can begin playing/wagering in the games engine.

**Games scoped 2026-08-27** (see ROADMAP.md "Games platform epic" for full detail): Daily Trivia, Double-or-Nothing rapid rounds, Brain Buzz/rapid-fire, and prediction pools on real-world public data (stock index, weather, etc.) — all skill/speed-weighted by design, sharing one stake→answer→rank→pot-split engine.

**Explicitly refused**: Matka/Matka King style card-reveal games. Pure-chance lottery gambling, illegal under the Public Gambling Act 1867 and state Gaming Acts — no skill-predominance defense applies. Not to be revisited.

**Still open before implementation starts:**
- Manual-withdrawal legal flag (see above) — not yet explicitly acknowledged by the user.

## Chance games (Wheel of Fortune / Jackpot / Coin Tower) — refused in original form, rebuilt 2026-08-27
User asked for these plus Matka with **fake bot users showing fabricated wins** and **secretly ramped win-probability tied to pool size** so the house always keeps a hidden cut without players knowing. **Refused**: fabricated social proof is a banned dark pattern (India's Consumer Protection Prevention of Dark Patterns Guidelines 2023), and concealed rigged odds on real-money-adjacent stakes is fraud/cheating (IPC 420 / BNS equivalent) — not just an RMG gray-area question like the rest of this epic. Matka itself remains refused separately (pure-chance lottery, Public Gambling Act 1867).

**User accepted alternative, now the locked design**: a disclosed-rake pool engine — house takes a fixed, shown-upfront rake % (25–50%) off each round's total stakes, unconditionally, before any payout; remaining payout pool is distributed by **static, disclosed, fixed odds** (published RTP/multiplier tables, provably-fair seeded draws for Jackpot) — no manipulation, no fake users, real leaderboard only. Full algorithm spec is in ROADMAP.md under "Games platform epic". This is what makes "platform can only earn, never lose" true by construction (rake is skimmed from real stakes, never funded elsewhere) instead of resting on hidden trickery.

**MVP build order agreed**: shared pool/rake engine → Wheel of Fortune → Jackpot raffle → Daily Trivia. Coin Tower + prediction pools are fast-follow.

**Wheel of Fortune: BUILT 2026-08-27** (see ROADMAP.md "Games platform MVP, part 1"). **Corrected same day**: Sparks is UI-only, not a real separate wallet — behind the scenes it is always Credits (1 Spark = 100 Credits, just a display transform). Users buy Credits with real money, stake/win in Credits (shown as Sparks in the Games UI), and can request a real-money payout of winnings — **not offered yet, shown as "coming soon"** per explicit instruction. Migration not yet pushed to live Supabase.

**Jackpot raffle: BUILT 2026-08-27** (see ROADMAP.md "Games platform MVP, part 2"). Same Credits-only architecture as Wheel — 1 ticket = 1 Spark = 100 Credits, max 100 tickets/purchase, one round open at a time (24h window), winner drawn by real weighted-random ticket roll (odds = your tickets / total tickets, shown live), 70% of pool to winner / 30% disclosed platform rake, auto-drawn every 10 minutes via a new Cloudflare Workers cron trigger. Migration not yet pushed to live Supabase.

**Daily Trivia: BUILT 2026-08-27** (see ROADMAP.md "Games platform MVP, part 3") — this closes out the agreed MVP build order. No randomness in payout: 1 Spark entry unlocks 5 daily questions, ranked by correct answers then response time, top scorers split 70% of the pool by a fixed disclosed tier table (30% platform rake), settled automatically by the same 10-minute cron used for Jackpot. Migration not yet pushed to live Supabase. Coin Tower and prediction pools remain fast-follow, not MVP-blocking.

## Ad-supported earning for paid users — scoped 2026-08-27, parked behind games MVP
Recommended defaults (not yet confirmed by user, using judgment per "you can recommend the answers better"):
- Eligible tier: **both `is_premium` and streaming-membership users** (broadest "paid" definition, reuses existing flags).
- Ad vendor: **design generically against Google AdSense's model** since no vendor account/credentials have been provided.
- Payout: **1 Credit per N minutes of foregrounded, non-idle time**, tunable via `ConfigService`, with a daily cap (default suggestion: 500 Credits/day) to stay under real AdSense RPM.
- Abuse prevention (non-negotiable, this auto-credits a wallet): tab-visibility/idle detection, minimum engagement threshold per tick, reuse `RateLimitShard` for per-account/per-device throttling.
Not started — explicitly deprioritized by the user in favor of the games platform.
