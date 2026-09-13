# SunoTo — Decisions on OPUS_QUESTIONS.md

Decided 2026-09-14. Answers every open item in `OPUS_QUESTIONS.md`, keyed A–I. Each has the call, the reasoning, and concretely what to build / not build. Where a decision creates work, the matching task IDs (T-095 … T-104) are appended to `TASKS.md` SECTION 7.

**Two framing corrections up front**, because both change what "limit for month 1" should mean:

1. **There is no free-tier path, and that is fine.** Durable Objects require the Workers Paid plan — $5/month flat, not traffic-dependent. Stop looking for a free hosting option; $5/mo is the floor and it buys a very large amount of DO traffic. Do not redesign anything to chase a free tier.
2. **The games are not the cost risk.** The built-in party games are pure DO compute — effectively free at our scale. The three things that actually cost real money per user are: **Workers AI** (bot chat, per-token, unbounded), **video egress** (any SFU, per-GB), and **R2 storage/egress** (radio audio). Month-1 limiting should target those three, not the cheap games. Keeping games on is how we earn from whatever traffic arrives; that was the actual intent.

---

## A. Radio music sourcing — **curated one-time import of commercially-licensed royalty-free tracks. No Suno scraping.**

**No to scraping Suno.** The "not commercial use" argument does not hold: SunoTo shows ads and sells memberships, so any redistribution of third-party audio through it *is* commercial use. Beyond terms-of-service, the tracks themselves may carry third-party rights, and a music-redistribution complaint against a consumer app in India is an existential-category risk against a feature that is not even core. Not worth it.

**What to do instead:** a manually curated, one-time import of **60–100 tracks** across the existing radio channels, using only licenses that permit commercial use:

- **Allowed:** CC0 / public domain, CC-BY (with attribution displayed), Pixabay Music (own license, commercial OK), ccMixter commercial-permitting tracks, Free Music Archive tracks explicitly marked CC0/CC-BY.
- **Explicitly NOT allowed:** anything CC-BY-**NC** (non-commercial) — we are commercial. Anything with "no derivatives" if we ever crossfade/clip. Anything unlabeled.

**No recurring importer in month 1.** An 80-track library across 4 channels loops perfectly well below a few thousand listeners, and a scraper/importer pipeline is ongoing maintenance plus a legal-review surface for a problem we do not have yet. Revisit only when listeners complain about repetition.

**Required build:** radio tracks need `license` and `attribution_text` fields, surfaced in the player UI (CC-BY legally requires visible attribution) and required in the admin upload form. → **T-095**

---

## B. Live World voice & real 3D — **neither. Voice is a hard no for now; 3D only ever via Arena's renderer.**

**Voice: deferred indefinitely, and it needs a safety design before it is even scoped.** Voice broadcast among strangers grouped by real-world proximity is the single most dangerous surface in this product. Voice reveals age, gender, and identity instantly; it is unmoderatable at our size (no transcript, no scalable review); and pairing that with "people near you" is precisely the combination that gets consumer apps removed from app stores and into the news in India. We do not have a moderation story that can carry it. Preconditions before this is even designed: per-user report→mute→ban flow with real operator review, hard rate limits on joining voice, and a minimum-account-age gate. Until those exist, text only.

**3D: do not build a second 3D world.** If Live World ever gets 3D, it must be Arena's Three.js renderer with a Live-World spawn rule — one engine, not two. Maintaining two independent 3D code paths in a codebase this size is how both rot. Keep the 2D map. Revisit only after Arena's controller has survived real users.

No new tasks. T-090's existing deferral rationale stands and is now the permanent decision, not a "next phase".

---

## C. Arena scope — **build strangers-matching; cap at 24, not 100; Red Light Green Light first; same premium tier.**

**C1. Strangers auto-matching: yes, but as a reuse of existing matchmaking, not a new system.** Today Arena only works if you already joined a party room with someone, which does not deliver "total strangers". Build a single named auto-join lobby per region: pressing "Enter Arena" claims a slot in an `ArenaLobbyShard` Durable Object that follows the existing `MatchmakingShard`/`PartyRoomShard` patterns. Do not invent a new presence/claim mechanism — copy the claim pattern Live World already proved (`claimDirect()`). → **T-096**

