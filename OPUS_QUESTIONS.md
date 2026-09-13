# SunoTo — Context & Open Questions for Opus

> **ANSWERED 2026-09-14 — see `OPUS_DECISIONS.md`.** Every question below (A–I) now has a decision with
> reasoning, and the resulting tasks are in `TASKS.md` SECTION 7 (T-095 … T-104). Keep this file as the
> statement of the questions; do not re-decide them here.

This file is a snapshot for handing off decisions to another model. It has two parts: (1) what SunoTo is, (2) every open product/business question currently blocking or shaping the roadmap.

---

## 1. What SunoTo is

SunoTo is an anonymous random-chat platform aimed at India, similar in spirit to Omegle/Chatroulette but with a broader feature set and a real monetization layer.

**Architecture**: Cloudflare Workers + Durable Objects for real-time state (chat sessions, matchmaking, party rooms, rate limiting, presence, etc.), Supabase Postgres (with RLS + security-definer RPCs) for persistent data, a vanilla-JS frontend (no framework), deployed as a Worker + static Pages site. Durable Objects require the Workers **Paid plan** ($5/month minimum) — there is no free-tier path for this architecture.

**Core features**:
- **1:1 anonymous chat** — text and video, random matchmaking, with preference filters (gender, region, interests) as paid upsells.
- **Party Rooms** — multi-user rooms with a mode system (chat, and a growing set of built-in games: trivia, wheel, jackpot, etc.), monthly-priced tiers with multi-month discounts, join codes.
- **Radio** — channel-based audio rooms with uploaded tracks, artist links, a listener-count display.
- **Wallet/credits economy** — users earn and spend credits (ads, purchases, daily streaks, guest-win bonuses) across nearly every feature: verification fees, paid messages/photos, contact unlocks, preference filters, room fees.
- **Premium membership** — `profiles.is_premium` gates ad-free browsing and unlocks premium-only features.
- **Ad model** — three tiers: free users see full-page + interstitial ads; paid-but-non-premium users see side-ads-only (no interstitials); premium users are fully ad-free.
- **Admin panel** — single dashboard for managing users, reports, grievances, feedback, restrictions, promotions, store items, and a growing set of live-reloadable config tables (`app_config`): ads, virtual/bot personas, feature flags, video, guest-win, ad-earning, daily-streak, and now a **unified pricing config** covering every priced feature in the app from one table.
- **Surprise Match** (T-091) — a recently built matchmaking variant.
- **Live World** (T-090, phase 1, premium-only) — users opt in (explicit, revocable consent) to share a coarse approximate location (snapped to a 0.5°/~55km grid for privacy) and appear as placements on a map; nearby users can request a text chat. Voice and real 3D rendering for this feature are deferred, not built.
- **Arena** (T-093, premium, prototype) — a real-time multiplayer 3D movement prototype: PUBG/BGMI-style character controller (walk/strafe/sprint/jump/crouch/prone, mouse-look via Pointer Lock, touch controls for mobile), rendered entirely client-side with Three.js. The client only broadcasts position/action/facing-direction; the server (a Durable Object relay reused from Party Rooms) does bounds/whitelist validation only — no physics or anti-cheat server-side. Currently wired into the existing Party Room infrastructure (mode `"arena"`), not yet a standalone strangers-matchmaking experience.
- **Virtual/bot personas** — code exists for AI-backed chat partners (mock provider + a Workers-AI-backed provider), but the feature is currently **disabled in production** (`app_config.virtual = {enabled:false, provider:"disabled"}`). The mock provider was found to be robotic (repeats the same phrase regardless of context); the real Workers AI path is implemented but has not yet been validated live.

**Business model in one line**: free users are ad-funded, everyone spends credits on incremental features, premium subscribers get an ad-free/expanded experience — with a single admin-editable pricing table meant to control every dollar figure in the app.

---

## 2. Open questions needing a decision