**C2. Capacity: 24 per lobby for month 1, configurable. 100 is a separate project.** Do the arithmetic: at the current 10 Hz full-broadcast relay, 24 players is 24×23×10 ≈ 5.5k messages/sec through one DO — already the practical ceiling. 100 players naively is 99k msg/sec, which no single DO will carry. Getting to 100 requires three things we should not bundle into month 1: grid-cell interest management (only relay to players within ~60 m), a drop to ~5 Hz with dead-reckoning interpolation client-side, and binary delta encoding instead of JSON. Make the cap an `app_config` value so it is tunable without a deploy, ship 24, and scope 100-player as its own project gated on actually having the players. → **T-097** (cap + config), **T-098** (100-player design)

**C3. Games: Red Light / Green Light first. Cart racing deferred.** RLGG is nearly free on top of what already exists — the server needs a phase timer and a "did this player's position change during a red phase" check against a movement stream we already relay. Cart racing needs vehicle physics, a track, and collision resolution; that is a different engine, not a game mode. Build RLGG, learn whether anyone plays, then decide. The 5-minute scheduled round start is part of RLGG, not a separate lobby feature. → **T-099**

**C4. Subscription gating: the same single premium tier. Do not create a second tier.** Membership today is one tier with three durations (₹299/30d, ₹749/90d, ₹2399/365d). Adding an "Arena tier" on a pre-revenue app with zero users would split an already-untested conversion funnel and double the billing, admin, and support surface for no proven demand. Differentiate *inside* premium instead, using mechanisms that already exist: per-round entry fees in credits (via the unified `app_config.pricing` table) and cosmetics through `store_items`. Revisit tiering only once premium itself has meaningful paying volume. → no new task; the existing `is_premium` gate is correct as built.

---

## D. Month-1 feature limiting — **gate by flag, hold back the three genuinely expensive things, keep the cheap games on.**

Per the framing correction above: the games earn money and cost nothing, so keep them. Limit what burns money or reputation.

**ON at launch:** 1:1 text chat, 1:1 video, paid preference filters, party rooms + all already-built-and-tested games, radio (curated library from A), wallet/credits, all three ad tiers, premium membership, daily streak, Surprise Match.

**OFF at launch (flag-disabled by default, flippable from the admin panel when we want them):**
- **Arena** — premium prototype, unvalidated at scale.
- **Live World** — premium, and its safety surface benefits from a slow start.
- **Bot/virtual personas** — see E. Per-token cost, unbounded.
- **Game staking** — already default-off; keep off until payments and the real-money/skill-gaming legal question have actually been reviewed. Do not enable this casually.
- **Custom radio channels** — already gated; see F.

**Concrete gap this exposes:** `FLAG_KEYS` in `worker/src/policies/flagPolicy.js` has no `arena_enabled` or `live_world_enabled`. Right now those two features cannot be turned off from the admin panel at all — the only control is a redeploy. Add both flags (default disabled), enforce them on every Arena/Live-World route, and hide the nav entries when off. This is what makes "limit the games for month 1" actually operable. → **T-100**

---

## E. Bot chat (virtual personas) — **stays OFF at launch. When it ships, it ships labeled and opt-in, never as silent filler in random match.**

Three independent reasons to keep it off:

1. **Never validated.** The mock provider is provably robotic (appends an identical phrase regardless of context) and the Workers AI path has never run against a real model. Shipping unvalidated conversation quality into the product's core promise is the worst possible first impression.
2. **Reputation risk is asymmetric and permanent.** An anonymous *stranger*-chat app that quietly serves bots as strangers has lied about the one thing it sells. If a single user finds out and posts about it, the whole platform's premise is gone — and they will find out, because bots are identifiable. This is not a risk/reward tradeoff; the downside is unbounded and the upside is "empty rooms look less empty".
3. **Unbounded per-token cost** exactly as traffic grows, which is the worst cost shape available to us.

**When it does ship, it ships as a different feature than currently designed:** an explicitly labeled "AI companion" mode the user *chooses* from the home screen — not an invisible substitute injected when matchmaking finds nobody. Preconditions: (a) visible labeling in the UI and in the chat header, (b) a daily token budget cap in `app_config.virtual` with a hard cutoff, (c) quality validation across all 6 personas against the real model. → **T-101** (labeling + budget cap + validation, before any enablement)

---

## F. Radio bot-listeners / bot chat (T-062, T-063) — **not building simulated listeners or simulated chat. Decided, closed.**

This is the same call as E, and this project already refused this pattern once for the chance-games epic. Fabricated concurrent-listener counts and fake chat messages are a deception aimed at the host — the one person who can most easily verify it is false, since they know who they actually told about their channel. The moment they notice, we have taught our most invested users that our numbers are fiction. Nothing about the real goal requires lying.