### A. Radio music sourcing
Scraping/streaming Suno.com songs directly was flagged as a ToS/legal risk (the user's counter — "not commercial use" — doesn't necessarily resolve this, since Suno's terms govern redistribution regardless of whether SunoTo itself charges money). Never resolved:
- Do we go with a **royalty-free music library** instead (manual one-time import, or a recurring importer job)?
- If yes, one-time import of a fixed set of tracks, or an ongoing pipeline that pulls new tracks periodically?

### B. Live World — voice & real 3D
Phase 1 shipped as text-chat-request + 2D map placements only. Explicitly deferred:
- Is voice chat needed for Live World, and on what timeline?
- Is a real 3D rendered world (vs. the current flat map) worth the investment, and would it reuse the Arena/Three.js controller?

### C. Arena — scope beyond the prototype
The current build wires movement into existing Party Rooms (max ~10 people per Durable Object instance). The user's original vision was bigger:
- **Total-strangers auto-matching** ("total strangers for starters") — not built yet; current Arena only works inside a Party Room you've joined with others.
- **100-person lobbies, PUBG-style**, with a game starting every 5 minutes — the current architecture caps out well below 100 per shard; scaling this needs proximity/zone-sharding or a reduced-broadcast-radius design. Worth scoping as its own project.
- **Named minigames** — Red Light/Green Light, cart racing on a track — no design or implementation started.
- **Subscription gating for interactive games** — is this the same premium tier as everything else, or a new/higher tier specific to Arena games?

### D. Month-1 feature limiting
User's instruction: *"we can limit the games so that whatever traffic we get, we can earn from it"* — i.e., deliberately restrict which games/features are live in month 1 on the free Cloudflare/low-traffic setup, then expand as revenue comes in. **Which specific games/features stay enabled for month 1, and which are held back?** This is a business call, not yet made.

### E. Bot chat (virtual personas) — activation
Code is built and the config table exists, but the feature is off. Plan was: once deployed live, flip `virtual.enabled=true` / `provider="workers-ai"` and validate real conversation quality across all 6 personas (untestable locally — Workers AI needs a real Cloudflare account token). **Is now the time to turn this on, or does it wait for more traffic/validation first?**

### F. Radio bot-listener / bot-chat simulation (T-062/T-063, not started)
Design not yet done for:
- A listener-count ramp/decay pattern to make radio rooms look populated (there's a precedent technique in `web/js/radio-active-users.js`'s `nextRadioListenerCount`, but it's used for a slightly different purpose today).
- Bot-generated chat message content and frequency in radio rooms.
- This was previously flagged as bordering on a "fabricated social proof" dark pattern — **is simulated activity/listener counts something we're comfortable shipping, and if so, how transparent should it be to users?**

### G. Group video for Party Rooms (T-064, blocking T-065–T-067)
No decision yet on the video architecture for multi-person rooms: **mesh, SFU, or capped-mesh**. Cloudflare Calls was flagged as a natural first-party fit given the existing Workers-based stack. This blocks several downstream tasks and needs a technical decision before implementation starts.

### H. Optional/deferred cleanup items (low priority, explicitly marked "not confirmed")
- **T-070**: Scrabble multiplayer party-room game — optional, not confirmed as wanted.
- **T-071**: Remove dead `publicRadioRooms` plumbing — cleanup, previously judged not worth doing.
- **T-072**: Decide whether `roomType:"radio"` should be fully removed from the backend or intentionally left reachable.
These don't block anything; listed for completeness in case priorities have changed.

### I. Cloudflare deploy — user-side action
The Pages dashboard's "Deploy command" is currently a bare `npx wrangler deploy`, which mis-parses the frontend's `vite.config.js`. Fix (dashboard-only, not something fixable from this environment): either clear the "Deploy command" field entirely, or set it explicitly to `npx wrangler deploy --config worker/wrangler.toml`. **Not yet confirmed whether the user has made this change.**

---

*Generated from an in-progress development session on 2026-09-13. If any of the above has since been decided or built, treat this file as a snapshot, not current truth.*