**What delivers the actual goal — "a new channel shouldn't feel dead" — honestly:**
- Show **cumulative, true** signals instead of concurrent ones: total plays, tracks in queue, "42 listens today". A new channel with 3 listens reads as "new", not "broken", and it is true.
- Show the **queue and what's next** prominently — content presence, not people presence. A stocked channel with visible upcoming tracks does not feel empty even with one listener.
- Seed real engagement with **scheduled events** (a listed start time people can show up for) rather than simulating an audience that is not there.
- Keep `web/js/radio-active-users.js`'s smoothed random walk only where it is already honestly framed; do not extend it into listener counts.

**Re-enable custom radio channels without any bot layer**, using the honest metrics above. T-062 and T-063 should be closed as decided-not-building, replaced by → **T-102**.

---

## G. Group video for Party Rooms (T-064) — **capped mesh, 4 video publishers max. Cloudflare Realtime/Calls deferred behind a documented trigger.**

**Decision: capped mesh now.** 4 publishers means 3 peer connections each — well within what a mid-range Android handset in India handles, and it reuses the existing 1:1 `VIDEO_OFFER`/`VIDEO_ANSWER`/`VIDEO_ICE_CANDIDATE` signaling in `PartyRoomShard.js` almost unchanged, with renegotiation on join/leave. Zero new infrastructure, zero new per-GB cost, consistent with this project's standing "minimize infra cost, offload to clients" directive. Participants 5–10 stay audio/chat-only and see the 4 video tiles.

**Cloudflare Realtime (Calls) is the right long-term answer** — it is the correct first-party fit for a Workers/DO app and the only path to 10-way video — but it bills per-GB egress, and buying that before anyone has filled a 4-person video room is paying for demand we have not observed.

**Documented trigger to revisit:** when **>20% of party-room video sessions hit the 4-publisher cap**, build the SFU path. Instrument that counter as part of the capped-mesh work so the trigger is measurable rather than a guess.

T-064 is answered by this. T-065/T-066 proceed with capped mesh. **T-067 (video Charades) stays deferred** — text Charades already exists and works, and video Charades with only 4 publishers is a worse game than the text version, so it should wait for the SFU rather than be forced onto the mesh. → **T-103**

---

## H. Optional / deferred items

- **T-070 Scrabble — declined, close it.** Dictionary validation, tile racks, and board scoring are an order of magnitude more complex than any game built so far, and Ludo, Snake & Ladder, and Rummy already cover the board-game slot. It was never re-requested. Do not build it; if demand appears later it needs its own scoping pass, not the existing lightweight game pattern.
- **T-071 dead `publicRadioRooms` plumbing — leave as-is.** Harmless unused plumbing. Clean it up only if already editing that exact region of `web/js/app.js` for another reason. Do not spend a pass on it.
- **T-072 `roomType:"radio"` in the backend — keep it reachable, keep it filtered in the UI.** Deciding this now matters because F re-enables custom channels: removing the backend path would mean rebuilding it weeks later. Leave the backend intact, keep the create-room dropdown filtered until T-102 lands, then unfilter. Close T-072 as decided.

---

## I. Cloudflare Pages deploy — **user action, unchanged**

The Pages project's **Deploy command** is a bare `npx wrangler deploy`, which finds no `wrangler.toml` and mis-parses the frontend's `vite.config.js`. Fix in the Cloudflare dashboard — either clear the "Deploy command" field entirely (the Worker deploys separately via `npm run worker:deploy`, which is the documented architecture in `docs/DEPLOYMENT_INTEGRATION.md`), or set it explicitly to:

```
npx wrangler deploy --config worker/wrangler.toml
```

Not fixable from the repo. → tracked as **T-104** (blocked on owner).

---

## Suggested build order for whoever picks this up

1. **T-100** (arena/live-world flags) — smallest change, and it is what makes a safe launch configuration expressible at all. Do this first.
2. **T-095** (radio track license/attribution fields), then the curated import — unblocks radio for launch.
3. **T-102** (honest radio channel metrics, re-enable custom channels).
4. **T-096 + T-097** (Arena strangers lobby, capacity cap + config) — the actual gap between the prototype and the stated vision.
5. **T-099** (Red Light / Green Light).
6. **T-103** (capped-mesh group video + cap-hit instrumentation).
7. **T-101** (bot chat labeling + budget cap) — only when we actually want to turn bots on.
8. **T-098** (100-player Arena design) — only once there are players.
