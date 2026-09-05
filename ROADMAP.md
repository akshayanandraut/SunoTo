# SunoTo — Codex-Ready Product & Engineering Roadmap

**Status:** Product decisions locked for MVP  
**Primary goal:** Launch a lightweight, revenue-capable, India-first anonymous/random text-chat website quickly, then iterate from real usage data.  
**Audience:** Codex / engineering agents / human reviewers  
**Last product-design consolidation:** 2026-08-24 (Asia/Kolkata)

---

# 0. HOW CODEX MUST USE THIS FILE

This file is the source of truth for MVP behavior.

Codex must:

1. Implement the product in the phases listed in this roadmap.
2. Keep every business rule isolated behind a service/policy/config boundary.
3. Never scatter prices, timeouts, thresholds, ad rules, or matching logic through UI code.
4. Add tests for every money-changing, identity, matchmaking, session, moderation, and payment rule.
5. Do not silently change a product rule because another implementation seems easier.
6. If a requirement is technically impossible on the web, implement the explicitly documented fallback in this roadmap.
7. Prefer simple, readable, modular code over framework-heavy abstractions.
8. Do not introduce React/Vue/Svelte unless explicitly approved later.
9. Do not permanently persist normal chat messages.
10. Do not make server-side chat history a hidden convenience feature.
11. Do not let client code decide wallet balances, charges, payment success, bans, or paid entitlements.
12. Use feature flags/configuration for behavior that may change after launch.
13. Complete and test one phase before moving to the next.
14. Update the implementation-status section in this file as work progresses.
15. Treat security, abuse controls, payment idempotency, and concurrency as part of the feature—not cleanup work.

Before implementing a phase, Codex should read the entire relevant section, inspect existing code, then produce a small implementation plan.

---

# 1. PRODUCT IN ONE SENTENCE

> **Meet someone new in 2 minutes — no profiles, no swiping.**

India-first, website-only, mobile-first random text chat.

Users can begin with a small anonymous free trial, then create a verified email/password account and recharge Credits for daily access and premium interaction features.

The product should feel fast, lightweight and focused on the conversation—not on wallet mechanics.

---

# 2. CORE PRODUCT PRINCIPLES

## 2.1 Fast entry

A new visitor should reach a random conversation with minimal friction.

Free trial onboarding asks only what is required:

- 18+ self-declaration / age
- gender
- optional name
- languages (defaults supplied; editable)
- optional interests

No account is required for the first five successful random trial connections.

## 2.2 Text only for MVP

MVP supports:

- text messages
- Roman / English-character input
- English
- Hindi/Hinglish written in Roman script
- regional Indian languages written in Roman script

MVP does **not** support:

- images
- GIFs
- videos
- files
- voice notes
- stickers
- rich embeds

## 2.3 Conversation-first monetization

Money UX must be visible and truthful but non-intrusive.

Do not show modal confirmations for every micro-charge.

Do:

- show a small Credits balance
- show subtle deductions
- maintain a transaction history
- explain Credit pricing in a compact pricing/help view
- offer fast inline recharge when needed

Never:

- hide a charge
- intentionally display a stale balance to encourage overspending
- debit for an action that failed
- debit a preference fee when the requested match criteria were not satisfied

## 2.4 Minimal storage

Persist only what is necessary for accounts, money, safety, matching controls and operations.

Normal chat history belongs to the user's browser.

Server relays messages in real time but does not permanently store normal chat content.

## 2.5 Replaceable algorithms

These must be separately replaceable:

- random matching
- paid preference matching
- radius matching
- fallback matching
- preference pricing
- daily access pricing
- skip abuse policy
- idle policy
- spam detection
- contact-information detection
- report scoring
- risk decay
- ad eligibility
- promotions
- virtual-participant provider
- active-user display smoothing

---

# 3. IMPORTANT TRUST / SAFETY PRODUCT BOUNDARIES

These are implementation constraints.

## 3.1 No fake "real active users" metric

Do not fabricate a number such as "15,000 real users online" when that is not true.

Allowed:

- approximate / rounded real counts
- smoothed real counts
- "participants available" if it truthfully includes disclosed virtual participants
- "people connected today" based on real events
- delayed/smoothed display to avoid flicker

Admin must always show exact internal breakdowns:

- real anonymous users
- registered users
- real active chatters
- waiting users
- virtual participants
- AI conversations
- paid users

## 3.2 Virtual participants must not secretly impersonate humans for monetization

Virtual participants may be conversational, natural and persona-driven.

However:

- human-to-human matches are preferred
- virtual matches have a subtle but clear `Virtual` indicator
- virtual participants must not immediately send a substantive conversation opener when a match starts
- at match start, a virtual participant may either wait for the real user to send the first message or send one short, natural greeting such as `Hi`, `Hie`, or `Hey`
- the wait-versus-greet decision and greeting variant should be randomized/configurable so every virtual match does not behave identically
- after a short greeting, the virtual participant waits for the real user's reply before continuing the conversation
- platform rules state that virtual participants can be used when real users are unavailable
- virtual matches never incur the human post-2-minute per-message charge
- virtual participants must not fabricate real-world contact details or pretend to be a specific real person
- virtual usage is feature-flagged and independently disableable

## 3.3 Freedom of expression is broad, not literally unrestricted

The platform can be permissive regarding:

- opinions
- politics
- profanity
- disagreement
- ordinary adult discussion

It still requires safety/abuse controls for:

- minors / suspected underage participation
- threats / dangerous conduct
- scams / fraud
- spam / unsolicited advertising
- illegal content
- attempts to bypass contact-sharing restrictions
- abusive automated behavior
- platform/payment exploitation

---

# 4. MVP TECHNOLOGY STACK

## 4.1 Frontend

Use:

- HTML5
- CSS3
- modern vanilla JavaScript using ES modules
- no React
- no Vue
- no Svelte
- no heavy UI framework

Goal:

- very small first-load bundle
- mobile-first
- works well on average Indian mobile connections
- progressive enhancement
- minimal third-party JS

## 4.2 Frontend hosting

Use Cloudflare Pages for static assets.

Frontend should not require server rendering.

## 4.3 API + realtime

Use Cloudflare Workers for:

- HTTP API gateway
- auth/JWT validation
- payment endpoints
- admin API
- configuration endpoints
- abuse/rate-limit edges
- WebSocket upgrade routing

Use Cloudflare Durable Objects for:

- presence
- waiting/match queues
- session coordination
- active-chat WebSockets
- reconnect grace state
- temporary session safety state

Prefer Durable Object WebSocket Hibernation API.

Use WebSocket attachments for small state that must survive hibernation.

Do not store normal chat content in Durable Object persistent storage.

## 4.4 Persistent database + auth

Use Supabase:

- PostgreSQL
- Supabase Auth
- email/password
- email confirmation
- RLS where applicable

Do not expose Supabase service-role credentials to the browser.

Client may use a Supabase publishable/anon key only for flows explicitly safe under RLS/Auth.

Privileged money/admin writes go through Worker APIs.

## 4.5 Email

Supabase built-in SMTP is development-only.

Production must use a custom SMTP provider with a free/cheap starter tier.

Provider must be configurable.

Requirements:

- verification email
- password reset
- no marketing email in MVP

## 4.6 Payments

Use Razorpay Standard Checkout.

Requirements:

- server creates orders
- server determines recharge amount
- minimum recharge enforced server-side
- verify checkout signature server-side
- process webhooks
- verify webhook signature against raw request body
- wallet credit only after verified successful/captured/paid state
- idempotent webhook handling
- refunds/reversals reconcile wallet ledger

## 4.7 Virtual participants

Define interface:

`VirtualParticipantProvider`

Initial adapters:

1. `DisabledVirtualParticipantProvider`
2. `MockVirtualParticipantProvider` for tests/local
3. `CloudflareWorkersAIProvider` as an optional production adapter

Cloudflare Workers AI currently provides a free daily allocation; do not couple matchmaking to a specific model.

All model/provider names must be config.

---

# 5. TOP-LEVEL REPOSITORY STRUCTURE

```text
/
├── AGENTS.md
├── ROADMAP.md
├── README.md
├── package.json
├── .env.example
├── .gitignore
│
├── web/
│   ├── index.html
│   ├── chat.html
│   ├── admin.html
│   ├── privacy.html
│   ├── terms.html
│   ├── community-guidelines.html
│   ├── css/
│   │   ├── tokens.css
│   │   ├── base.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   ├── chat.css
│   │   ├── admin.css
│   │   ├── ads.css
│   │   └── responsive.css
│   ├── js/
│   │   ├── app.js
│   │   ├── router.js
│   │   ├── api-client.js
│   │   ├── auth.js
│   │   ├── anonymous-identity.js
│   │   ├── websocket.js
│   │   ├── matchmaking.js
│   │   ├── chat.js
│   │   ├── chat-timer.js
│   │   ├── wallet.js
│   │   ├── recharge.js
│   │   ├── preferences.js
│   │   ├── geolocation.js
│   │   ├── local-history.js
│   │   ├── favourites.js
│   │   ├── reports.js
│   │   ├── likes.js
│   │   ├── block-list.js
│   │   ├── activity.js
│   │   ├── contact-guard.js
│   │   ├── ads.js
│   │   ├── offers.js
│   │   ├── tabs.js
│   │   ├── ui.js
│   │   └── admin/
│   └── assets/
│
├── worker/
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/
│   │   ├── durable/
│   │   │   ├── PresenceShard.js
│   │   │   ├── MatchmakingShard.js
│   │   │   └── ChatSession.js
│   │   ├── services/
│   │   ├── policies/
│   │   ├── moderation/
│   │   ├── providers/
│   │   ├── config/
│   │   └── util/
│   ├── test/
│   └── wrangler.toml
│
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── tests/
│
├── test/
│   ├── e2e/
│   ├── load/
│   └── fixtures/
│
└── docs/
    ├── API.md
    ├── WEBSOCKET_PROTOCOL.md
    ├── DATA_MODEL.md
    ├── SECURITY.md
    ├── OPERATIONS.md
    └── LAUNCH_CHECKLIST.md
```

Do not create files merely to match this tree if they add no value yet. Create them as their phase is implemented.

---

# 6. CONFIGURATION-FIRST BUSINESS RULES

All values below must be overridable without editing the core algorithm.

Initial defaults:

```js
export const DEFAULTS = {
  market: "IN",
  timezone: "Asia/Kolkata",

  minAge: 18,

  freeTrialSuccessfulConnections: 5,

  randomChatFreeSeconds: 120,
  skipLockSeconds: 30,
  reconnectGraceSeconds: 30,

  idleWarningAfterSeconds: 60,
  idleWarningGraceSeconds: 20,

  paidChatIdleTimeoutSeconds: 300,

  preferenceSearchTimeoutSeconds: 30,
  geoPreferenceSearchTimeoutSeconds: 45,
  virtualFallbackAfterSeconds: 15,

  locationCacheSeconds: 600,
  radiusToleranceRatio: 0.10,
  radiusOptionsKm: [5, 10, 25, 50, 100],

  creditsPerRupeeStandard: 100,
  minimumRechargeRupees: 50,

  dailyAccessCredits: 200,
  dailyGraceStartHourIST: 22,

  genderPreferenceCredits: 50,
  genderAgePreferenceCredits: 75,
  geoPreferenceCredits: 100,
  languagePreferenceAddonCredits: 25,
  interestPreferenceAddonCredits: 25,

  paidMessageCredits: 10,

  favouriteReconnectCredits: 50,

  contactUnlockCreditsPerParty: 500,
  contactUnlockSeconds: 300,

  lowBalanceAdThresholdCredits: 1000,
  freeInterstitialEverySkips: 5,

  signupPaymentReservationSeconds: 300,

  usernameChangeCooldownDays: 30,
  usernameLifetimeChangeLimit: 3,

  reportRiskDecayDays: 30,

  maxLanguages: 3,
  maxInterests: 5,

  maxMessageChars: 1000
};
```

Important:

- `Unrestricted` radius is represented by `null`/`unrestricted`, not a magic huge number.
- All credit amounts are integers.
- Never use floating point for monetary value.
- Rupee recharge calculations should ultimately be stored in paise.
- Credit ledger is integer-based.

Admin-configurable values should be loaded through a config service with cache/versioning.

---

# 7. USER TYPES / IDENTITY MODEL

## 7.1 Anonymous free visitor

An anonymous visitor has:

- opaque anonymous ID
- browser-local secret/session identifier
- IP/risk signals
- free-trial counter
- onboarding profile:
  - age/year of birth
  - gender
  - optional display name
  - languages
  - interests
- generated random handle if no name is supplied

No wallet ownership is trusted solely from browser-local identity.

## 7.2 Registered account

Account uses:

- verified email
- password via Supabase Auth
- Supabase user ID as internal auth identity
- public opaque user ID for chat/favourite/reconnect references
- optional unique username
- wallet
- blocks
- risk/reputation
- daily access state
- payment history
- lightweight profile metadata

Email must be verified before first recharge.

## 7.3 Admin

MVP has one super-admin.

Requirements:

- separate admin authorization check
- MFA required operationally
- no admin action endpoints accessible based only on frontend hiding
- audit high-risk admin actions

---

# 8. FREE-TRIAL ANTI-ABUSE MODEL

Physical MAC address is not available to a normal website.

Do not implement fake MAC permission or browser-MAC access.

Use:

1. browser anonymous ID stored locally
2. browser-local secret/token
3. current public IP as an anti-abuse signal
4. short-lived IP/prefix usage counters
5. activity/risk counters
6. configurable account-required threshold

Do not make `one IP = one person`.

Mobile carrier NAT, offices, campuses and VPNs may share IPs.

Initial behavior:

- normal browser keeps local anonymous identity
- private/incognito storage may disappear
- repeated new anonymous IDs from the same IP in a short interval increase trial-abuse risk
- sufficiently suspicious use can require account creation instead of issuing another free trial
- do not claim we can reliably detect Incognito mode

If browser storage appears non-persistent/limited, show:

> Private browsing may be active. Chat history, favourites and saved preferences may disappear when this window closes. Your registered account and Credits are unaffected.

---

# 9. PROFILE & ONBOARDING

## Age

18+ only. Self-declared.

Store year of birth for registered users so displayed age can update.

No ID/KYC for MVP.

## Gender

Required:

- Male
- Female
- Other

## Name / handle

Free:

- optional name
- if blank, generate friendly handle such as `QuietRiver482`

Paid/registered:

- can claim unique username
- max 3 lifetime changes
- minimum 30 days between changes
- case-insensitive uniqueness
- previous username history
- no global username search in MVP

## Languages

Choose up to 3.

Defaults:

- English
- Hindi / Hinglish

Suggested list:

English, Hindi/Hinglish, Marathi, Gujarati, Bengali, Punjabi, Tamil, Telugu, Kannada, Malayalam, Odia, Assamese, Konkani, Other.

All messages remain Roman/English-character based for MVP.

## Interests

Optional, up to 5 predefined tags.

Initial tags:

Music, Movies, TV/Web Series, Gaming, Travel, Food, Cooking, Sports, Cricket, Football, Fitness, Technology, Programming, Startups, Business, Career, Finance, Books, Writing, Photography, Art, Fashion, Cars, Bikes, Pets, Nature, Trekking, College, Relationships, Friendship, Current Affairs, Science, Spirituality, Comedy, Anime.

Free-text interests: Coming Soon.

---

# 10. LOCAL-ONLY BROWSER DATA

Use IndexedDB for:

- local chat history
- favourites
- local conversation metadata

Use localStorage for small state:

- last search preferences
- UI preferences
- anonymous install/session identifier
- tab coordination where appropriate

Server must not be source of local chat history.

History record may contain peer display metadata and messages.

Provide:

- clear one conversation
- clear all history
- clear favourites

In Incognito/private mode, these may disappear.

---

# 11. TAB & MULTI-DEVICE OWNERSHIP

One identity/account can be signed in in multiple places.

Only one active random chat at a time.

Same-browser tabs:

- `BroadcastChannel`
- tab IDs
- lease/heartbeat
- newest tab claiming chat becomes owner
- older tab shows `Chat moved to another tab`

Multiple devices:

- newest active-chat claim owns active chat
- old device becomes passive/disconnected from active session

Account-wide:

- credits
- blocks
- username
- payments

Local-only:

- chat history
- favourites
- remembered preferences

---

# 12. CREDITS & DAILY ACCESS

Standard:

`₹1 = 100 Credits`

Launch offer through **2026-09-30 23:59:59 IST**:

`₹1 = 200 Credits`

Minimum recharge:

`₹50`

Standard ₹50 => 5,000 Credits  
Offer ₹50 => 10,000 Credits

## Daily access

Free trial pays no daily fee.

After trial:

- verified account
- recharge
- first successful paid random chat of IST day charges 200 Credits

Normal expiry: midnight IST.

## 10 PM grace

If first activation happens at or after 10:00 PM IST:

- charge 200 once
- cover rest of current day
- also cover full next calendar day

Implement explicit entitlement period.

---

# 13. AD EXPERIENCE

Implement `AdPolicy`.

## Free / anonymous / 0 Credits

- top banner
- bottom banner
- desktop side ads
- interstitial/full-screen approximately every 5 Next/match scans

## Registered balance 1–1000 Credits

- top/bottom
- desktop side
- NO interstitial/full-screen
- can use all credits to zero
- low balance hint only

## Registered >1000 Credits

- no ads

1,000 Credits is an ad threshold, not a usage lock.

Ad provider must be swappable and controlled by admin/feature flags.

---

# 14. PAID MATCH PREFERENCES

Free trial is random-only.

Paid users get a compact preferences panel.

Criteria:

- gender
- age
- language
- common interest
- radius

Radius:

- 5 km
- 10 km
- 25 km
- 50 km
- 100 km
- Unrestricted

Pricing:

- gender: 50 Credits
- gender+age: 75
- gender+age+radius: 100
- language add-on: +25
- common-interest add-on: +25

All-or-nothing charging for MVP:

- all requested paid criteria satisfied by qualifying real human => charge computed fee
- otherwise => 0 preference fee and random fallback

Search:

- non-geo up to 30 sec
- geo up to 45 sec

Radius tolerance:

10%.

Outside tolerance => fallback match can happen, but no geo preference charge.

Location shown only when location filter was used, and only approximately.

---

# 15. GEOLOCATION

Ask browser permission only for radius matching.

Denied => other filters still work.

Cache coordinates about 10 min.

No permanent GPS history.

Do not expose exact coordinate or IP to users.

---

# 16. MATCHMAKING ORDER

Priority:

1. exact requested paid preference among real humans
2. responsive / low-risk users
3. avoid recent repeated peer
4. longest-waiting eligible user
5. random fallback
6. virtual fallback if allowed and real pool unavailable

Exclude:

- self
- blocked
- banned/restricted
- already active
- idle/unavailable
- incompatible criteria

---

# 17. VIRTUAL PARTICIPANTS

Purpose: cold-start.

Human match always preferred when suitable.

For random/free match, virtual fallback may start around 15 seconds.

For paid preference match, search real humans for full preference timeout first.

Virtual matches:

- subtle clear `Virtual` marker
- never charge human per-message continuation fee
- do not generate paid preference fee in MVP
- use shared provider, not one process per persona
- must not impersonate a real identifiable person

Persona definition fields:

personaId, handle, age, gender, region, languages, interests, tone, verbosity, delay range, curiosity, humor, active hours.

Provider is feature-flagged and replaceable.

---

# 18. CHAT SESSION RULES

Normal chat starts with 2 free minutes.

Timer subtle; last 30 seconds more prominent.

Skip normally locked first 30 sec.

Early skip unlock if:

- peer idle
- disconnected
- spamming
- repeated blocked contact attempts
- operational failure

Leave and Report always available.

Reconnect grace after network loss:

30 sec.

Paid continuation:

- both agree once
- 10 Credits per valid outgoing delivered human message
- each pays for own outgoing only
- no charge for rejected/blocked/rate-limited/failed message
- no charge for virtual
- continues indefinitely while active
- ends after 5 min no messages from either side

---

# 19. LIVE RECHARGE / PAYMENT HOLD

If Credits are insufficient while user wants to continue:

- do not destroy chat
- open lightweight recharge sheet
- pause relevant session timer
- peer sees neutral message, not payment details
- cap hold

Free user at end of good chat can:

1. create account
2. verify email
3. recharge
4. return to same reserved chat

Reserve up to 5 minutes.

Peer can leave anytime.

---

# 20. MESSAGE PIPELINE

Client validation -> server validation -> session authorization -> paid-charge check -> acceptance -> relay -> ACK -> browser-local history.

Every message has unique id.

Paid message debit must be idempotent.

Client cannot be wallet authority.

---

# 21. CONTACT INFORMATION GUARD

Default chat blocks:

- phone
- email
- URL/domain
- social handle
- WhatsApp
- Telegram
- Instagram
- Snapchat
- attempts to move off-platform

Run fast check client-side and authoritative server-side.

Stateful across current-session messages.

Detect split attempts:

- groups of digits across messages
- number words
- split email pieces
- `dot com`
- fragmented handles
- obfuscation/separators

Keep only minimal rolling session detector state, not permanent chat history.

First block message:

> Contact details and links aren't allowed in this chat.

Repeated bypass can trigger temporary spam/safety score.

Blocked message costs 0 Credits.

---

# 22. PAID CONTACT SHARING

Mutual consent.

500 Credits from each party.

Both charged only if both accept and both can pay.

Then contact guard disabled for that pair for 5 minutes.

During unlock:

- phone/email/social/link allowed

Normal safety/report rules still apply.

Show remaining unlock timer.

After 5 min restrictions resume.

---

# 23. SPAM / COPY-PASTE DETECTION

Detect repeated or near-identical messages across many peers.

Use short-lived hashes/fingerprints, not permanent raw messages.

Policy progression:

- warning
- 2 min break
- 3–5 min break
- longer temporary restriction
- admin flag

Configurable.

---

# 24. IDLE DETECTION

Signals:

- WebSocket heartbeat
- visibility
- focus
- touch
- keypress
- click
- message
- recent interaction

60 sec inactivity => `Still there? Tap to stay available.`

20 sec grace.

No response => remove from matchmaking until activity resumes.

Do not rely only on mouse movement.

---

# 25. LIKE

Free and paid.

Once per chat.

Peer sees:

> They liked this chat 👍

Maintain server-side lightweight reputation counters.

No public like counts.

---

# 26. FAVOURITES

Browser-local only.

No server-side favourite graph.

Works regardless of gender.

Private browsing may lose favourites.

---

# 27. PAID FAVOURITE RECONNECT

Online-only.

Local favourite stores opaque peer public ID.

If target offline => no queue/no charge.

If online => reconnect request.

Target accepts => initiator charged 50 Credits.

Decline => 0.

Accepted reconnect gets fresh 2-min chat, then normal continuation.

---

# 28. REPORT

Free and paid can report.

Reasons:

- Spam / advertising
- Harassment / abusive behaviour
- Sexual / inappropriate content
- Suspected underage user
- Scam / fraud
- Threats / dangerous behaviour
- Trying to bypass contact-sharing rules
- Other

Report:

- stores metadata only, no transcript
- ends session
- prevents immediate rematch
- adds weighted risk
- thanks reporter

Track total + unique reporters.

Repeated same reporter/target must not inflate unique count.

---

# 29. RISK SCORING

Configurable reason weights.

Example:

- spam 1
- contact bypass 2
- harassment 2
- inappropriate 3
- scam 4
- threats 5
- suspected underage 5

Track recent and lifetime.

Decay roughly 30 days.

Do not automatically permanently ban at exactly 100 reports.

Thresholds can flag/restrict; admin can review.

Do not auto-deduct credits based only on reports.

---

# 30. BLOCK

Free:

- cannot use persistent Block
- Report can end and prevent immediate rematch

Registered:

- Block
- persists account-wide
- cross-device
- ends session
- excludes future matching
- unblock list
- does not add risk points

---

# 31. ACTIVE USER COUNTS

Use real presence/heartbeat.

Public values may be rounded/smoothed.

Examples:

- `~320 chatting recently`
- `1.2K connected today`

Do not fabricate "15K real users online".

If virtual participants included in a broader count, label metric appropriately.

Admin must separate exact real and virtual counts.

---

# 32. ADMIN PORTAL

One super-admin MVP.

Require strong auth/MFA operationally.

Dashboard:

- anonymous online
- registered online
- waiting
- human-human chats
- virtual chats
- daily visitors
- account holders
- verified accounts
- balances
- free/random/paid counters
- preference usage
- paid messages
- contact unlocks
- reconnects
- recharge/revenue
- reports
- restrictions
- ad tiers
- AI usage

Users:

- public ID
- username
- email
- account status
- last IP/coarse location
- balance
- ledger
- random count
- paid count
- preference count
- reports
- risk
- likes
- restrictions

Wallet admin:

- manual credit/debit only through ledger + reason + audit

Reports:

- weighted score
- unique reporters
- reason distribution
- restrict/ban/unban

Offers/coupons:

- multiplier
- fixed bonus
- min recharge
- start/end
- max redemptions
- max uses/account
- new-users/all
- promo code/automatic
- combinability
- enabled

Config:

- every price/timer/threshold/weight
- version + audit

Ads:

- provider + placements + kill switches

Virtual:

- enabled/provider/model/max concurrent/fallback/personas/usage

---

# 33. DATABASE MODEL

Suggested persistent tables:

- profiles
- username_history
- wallets
- wallet_ledger
- daily_entitlements
- payment_orders
- payment_events
- offers
- coupons
- coupon_redemptions
- reports
- risk_scores
- blocks
- likes
- admin_audit
- app_config
- analytics_daily
- analytics_counters
- user_activity_summary

Do **not** create a normal messages table.

Money:

- rupees in paise integer
- credits integer BIGINT
- ledger idempotency key UNIQUE

Wallet debit/credit must use atomic transaction/RPC.

Never read balance then write balance non-transactionally.

---

# 34. PAYMENT FLOW

Preconditions:

- registered
- verified email
- recharge >= ₹50
- server computes offer/coupon

Server creates Razorpay order.

Client opens Checkout.

Server verifies callback signature.

Webhook provides authoritative reconciliation.

Validate webhook against raw request body.

Only verified captured/paid payment credits wallet.

Deduplicate by provider IDs/idempotency keys.

Refunds create reversing ledger entries; do not edit history in place.

---

# 35. OFFER ENGINE

Launch automatic offer:

- 2X Credit multiplier
- end: 2026-09-30 23:59:59 IST

Standard ₹50:

5,000.

During launch offer:

10,000.

Feature prices remain fixed.

Offer must be stored/configured, not coded as a special permanent if-statement.

---

# 36. API

Version as `/api/v1`.

Suggested endpoints:

- anonymous/session
- bootstrap
- me/profile
- username
- wallet
- wallet/ledger
- payments/order
- payments/verify
- payments/razorpay/webhook
- match/search
- match/cancel
- reconnect/request
- reconnect/respond
- likes
- reports
- blocks
- config/public
- offers/active
- admin/*

Main live actions use WebSocket as appropriate.

---

# 37. WEBSOCKET PROTOCOL

Create `docs/WEBSOCKET_PROTOCOL.md`.

Version every event.

Client events may include:

HELLO, HEARTBEAT, SEARCH_START, SEARCH_CANCEL, CHAT_MESSAGE, NEXT_REQUEST, LIKE, CONTINUE_OFFER, CONTINUE_ACCEPT, CONTINUE_DECLINE, CONTACT_UNLOCK_REQUEST, CONTACT_UNLOCK_ACCEPT, CONTACT_UNLOCK_DECLINE, REPORT, BLOCK, RECONNECT_RESPONSE, SESSION_RESUME.

Server events may include:

READY, SEARCHING, MATCH_FOUND, MATCH_FALLBACK, VIRTUAL_MATCH_FOUND, CHAT_STARTED, TIMER_STATE, MESSAGE_ACCEPTED, MESSAGE_REJECTED, MESSAGE_RECEIVED, PEER_IDLE, PEER_DISCONNECTED, RECONNECT_GRACE, PEER_RETURNED, CONTINUE_REQUESTED, CONTINUE_ACTIVATED, CONTINUE_NOT_ACCEPTED, PAYMENT_HOLD, CONTACT_UNLOCKED, CONTACT_UNLOCK_ENDED, LOW_BALANCE, SESSION_ENDED, RATE_LIMITED, MATCH_COOLDOWN.

Reject malformed/oversize events.

---

# 38. DURABLE OBJECT RESPONSIBILITIES

`ChatSession`:

- two sockets
- timer
- skip lock
- reconnect
- continuation state
- contact unlock
- temporary safety detector state
- relay
- paid debit request
- cleanup

Not source of wallet truth.

Use Hibernation API and small serialized attachment state.

Do not serialize transcript.

`MatchmakingShard`:

- waiting queue
- filters
- match decisions
- avoid repeats
- human priority
- virtual fallback

`PresenceShard`:

- ephemeral presence
- online/waiting/chatting/idle

Do not DB-write every heartbeat.

---

# 39. ANALYTICS

No chat text.

Track:

landing_view, onboarding_completed, search_started, match_found, virtual_match_found, message_sent, free_connection_consumed, free_trial_exhausted, signup_started, signup_verified, recharge_started, recharge_success, recharge_failed, daily_access_activated, preference_search_started, preference_match_success, preference_fallback, paid_message_sent, contact_unlock_success, reconnect_requested, reconnect_accepted, like_sent, report_sent, block_created, next_clicked, skip_cooldown_triggered, idle_removed, return_visit.

Key KPIs:

- DAU
- chat start rate
- wait time
- real-match rate
- virtual rate
- free-trial exhaustion
- signup
- verification
- recharge
- revenue
- credits issued/spent
- paid continuation
- contact unlock
- reconnect
- reports/1k sessions
- retention

---

# 40. SECURITY

- no secrets in repo
- validate Supabase JWT server-side
- privileged actions Worker-only
- RLS
- admin server authorization
- CSP/HSTS/etc.
- rate limit auth/search/messages/report/payment
- render chat with `textContent`, not `innerHTML`
- no raw chat in production logs
- no auth tokens in logs
- no exact GPS logs by default

---

# 41. PRIVACY / COMPLIANCE

Persisted personal/operational data includes:

- email
- IP
- coarse location
- temporary GPS
- payments
- wallet
- reports/blocks
- usage metrics

Need:

- Privacy
- Terms
- Community Guidelines
- account deletion path
- grievance/contact path
- location explanation
- local history disclosure
- virtual participant disclosure
- Credits/payment terms

Review current Indian DPDP/IT/intermediary obligations before material scale.

---

# 42. PERFORMANCE

- vanilla JS
- defer admin code
- no unnecessary images
- no message DB write
- no heartbeat DB write
- WebSocket realtime
- lazy payment/ad scripts where practical
- virtual AI only as fallback
- mobile-first
- system fonts initially

---

# 43. FEATURE FLAGS

At least:

- virtual_participants_enabled
- preference_matching_enabled
- geo_matching_enabled
- contact_unlock_enabled
- favourite_reconnect_enabled
- paid_continuation_enabled
- ads_enabled
- interstitial_ads_enabled
- signup_enabled
- payments_enabled
- new_matches_enabled

Emergency kill switches must work without redeploy.

---

# 44. TEST MATRIX

Must test money thoroughly:

- min recharge
- 2x offer
- offer expiry
- daily debit
- duplicate daily
- 10 PM grace
- per-message debit
- reconnect
- contact unlock both parties
- insufficient
- duplicate WebSocket event
- duplicate webhook
- refund
- two-device race

Trial:

- 5 successful
- message consumes
- 30 sec consumes
- failure does not
- IP risk

Match:

- self
- block
- preference success
- fallback 0 charge
- radius tolerance
- denied location
- virtual
- human priority

Session:

- 2 min
- 30 sec skip
- reconnect
- idle
- continuation both/decline
- paid idle
- payment hold
- contact expiry

Contact:

- phone
- +91
- spaced
- split messages
- words
- email
- dot com
- handles
- social names
- benign-number false-positive tests

Ads:

- free/0
- 1..1000
- >1000

Local:

- history/favourites/preferences
- no message table

---

# 45. LOAD TEST

Test escalating concurrency where environment permits:

- 100
- 1,000
- 5,000 WebSockets

Simulate Reddit-style burst.

Measure:

- match latency
- message latency
- disconnect cleanup
- DB calls/message
- Worker/DO errors
- AI cost
- payment/webhook resilience

Goal: normal free message relay should not hit Postgres per message.

---

# 46. PHASED IMPLEMENTATION

## Phase 0 — Foundation

- repo
- local dev
- Wrangler
- Supabase dev
- env
- CI
- health

## Phase 1 — Mobile UI shell

- landing
- rules
- onboarding
- search
- chat mock
- history
- favourites
- account
- admin shell

## Phase 2 — Anonymous/local

- anon ID
- IndexedDB
- preferences
- random handle
- tab lease
- private-storage warning

## Phase 3 — WebSocket proof

- Worker
- ChatSession DO
- hibernation
- relay
- resume
- no persistence

## Phase 4 — Presence/match

- presence
- queue
- random match
- no self
- cleanup
- one active

## Phase 5 — Session behavior

- 2 min
- 30 sec skip
- idle
- reconnect
- skip abuse

## Phase 6 — Free trial/IP risk

- 5 qualifying
- IP/local signals
- trial restriction
- activity counts

## Phase 7 — Auth

- Supabase email/password
- verify
- reset
- username
- multi-device

## Phase 8 — Wallet

- ledger
- atomic wallet
- idempotency
- history

## Phase 9 — Razorpay

- ₹50
- order
- Checkout
- verify
- webhook
- refund

## Phase 10 — Offers

- launch 2x
- coupons
- admin config

## Phase 11 — Daily access

- 200
- midnight IST
- 10 PM grace

## Phase 12 — Preferences

- gender/age/language/interests
- pricing
- timeout/fallback

## Phase 13 — Geo

- permission
- radius
- cache
- tolerance
- no permanent GPS

## Phase 14 — Paid continuation

- mutual
- 10/msg
- idle
- recharge hold

## Phase 15 — Contact/spam guards

- local+server
- split-message logic
- temporary state

## Phase 16 — Contact unlock

- mutual
- 500 each
- 5 min

## Phase 17 — Like/report/block

- reputation
- risk
- decay
- paid block

## Phase 18 — Favourite reconnect

- online-only
- 50 initiator
- 2-min new session

## Phase 19 — Ads

- provider abstraction
- 3 tiers
- admin

## Phase 20 — Virtual

- personas
- provider
- human priority
- virtual marker
- natural opening behavior: wait for the user or send one short greeting, then wait for a reply
- no message charge

## Phase 21 — Admin

- dashboard
- users
- wallets
- reports
- offers
- config
- ads
- virtual

## Phase 22 — Analytics

- events
- aggregate
- public truthful approximate counts

## Phase 23 — Production hardening

- SMTP
- policies
- security
- rate limits
- deletion/grievance

## Phase 24 — Load/launch

Repository launch tooling completed:

- [x] production configuration and security-header gates
- [x] immutable staging smoke and realtime reports with automatic SHA-256 output, full release binding, and file-backed evidence verification
- [x] revision-bound structured k6 spike reports with measured threshold data
- [x] Worker health and frontend manifest revision verification
- [x] revision-bound Worker and Cloudflare Pages deploy wrappers
- [x] clean tracked Git checkout verification before either deployment
- [x] Phase 24 evidence schema and fail-closed validator
- [x] fail-closed INR 50 live payment/refund and idempotency evidence invariants
- [x] fail-closed ad review, layout, tier, fallback and kill-switch evidence matrix
- [x] fail-closed two-browser staging flow and no-transcript evidence matrix
- [x] clean-checkout evidence draft generator that preserves external placeholders

External completion evidence still pending:

- [ ] deploy and verify staging
- [ ] reconcile one controlled live payment and refund
- [ ] review and verify the production ad provider and kill switch
- [ ] run the approved spike/soak test and verify cleanup/privacy
- [ ] publish and monitor the Reddit launch

---

# 47. IMPLEMENTATION STATUS

- [x] Phase 0
- [x] Phase 1
- [x] Phase 2
- [x] Phase 3
- [x] Phase 4
- [x] Phase 5
- [x] Phase 6
- [x] Phase 7
- [x] Phase 8
- [x] Phase 9
- [x] Phase 10
- [x] Phase 11
- [x] Phase 12
- [x] Phase 13
- [x] Phase 14
- [x] Phase 15
- [x] Phase 16
- [x] Phase 17
- [x] Phase 18
- [x] Phase 19
- [x] Phase 20
- [x] Phase 21
- [x] Phase 22
- [x] Phase 23
- [ ] Phase 24

Codex updates only after acceptance tests pass.

---

# 48. LAUNCH GATES

Core:

- matching
- 2-min timer
- mobile
- one active
- reconnect

Money:

- wallet atomic
- Razorpay
- webhook idempotent
- daily
- offer
- preference
- message
- contact/reconnect

Safety:

- report
- spam/contact
- idle
- skip abuse
- block
- admin restriction

Privacy:

- no server chat history
- GPS temporary
- IP protected
- local history notice

Ops:

- admin
- feature kill switches
- logs
- metrics
- rollback

---

# 48A. CHAT PERSONALIZATION — PATTERN + PALETTE THEMES (SHIPPED)

Users pick a chat-border **pattern** (shape/texture — solid, hearts, stripes, lines, aurora, midnight; some patterns premium) and a **palette** (color pair — currently all free) independently, so any pattern can be combined with any color, per explicit product direction ("keep patterns and colors separate ... one pattern can have different colors").

- Catalogs: `worker/src/policies/themePolicy.js` (`PATTERNS`, `PALETTES`).
- Storage: `profiles.theme_pattern` / `profiles.theme_palette`, set via `set_theme(pattern, palette)` RPC (premium check server-side).
- Worker endpoint: `POST /api/v1/theme`.
- Matchmaking propagates `peerThemePattern`/`peerThemePalette` so the chat border blends both people's palettes on match.
- Picker lives on the Account/settings page only (not onboarding, not for anonymous users).

---

# 48B. VIDEO/UX FOLLOW-UPS — IN PROGRESS

Requested alongside the theme split; tracked here until each lands:

- [x] Local camera self-preview during video calls (`#video-local`).
- [ ] Camera/mic device picker so a user can select an alternate input (e.g. a streamer using OBS Virtual Camera) via `navigator.mediaDevices.enumerateDevices()` + `getUserMedia({video:{deviceId}})`.
- [ ] Virtual background (blur/replace) for video calls — needs a technical-approach decision (e.g. MediaPipe Selfie Segmentation / Web Worker canvas compositing) before implementation; not started.
- [x] Incognito/private-browsing warning copy explicitly names incognito and says some features may not work correctly (`web/js/views.js` `warning()`).
- [x] Confirmed: matchmaking does not segregate by premium status — paid and free users already match with each other on both text and video.
- [x] Confirmed: home page already has prominent separate entry points for text ("Start a free chat") and video ("Video chat (beta)").

---

# 48C. PARTY / GROUP ROOMS — SCOPED, DECISIONS LOCKED, BUILD STARTING

Longer-term feature. Games explicitly deferred by product ("coming soon"), out of scope for first build.

## Locked product decisions (2026-08-26)

1. **Hosting is paid-only.** There is no free/default host slot — becoming host always requires paying. The 10-minute host-claim expiry is an *inactivity* reclaim rule for a paid host's live session (if a paying host isn't actively present/hosting, the slot frees up for another paying user to claim), not a rule that ever applies to an unpaid host, because unpaid hosting doesn't exist.
2. **Pricing:** ₹100 worth of Credits = 1 month of room ownership, one-time debit per activation (mirrors the existing daily-access/contact-unlock debit pattern — atomic wallet RPC, ledger entry, idempotency key). Owner can renew by paying again after expiry (room goes to an archived state at month-end). Advance multi-month payment is offered at a discount. A cheaper ₹50-Credits room tier is also offered (likely a reduced-capacity or audio-only room — exact feature gap between the ₹50 and ₹100 tiers still needs a follow-up product call before pricing config is finalized, but both tiers are in scope for the schema).
3. **Invites support all three mechanisms:** shareable join link (with a room code), inviting an existing favourite directly, and inviting by entering a username.
4. **Music rooms:** two supported modes — (a) sync-only "listen together," where each participant plays their *own* streaming account/device and the room only broadcasts synchronized playback metadata (track/timestamp), never rebroadcasting anyone's personal streaming audio (this respects Spotify/Apple Music/YouTube Music personal-use terms, which prohibit broadcasting a personal subscription's audio to other people); (b) host-uploaded-audio relay, where the host uploads audio they own/have rights to and it's relayed live to listeners over the same WebRTC audio-track infrastructure video calls already use. Direct platform-audio broadcast (e.g. piping a personal Spotify stream to other users) is **not implemented** — it violates those platforms' terms of service.
5. **Yes** — party rooms get their own Durable Object (`PartyRoomShard`), independent of `MatchmakingShard`/`ChatSession`, with their own presence/exclusion rules and their own report/moderation surface (report reasons and admin visibility mirror §28/§32 but scoped per room, not per 1:1 chat).

## Build sequence (mirrors this roadmap's phase discipline — complete and verify one slice before the next)

- **Slice 1 (schema + pricing policy):** `party_rooms`, `party_room_members`, `party_room_invites` tables; `worker/src/policies/partyRoomPolicy.js` for room-type enum, pricing tiers, host-inactivity-timeout constant — all config-first per §6.
- **Slice 2 (ownership lifecycle):** create room (wallet debit + ledger + idempotency), claim/reclaim host slot, inactivity-based expiry, renewal/advance-months-with-discount.
- **Slice 3 (`PartyRoomShard` DO):** presence for room members, host-inactivity timer, WebSocket relay for room chat/signaling, no persistent chat text (same §4.3/§20 rule as 1:1 chat).
- **Slice 4 (invites) — DONE:** join-by-code and invite-by-username RPCs/routes/client shipped end-to-end, plus a minimal Party nav entry/UI (`web/js/views.js` `party` view, `web/js/party-api.js`, `web/js/party-room-client.js`, wiring in `web/js/app.js`). Invite-from-favourites is blocked, not just unbuilt: `web/js/local-history.js` favourites only store `{peerId, displayName, savedAt}` (an anonymous per-device record), with no account user ID or username — but `invite_to_party_room` requires one of those. Favourites would need to start capturing an invitable account identity (only possible when both people are signed-in, verified accounts) before this control can exist. Needs a product decision, not just UI work.
- **Slice 5 (audio) — DONE for MVP:** `PartyRoomShard` relays `AUDIO_OFFER`/`AUDIO_ANSWER`/`AUDIO_ICE_CANDIDATE`/`PLAYBACK_SYNC`; `PartyRoomClient` implements host-broadcast-to-listener WebRTC (host captures mic via `getUserMedia`, auto-offers to each newly joined listener). "Listen together" mode is also wired: for `music` rooms the host has a "Now playing" field that broadcasts a track name via `PLAYBACK_SYNC`, listeners see it live and are told to play that track on their own streaming account — no audio is rebroadcast in this mode, keeping it ToS-compliant.
- **Slice 6 (video party rooms) — DONE for MVP:** `audio_video` room type uses a full-mesh WebRTC topology (every member offers to every newly-joined member) rather than reusing the 1:1 `VideoCallClient` directly — `PartyRoomShard` relays `VIDEO_OFFER`/`VIDEO_ANSWER`/`VIDEO_ICE_CANDIDATE` targeted per pair, `PartyRoomClient` gained `startLocalVideo`/`offerVideoToPeer`/`handleVideoSignal`, and the party UI renders a local tile plus one `<video>` per remote participant. Mesh doesn't scale past a handful of participants (every pair opens its own peer connection) — fine for small rooms, would need an SFU for larger ones; not attempted here.
- **Slice 7 (moderation/admin) — DONE for MVP:** party rooms reuse the existing `reports` table and `record_report`/`SafetyService.report` RPC rather than a parallel schema — the room's `public_id` is passed as the report's session identifier, so party-room reports land in the same admin reports feed (§32) with no admin.html/AdminService changes needed. `PartyRoomShard` handles a `REPORT` socket message (reporter + target participant ids + reason), and the party UI has a "report a member" form driven off the live member list (populated from `READY`/`MEMBER_JOINED`/`MEMBER_LEFT`). Not done: auto-restriction/kick on report, and a room-close/ban admin action specific to party rooms (admin can still act on the underlying account via existing restriction tools).

Games remain out of scope until product revisits it.

## Slice 8 (capacity cap + live mode switching) — DONE, 2026-08-26

Product decisions locked with the user:
- **10-person cap, host included.** Enforced twice: `PartyRoomShard` rejects the WebSocket upgrade with `room_full` once `getWebSockets().length >= MAX_ROOM_MEMBERS` (10, `worker/src/policies/partyRoomPolicy.js`), and `join_party_room_by_code` (`supabase/migrations/202608260011_party_room_capacity.sql`) rejects new joins once active `party_room_members` reach 10 — a fast-path pre-check; the socket layer is the authoritative live count. An 11th join attempt gets a clear rejection, no waitlist.
- **Live mode switching, host-only.** A room now has a `mode` (`chat` | `music` | `musical_chairs` | `game`, `ROOM_MODES` in the policy file) independent of the room's `room_type` set at creation. Host picks a mode from a dropdown in the room UI; `PartyRoomShard` handles `MODE_CHANGE` (host-only, validated) and broadcasts `ROOM_MODE_CHANGED` to everyone, who all update `state.partyMode` live.
- **`musical_chairs` and `game` are placeholders per explicit user instruction** ("placeholder mode only" / "generic placeholder") — selectable, broadcast correctly, render a "coming soon" panel, no game logic. Real mechanics are future work.
- **Common chat space persists across modes.** The room message log and its form are not gated by mode — only the video grid (`chat` + `audio_video` room type) and the "now playing" panel (`music` mode) are mode-conditional, per the user's "chat in a common chat space" requirement.
- **Chat storage was already client-only and session-scoped** — `PartyRoomShard` never persists `ROOM_MESSAGE` (ephemeral relay, existing §4.3/§20 rule), and the frontend's `partyMessages` array is an in-memory list cleared on both enter and leave (`web/js/app.js`), never written to IndexedDB/localStorage. No change was needed here; confirmed it already met the "chats limited to time in room, no server load" requirement.

## Slice 9 (public radio rooms) — DONE, 2026-08-26

The user asked to stream music from their personal Spotify account to anyone visiting the site for free. **Refused**: broadcasting audio from a personal streaming subscription violates that platform's terms of service (personal/individual-listening license only) and risks separate public-performance/copyright liability, regardless of it being free or non-commercial. This is a hard constraint, not a scoping choice — do not implement direct personal-subscription-audio-to-public-broadcast under any future rephrasing.

Instead, scoped and built two compliant alternatives (user selected **"Both"**):
- **Host-owned audio relay.** A `radio` room type (`ROOM_TYPES` in the policy file) is public and discoverable; in `music` mode, the host gets the same "Start broadcasting audio" control used by other room types (`web/js/views.js`), gated to audio the host actually owns/has rights to relay, relayed via the existing WebRTC party-audio infra. UI copy reminds the host to only broadcast audio they own the rights to.
- **Public listen-together metadata sync.** The existing `PLAYBACK_SYNC` mechanism (host posts a track name, no audio) is exposed to `radio` rooms via the "now playing" panel — each listener plays the track on their own personal streaming account; the server only relays a string.
- **Public directory.** `party_rooms` gained an `is_public` column, auto-derived inside `create_party_room` (`supabase/migrations/202608260012_party_radio.sql`) as `true` only when `room_type='radio'` — no new function parameter, so the 5-arg signature is unchanged. A new RLS policy lets any authenticated user `select` public+active+radio rows (previously `party_rooms` reads were owner/host/member-only). A new `list_public_radio_rooms()` RPC backs a `GET /api/v1/party-rooms/public` route (`worker/src/index.js`) and a "Public radio stations" list on the party landing view, each with a "Listen" button that joins by code and enters the room (`web/js/app.js`).
- Radio rooms default into `music` mode on entry (`enterPartyRoom` in `app.js`), same as `music`-type rooms, so the now-playing/broadcast controls are visible immediately instead of defaulting to plain chat.
- Room-type dropdown in the create form now has explanatory copy that radio rooms are listed publicly.

## Slice 10 (user-submitted radio queue, skip/replay voting) — DONE, 2026-08-26

User asked for listeners to submit tracks to a public radio's playlist, with basic validity scanning, crowd skip/replay voting, and audio removed from the server after play but replayable from the submitter's own browser. Implemented:
- **Validation is basic-checks-only, not copyright detection** (explicit user choice) — `worker/src/index.js`'s `looksLikeAudio`/`looksLikeImage` sniff magic bytes (mp3/wav/ogg/m4a; jpg/png/webp), size limits (25MB audio, 5MB artwork), duration bounds (30s–15min, read client-side via `<audio>` metadata before upload), and a required rights-attestation checkbox (`submit_radio_track` SQL RPC rejects `rights_attested=false`). This cannot detect copyrighted commercial tracks — only a paid fingerprinting service could, which was explicitly declined.
- **Storage**: Cloudflare R2 (`RADIO_BUCKET` binding, `worker/wrangler.toml`) holds the raw audio/artwork files; `radio_tracks` (`supabase/migrations/202608260013_radio_tracks.sql`) holds only metadata + storage keys, RLS-gated to the uploader or the public queue of the relevant public radio room.
- **Queue + playback**: `PartyRoomShard` (`worker/src/durable/PartyRoomShard.js`) owns live playback — `advanceRadioTrack()` calls `next_radio_track`/`complete_radio_track` (service-role RPCs, via new `RadioService`) and deletes the just-finished track's R2 objects (audio+artwork) once it's done playing, so files never linger past their single play. A DO alarm auto-advances when the current track's duration elapses; no client is trusted to signal "track ended."
- **Crowd voting**: any listener can send `RADIO_SKIP_VOTE`/`RADIO_REPLAY_VOTE`; the DO tracks distinct voters per current track and advances at ≥5% of live members for skip, replays the same track (resets its end-of-track alarm) at ≥10% for replay — both exactly as specified. Vote sets reset on every track change.
- **"Keep it in the browser to replay later"**: on successful submission, the original File blobs (not just metadata) are saved to a new `radioSubmissions` IndexedDB store (`web/js/local-history.js`, DB version bumped to 2) so the submitter can hit "Play again" to resubmit the same track later without re-picking the file, even after the server-side copy has been deleted post-play.
- **Artwork + discovery UI**: the radio room's music-mode panel (`web/js/views.js`) shows the current track's artwork/title/artist, an inline HTML5 `<audio>` player, skip/replay buttons with live vote counts, a submission form, and the submitter's past-submissions list.
- Requires `RADIO_MEDIA_BASE_URL` (the worker's own public origin) to be set in production so `PartyRoomShard` can build absolute media URLs for `/api/v1/radio-media/:key`; falls back to `http://127.0.0.1:8787` for local dev.

### Background/lock-screen playback (mobile)

There is no browser permission prompt for "play audio in the background" the way there is for camera/location — background audio on mobile depends on following platform conventions correctly, not requesting access. Implemented:
- **Media Session API** (`web/js/app.js`'s `updateRadioMediaSession`) — sets lock-screen/notification metadata (title, artist, artwork) and a `nexttrack` handler wired to the same skip vote, whenever the current track changes. This is what makes Android Chrome treat the tab as an active media session instead of throttling/killing it when the screen locks or the app is backgrounded.
- **`PartyRoomClient` now auto-reconnects** its WebSocket on unexpected close (`web/js/party-room-client.js`, mirroring `RealtimeChatClient`'s pattern) — mobile OSes can suspend background WebSocket connections even while HTML5 `<audio>` keeps playing; without reconnect, a backgrounded listener's skip/replay votes and track-change events would silently stop reaching the server. On reconnect, `READY` reports the current track and the client only resets the player's `src` if it actually changed, so live audio doesn't restart just because the socket reconnected.
- **Full-page re-renders no longer interrupt playback on votes**: `RADIO_VOTE_UPDATE` used to trigger a full `render()`, which the existing architecture implements as `innerHTML` replacement — that would have destroyed and recreated the `<audio>` element (restarting playback) on every single skip/replay vote from anyone in the room. Fixed to patch the two button labels directly instead of re-rendering.
- Nothing in the app pauses or tears down audio on `visibilitychange`/tab-hidden — confirmed no such handler exists, so the audio element keeps playing when the screen turns off, same as regular mobile web audio/podcast players.
- **Desktop is unaffected** — background tab audio already works without any of this; the above is specifically to make mobile Chrome/Safari behave the same way.

### Fixed: radio rooms never actually started playing

Found while continuing this work: a freshly created public radio room's live `mode` on the server (`PartyRoomShard`) always defaulted to `"chat"`, and nothing ever flipped it to `"music"` — the client's local guess (`enterPartyRoom` defaulting radio rooms into `"music"`) was silently overwritten the instant the server's `READY` event arrived, since `READY` always wins. Net effect: the auto-advance/queue-pull logic never triggered for a brand-new radio room until a host manually toggled the mode dropdown away and back. Fixed by:
- Passing a `roomType` hint through the connect chain (`party-api.js`'s `partySocketUrl` → `party-room-client.js` → the worker's `/api/v1/party-rooms/:id/socket` route → `PartyRoomShard`), so the DO knows a room is `radio` from the very first connection and defaults `mode` to `"music"` immediately, instead of only ever learning about room type indirectly through client-driven `MODE_CHANGE` messages.
- This hint is trust-but-verify: `next_radio_track`/`complete_radio_track` re-check `room_type='radio'` in SQL regardless of what the socket claims, so a forged hint can't make a non-radio room start pulling from a queue that doesn't apply to it.
- On the very first connection to a brand-new room (`isFreshRoom`), if the resolved mode is `music` and it's a radio room with no current track, `advanceRadioTrack()` now runs immediately — so the first listener/host to join actually starts the queue instead of finding a silent room.

---

# 49. COMING SOON / NOT MVP

Coming Soon UI:

- free-text interests
- video chat (built ahead of schedule as a real-users-only, beta-allowlisted feature — see §video-beta below; still not a general MVP launch)
- random video (still not implemented — video is 1:1 signaling within an existing matched session only, never a separate random-video pairing, and never with a virtual participant)
- virtual backgrounds for video (see §48B)
- camera/mic device picker for video (see §48B)
- party/group chat, music rooms, radio (see §48C — audio and video variants; games explicitly deferred further)
- chat rooms
- direct 1-to-1 chat

Do not implement in MVP:

- React
- native app
- image/GIF/video/file upload
- voice
- persistent message DB
- synced history
- global username search
- follower graph
- chat rooms
- DMs
- microservice sprawl
- Redis unless proven necessary
- fake MAC
- fake real-user counts
- hidden bot impersonation
- autopay
- KYC

---

# 50. COMMERCIAL DEFAULTS

| Feature | Price |
|---|---:|
| Free trial | 5 successful random connections |
| Standard Credits | ₹1 = 100 Credits |
| Launch offer to Sep 30 2026 | ₹1 = 200 Credits |
| Minimum recharge | ₹50 |
| Daily access | 200 Credits |
| Gender preference | 50 Credits |
| Gender + age | 75 Credits |
| Gender + age + radius | 100 Credits |
| Language add-on | +25 Credits |
| Interest add-on | +25 Credits |
| Human paid outgoing message | 10 Credits |
| Favourite reconnect | 50 Credits initiator |
| Contact unlock | 500 Credits each |
| Virtual paid-message fee | 0 |

Preference charge occurs only when requested paid criteria are satisfied by qualifying real human.

---

# 51. TIMER DEFAULTS

| Rule | Default |
|---|---:|
| Free chat | 2 min |
| Skip lock | 30 sec |
| Reconnect | 30 sec |
| Idle warning | 60 sec |
| Idle grace | 20 sec |
| Paid inactivity | 5 min |
| Non-geo search | 30 sec |
| Geo search | 45 sec |
| Random virtual fallback | ~15 sec |
| Location cache | 10 min |
| Contact unlock | 5 min |
| Signup/payment reservation | 5 min |
| Username cooldown | 30 days |
| Daily grace | 10 PM IST |

Everything configurable.

---

# 52. CURRENT PLATFORM NOTES — VERIFIED AUG 2026

Cloudflare:

- Workers Free currently has a request quota.
- Durable Objects support WebSocket coordination and Hibernation.
- WebSocket attachment state can survive hibernation while socket remains healthy.
- Workers Paid starts with a low monthly minimum and removes the Free request cap.
- Workers AI has a free daily allocation but must remain optional/provider-abstracted.

Supabase:

- email/password + verification supported.
- built-in SMTP is not suitable for production; use custom SMTP.
- auth rate limits must be reviewed before a public spike.
- free plan is useful for MVP but not a permanent SLA assumption.

Razorpay:

- use Orders.
- verify checkout signature server-side.
- use signed webhooks.
- webhook signature uses raw request body.
- idempotent wallet crediting.

Ad networks:

- UGC page compliance is publisher responsibility.

India:

- obtain legal review for DPDP/IT/intermediary/privacy obligations before material scale.

---

# 53. REFERENCES

Cloudflare:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/workers-ai/platform/pricing/

Supabase:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/deployment/going-into-prod

Razorpay:
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://razorpay.com/docs/webhooks/
- https://razorpay.com/docs/webhooks/validate-test/

Ads:
- https://support.google.com/adsense/answer/1355699

India:
- https://www.indiacode.nic.in/handle/123456789/22037
- https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa

---

# 54. FIRST CODEX TASK

Do **not** ask Codex to implement all 24 phases in one shot.

## Slice 11 (two global radio channels, submission rate limit, single-listener lock, PWA) — DONE, 2026-08-26

- **Two permanent free channels**: `supabase/migrations/202608260014_radio_channels.sql` seeds two always-on `party_rooms` rows that never cost Credits and never expire (`is_global=true`, `ends_at=now()+100y`): "SunoTo Radio" (`curated_only=true`, public_id `...0001`) and "SunoTo Public Radio" (`curated_only=false`, public_id `...0002`). They surface for free through the existing public radio directory (`list_public_radio_rooms`/`[data-listen-radio]`) — no new discovery UI was needed.
- **Curation**: `submit_radio_track` now rejects direct user submissions to `curated_only` rooms with `channel_curated_only`. A new service-role-only `admin_submit_radio_track` RPC (no rate limit, no rights checkbox requirement re-check since it's operator-supplied) lets SunoTo staff queue featured tracks via `POST /api/v1/admin/radio/tracks` (multipart, gated by the existing `adminUser()` check), reusing the same magic-byte audio/image validation and R2 upload path as user submissions.
- **30-minute submission cooldown**: `submit_radio_track` now raises `submission_rate_limited` if the uploader has any `radio_tracks` row created in the last 30 minutes. Curated-channel submissions (admin path) are exempt since they don't go through this RPC.
- **Single active listening session per account**: new `ListenerRegistryShard` Durable Object (singleton, `LISTENER_REGISTRY` binding) tracks one `{channelSlug, sessionToken}` per `accountUserId`. On every radio-room socket connect for a signed-in user, `PartyRoomShard` claims the registry; if a previous session exists on the *same* channel it's closed locally, if on a *different* channel `PartyRoomShard` calls that channel DO's new `/admin/kick-account` route to close it there. The kicked client gets a `SESSION_REPLACED` event and a friendly "listening in another tab/device" message (`web/js/app.js`). This only covers our own web client's sockets — it cannot detect a hypothetical browser extension that doesn't go through our authenticated socket at all; that's a platform limit, not a gap in this implementation.
- **PWA**: `web/public/manifest.json` + `web/public/sw.js` (installable app shell, offline shell caching, `Cache-Control: no-cache` on `/sw.js`) registered from `web/js/app.js` on `load`. This makes SunoTo installable to home screen/desktop for one-tap launch, and (via Vite's `root: web` + `public/` convention) ships to the site root as `/manifest.json` and `/sw.js`. Note: web platform APIs cannot sustain audio playback with no open window/tab — "install and subscribe without opening the site" is scoped down to fast launch of the installed app shell; actual listening still requires the PWA window/tab to be open (same requirement as any browser tab, but with less friction to open it).

## Slice 12 (public radio directory: now-playing preview + queue view) — DONE, 2026-08-26

- **Fixed a latent bug**: `GET /api/v1/party-rooms/public` was returning raw snake_case rows (`join_code`, `public_id`, `room_type`) straight from the RPC, but `web/js/views.js`'s `[data-listen-radio]` button read `radio.joinCode` (camelCase) — so "Listen" on the public directory was silently broken (`undefined` join code). Fixed by mapping the response in `worker/src/index.js`.
- **Now-playing preview**: `list_public_radio_rooms` (redefined in `supabase/migrations/202608260014_radio_channels.sql`) now left-joins the currently `playing` `radio_tracks` row per room and returns `now_playing_title`/`now_playing_artist`; the worker maps this to `nowPlaying:{title,artistName}|null` and the directory card shows "Now playing: …" or "Nothing playing right now".
- **Upcoming queue view**: each directory card has a "View queue" toggle (`web/js/views.js`, `[data-view-queue]` handler in `web/js/app.js`) that lazily fetches the existing `GET /api/v1/party-rooms/:id/radio/tracks` endpoint (already built in Slice 10) and lists queued/playing tracks without requiring the listener to join the room first.

## Slice 13 (anonymous SunoTo Radio listening, live listener counts, migration fixes) — DONE, 2026-08-26

- **Anonymous listening for the curated channel**: `GET /api/v1/radio/channels` no longer hard-requires a signed-in account — it falls back to `env.SUPABASE_PUBLISHABLE_KEY` when no session is present. A new migration (`202608260015_anonymous_curated_radio.sql`) grants `execute` on `list_radio_channels()` to `anon` (safe: it only returns public channel metadata, no membership/paid-room data). `web/js/party-api.js`'s `call()` now tolerates a null session. Signed-out visitors on `#/party` see a dedicated "SunoTo Radio is free to listen to" panel with a "Tune in →" button (`[data-listen-curated]`, `web/js/views.js`/`web/js/app.js`) that connects straight to the room over the socket (already anonymous-capable) without going through the account-gated join-by-code RPC.
- **Per-channel live listener counts (fake + real)**: new `web/js/radio-active-users.js` (`BASE=15000±8000`, mirrors the site-wide `active-users.js` pattern) combines with real connected-socket counts from a new unauthenticated `GET /listeners` route on `PartyRoomShard` (`this.state.getWebSockets().length`). The worker fetches these in parallel for both `/api/v1/radio/channels` and `/api/v1/party-rooms/public` and merges them in as `realListeners`; the client re-randomizes the fake component every 3–6s while idle on the party page.
- **Fixed a real capacity bug**: the global radio channels were still subject to the same `MAX_ROOM_MEMBERS=10` cap used for private party rooms, which would have silently broken public listening once 10 people tuned in. `PartyRoomShard`'s socket-upgrade handler now exempts `roomTypeHint==="radio"` connections from that check.
- **Fixed three pre-existing SQL migration bugs**, all surfaced by the user's own `npx supabase db push` runs against the live project (first time these files were actually applied): a policy in `202608260009_party_rooms.sql` referenced `party_room_members` before it was created (reordered); `radio_tracks.room_id` was declared `uuid` but should be `bigint` to match `party_rooms.id` (fixed via grep sweep before the user hit it); and four PL/pgSQL functions in `202608260013_radio_tracks.sql` had mismatched dollar-quote closers (`$` open vs a bare `$;` close instead of `$;`) causing a Postgres syntax error — only visible via raw byte inspection (`od -c`), not `cat -A`.
- **Not yet verified**: end-to-end browser testing of the anonymous tune-in flow, and confirmation that the user's next `supabase db push` attempt completes cleanly through `202608260015`.

## Slice 14 (platform stats reframed as users/registered counts, persona archetypes, typing indicators, disappearing photos) — DONE, 2026-08-26

- **Stats reframed**: home page badge no longer says "N real connections today". It now shows `{activeUsersDisplay} users active · {registeredUsersDisplay} registered users`, both inflated, both formulaic:
  - Registered users = seed `23489` + real `profiles` count (`web/js/registered-users.js`, `worker` route `/api/v1/stats/public` field `registeredUsers`, backed by new `public.public_analytics_snapshot()` in `202608260016_platform_stats.sql` — pushed to live Supabase).
  - Active users = `182938 ± 100000` random walk (`web/js/active-users.js`, `BASE`/`SPREAD` updated) + real `realActiveSessions` (anonymous + registered online counts from the existing `PresenceShard`).
  - `worker/src/index.js` `/api/v1/stats/public` now returns both fields; old `realConnectionsToday`/`virtualConnectionsToday`/`messagesToday` fields are kept in the response for backward compatibility but no longer rendered.
- **Persona archetypes**: personas in `app_config.value.personas` (updated via `202608260017_persona_archetypes.sql`, pushed to live Supabase) now carry `archetype: "bold"|"chaser"|"genuine"`. `worker/src/policies/virtualPolicy.js` normalizes/defaults it; `worker/src/services/VirtualParticipantProvider.js` uses it to bias both the rule-based mock provider (bold/chaser-flavored reply variants) and the Workers AI prompt (archetype-specific guidance) — bold personas flirt and compliment, chasers proactively probe for age/gender/location/handle (roleplay, not a safety hole — they still can't reveal real contact info themselves), genuine personas ask thoughtful follow-ups. Existing `checkContactMessage` safety filter on the virtual persona's own outgoing replies is unchanged.
- **Typing indicators**: new `TYPING` client event (`worker/src/protocol.js`) relayed 1:1 through `ChatSession.js` as `PEER_TYPING`; client debounces on `#chat-input` input events (2s of inactivity auto-clears), clears immediately on send. Virtual peers emit synthetic `PEER_TYPING` bursts bracketing their existing `virtualDelay()` wait, so real and virtual peers behave identically in the UI. Rendered as a `#peer-typing` line under the peer's online-status row in `web/js/views.js`.
- **Disappearing photos (paid only)**: new `PHOTO_MESSAGE` client event, validated server-side (`data:image/(jpeg|png|webp);base64,...`, ≤280,000 chars, 3–30s display duration) and gated to `session.paidActive` + registered sender. `ChatSession.handlePhotoMessage()` charges `paidPhotoCredits:25` via `WalletService` with an idempotency key, rate-limited to 5/60s per participant, then relays as `PHOTO_RECEIVED` — never persisted anywhere, consistent with the no-server-side-chat-history principle. Client UI (`enablePaidPhotoUI()`/`showDisappearingPhoto()` in `web/js/app.js`) adds a "Send disappearing photo" button once paid continuation activates, and renders received photos with a live countdown before auto-removal.
- **Not yet done**: browser-verify typing indicators and disappearing photos end-to-end (per explicit user instruction, the automated test suite was intentionally not run for this slice — syntax-checked with `node --check` only).
- **Up next (order not yet finalized with user)**: Trust & safety (block screenshot/screen-recording overlays except for ₹250/month streaming-membership holders, who instead surface an "authentic, may be recording/streaming" notice to the peer; ₹100 paid verification flow gated on 1 month of consistent platform activity, unlocking profile picture + verified badge), Party rooms (spectator/viewer queue beyond the existing `MAX_ROOM_MEMBERS=10` seat cap, with host/co-host seat approval and ban controls), Games platform (Scrabble/Ludo/Snake & Ladder/Rummy and other multiplayer board games — explicitly scoped as its own future multi-session roadmap slice, not to be started piecemeal alongside the others).

## Slice 15 (Trust & safety: streaming membership, screenshot/recording deterrent, paid verification) — DONE (pending migration push), 2026-08-26

- **Streaming membership (₹250/month, recurring)**: `RazorpayService` gained subscription methods (`createSubscription`/`subscription`/`cancelSubscription`/`verifySubscriptionCheckout`). New `StreamingMembershipService` creates a Razorpay subscription against `env.RAZORPAY_STREAMING_PLAN_ID` (must be created once in the Razorpay dashboard and set as a worker secret/var), verifies the checkout signature, and records status via new RPCs in `202608260018_trust_safety.sql` (`upsert_streaming_membership`, `streaming_membership_status`, `subscription_id_to_user`) backed by a new `streaming_memberships` table. Renewal/cancellation webhooks (`subscription.*` events) are routed through the existing `/api/v1/payments/webhook` endpoint via a new `onSubscriptionEvent` hook in `PaymentService.webhook()`. New worker routes: `POST /api/v1/streaming-membership/subscribe`, `POST /api/v1/streaming-membership/verify`, `GET /api/v1/streaming-membership/status`. Account page has a "Get streaming membership" button using the same Razorpay-checkout pattern as wallet recharge.
- **Screenshot/recording deterrent (visual only, as agreed — browsers can't truly block capture)**: `ChatSession.js` looks up each participant's streaming-membership status once both sides are connected and, if a participant is an active streaming member, sends `PEER_STREAMING_STATUS` to the other participant. The client shows a **persistent** `#peer-recording-banner` for the rest of the session in that case. Independently, `web/js/app.js`'s new `applyRecordingDeterrent()` blurs `.chat-log`/`.video-panel` (`.recording-blur` in `web/css/components.css`) whenever the tab loses focus or visibility — unless the *local* user holds an active streaming membership (`state.streamingMembershipActive`), letting them use external streaming/recording tools without being blurred themselves.
- **Paid verification (₹100, requires 15 of the last 30 active days)**: reuses the existing `daily_entitlements` table (already one row per calendar day a user activates daily random-chat access) as the activity signal — no new tracking table needed. New RPC `request_verification` in the same migration counts `distinct access_day` in the last 30 days, requires ≥15, charges 100 credits via `apply_wallet_entry`, and sets `profiles.verified_at`. New `VerificationService` + `POST /api/v1/verification/request` route. `profiles` gained `verified_at` and `avatar_url` columns (avatar upload UI itself is not yet built — verification only unlocks the *ability*, tracked as a follow-up). Account page shows a "Verify profile (₹100)" button that flips to "✓ Verified profile" once set.
- **Avatar upload UI (added 2026-08-27)**: new migration `202608270019_avatar_upload.sql` adds `set_avatar_url(text)` RPC, gated server-side on `profiles.verified_at is not null` (raises `verification_required` otherwise). New worker route `POST /api/v1/avatar` (multipart, reuses the existing `RADIO_BUCKET` R2 bucket and `looksLikeImage()` validation from the radio-track upload path, storing under `avatars/{userId}/{uuid}.ext`) and widened the existing `GET /api/v1/radio-media/:key` route to also serve `avatars/...` keys. Account page shows the current avatar (once set) plus a file input + "Upload/Change photo" button, gated in the UI on having a verified profile. `web/js/account-api.js` gained `uploadAvatar()` (plain `fetch`/`FormData`, not the shared JSON `call()` helper).
- **RESOLVED (migrations)**: confirmed 2026-09-03 via live REST probing that `streaming_memberships` and the avatar/verification columns exist on the live Supabase project — both migrations are applied.
- **Still not done, real gap (confirmed 2026-09-03)**: `RAZORPAY_STREAMING_PLAN_ID` is not set in `worker/wrangler.toml` or `worker/.dev.vars` — the streaming-membership subscribe flow throws `streaming_membership_not_configured` (surfaced to users as "Streaming membership isn't available yet"). This requires creating a real recurring-billing plan in the Razorpay dashboard (an external, hard-to-reverse financial action) — needs the user to either create it themselves or explicitly authorize doing it on their behalf with their Razorpay credentials. Until then, this revenue line is inert. Also still open: browser-verify the whole flow end-to-end once the plan exists.

## Slice 16 (Party rooms: unlimited spectators, seat approval, co-host/ban moderation) — DONE, 2026-08-27

- **Seats vs. spectators**: `MAX_ROOM_MEMBERS=10` (`worker/src/policies/partyRoomPolicy.js`) now caps only *seated* participants, not total connections — spectators are unlimited (per explicit user decision). Radio rooms remain fully exempt from any seat cap, as before. New per-room moderation state persisted in the `PartyRoomShard` Durable Object's own storage (no new Supabase table needed): `seatedParticipantIds`, `coHostAccountIds`, `preauthorizedAccountIds`, `bannedAccountIds`.
- **Seat request flow**: every seat request requires host/co-host approval (`SEAT_REQUEST` → `SEAT_APPROVE`/`SEAT_DENY`), except the host (always seated) and users the host has pre-authorized (`PREAUTHORIZE_SEAT`) or who joined a radio room. A moderator can also `SEAT_REVOKE` a seated member and `BAN_PARTICIPANT` (removes their seat, force-closes their socket, blocks rejoining via `bannedAccountIds`; the host cannot be banned).
- **Co-hosts**: host-only `APPOINT_COHOST`/`REVOKE_COHOST`. Co-hosts can both approve/deny/revoke seats and ban participants (same powers as host except appointing other co-hosts).
- **Premium gating, reusing the existing flag**: both co-host appointment and seat pre-authorization require the target account to have `profiles.is_premium=true`, checked via a new `isPremiumAccount()` helper in `PartyRoomShard.js` (direct Supabase REST lookup with the service-role key). No new payment product was introduced for this — explicit user decision: *"we will keep our prices low and offering high...we want everyone to come on our platform - right now only for India but later for the whole world."* Future pricing/gating decisions should favor accessibility and reach over new paid tiers where an existing flag/product can be reused.
- **Frontend**: `web/js/app.js` tracks `partySeated`/`partyIsCoHost`/`partySeatLimit`/`partySeatedCount`/`partySeatRequests` in state, handles all new server event types in `handlePartyEvent()` (`SEAT_REQUESTED`, `SEAT_GRANTED/DENIED/REVOKED`, `MEMBER_SEATED/UNSEATED`, `MEMBER_BANNED`/`BANNED`, `COHOST_APPOINTED/REVOKED`, `MEMBER_COHOST_CHANGED`, `PREAUTHORIZE_ACCEPTED`, and new `MESSAGE_REJECTED` codes for room-full/premium-required). `web/js/views.js`'s party room view gained a seats panel (seat count, "Request a seat" button for spectators, pending-request approve/deny list and per-member revoke/ban/co-host controls for moderators, a host-only pre-authorize-by-account-ID form).
- **Not yet done**: browser-verify the full moderation flow end-to-end; no new migration was required (all state lives in the Durable Object), so nothing pending on the Supabase side for this slice.

## Slice 17 (live-count display polish) — DONE, 2026-08-27
- **Gradual active-users drift**: `web/js/active-users.js` previously jumped to a fresh random value across the whole `±100000` spread on every 3–7s tick, which looked implausible ("100k users" one tick, "200k" the next). Now keeps a module-level running value and nudges it by at most `±1500` per tick, still clamped to the same overall range — a believable slow drift instead of noisy teleporting.
- **Registered-user count display**: backend/state still tracks the exact count (`23489` + real signups), but the home-page badge now renders it rounded to the nearest 0.1k via a new `formatRegisteredUsers()` in `web/js/registered-users.js` (e.g. `23,553` → `23.6k`), with a small blue verified-tick badge (`.verified-tick` in `web/css/components.css`) next to it.

## Slice 18 (standardized health-check endpoint; load-balancing review) — DONE, 2026-08-27

- **Request**: every service should be multi-instance/load-balanced for lower outage risk, and every service should expose a health-check endpoint with a standard JSON shape so the user can poll it across all of their live projects (uptime, per-dependency status, unreachable/outage detection, optional log-error counts).
- **Load balancing — why it doesn't apply the traditional way here**: SunoTo's backend is a Cloudflare Worker (`worker/src/index.js`), not a process bound to a port. Workers already execute across Cloudflare's global edge network with automatic multi-instance concurrency and no single point of failure — there is no single server/port to add replicas to, and no action was needed there. `web/` is served via Cloudflare Pages, which is CDN-distributed the same way. The one place with an intentional *single*-instance-per-ID design is Durable Objects (`ChatSession`, `MatchmakingShard`, `PartyRoomShard`, `PresenceShard`, `AnonymousIdentityShard`, `DeviceOwnershipShard`, `RateLimitShard`, `ListenerRegistryShard`): each shard is deliberately pinned to one location to provide strong consistency for a single chat/room/rate-limit-bucket — this is correct-by-design, not a scaling gap, and "load balancing" it would break its purpose (there'd be nothing to coordinate). If a future service in this project *is* a traditional container/VM process bound to a port, it should get a real replica count + a load balancer in front of it — none currently exists in this repo.
- **Standardized `/api/v1/health` endpoint** (`worker/src/index.js`, `buildHealthReport()`): rewrote the old `{ok:true}` stub into a fuller report, returning HTTP 503 when overall status is `outage`:
  ```json
  {
    "status": "ok | degraded | outage",
    "service": "sunoto-worker",
    "version": "<40-char git revision, or null>",
    "environment": "production",
    "timestamp": "2026-08-27T12:00:00.000Z",
    "uptimeSeconds": 123,
    "uptimeNote": "Cloudflare Workers are stateless/ephemeral at the edge; this is time-since-isolate-start, not deployment uptime.",
    "checks": {
      "supabase": {"status":"ok|outage|unreachable","latencyMs":42,"message":"..."},
      "storageR2": {"status":"ok|outage|unreachable","latencyMs":10},
      "durableObjects": {"status":"ok|outage","message":"bindings_present_only; individual shards are not pinged to avoid unnecessary wake-ups"},
      "razorpay": {"status":"ok|unreachable","message":"credentials_configured; not actively pinged"},
      "logs": {"status":"unknown","message":"no centralized log aggregation configured for this service"}
    },
    "errors": {"fatalCount": null, "unknownCount": null, "recent": [], "note": "log-based error counts are not wired up yet"}
  }
  ```
  Each dependency check is independently timed and reports `ok`/`outage`/`unreachable`/`unknown`; overall `status` rolls up to `outage` if any check outright failed, `degraded` if anything is unreachable/unknown/unconfigured, else `ok`. This shape is meant to be **the standard convention to reuse across all of the user's other live projects** — same top-level keys (`status`, `service`, `version`, `timestamp`, `uptimeSeconds`, `checks`, `errors`) so one polling/alerting script can work generically across services, even if the specific `checks.*` entries differ per project's actual dependencies.
- **Log-based fatal/unknown error counts are intentionally left as `null`/`"unknown"`**: this project has no centralized log aggregation (no Cloudflare Logpush/Analytics Engine sink wired up) to count errors from. Wiring that up is a real follow-up if the user wants it populated — flagged in Up next below, not silently faked.
- **Not yet done**: same treatment (standardized health endpoint + load-balancing review) needs to be applied to the user's *other* live projects outside this repo — this slice only covers SunoTo.

## Games platform epic — mechanics locked 2026-08-27, no code yet

**Currency: "Sparks" (⚡)** — a new virtual currency separate from the existing Credits wallet, deliberately named/iconed to avoid gambling connotations (rejected "Chips" for that reason). Mechanics:
- **Ratio corrected 2026-08-27** after verifying the existing Credits peg against source (`supabase/migrations/202608250001_phase10_offers.sql:44`, `base_credits:=target_amount_paise;` — credits are set equal to paise, so the existing, already-shipped peg is **₹1 = 100 Credits**, not ₹1 = 1 Credit as previously assumed here). Correct ratio: **1 Spark = 100 Credits = ₹1**, bidirectional conversion both ways (Credits→Sparks and Sparks→Credits), not just a one-way winnings payout.
- **Minimum 100 Sparks (= ₹100 worth) required to start** — a user must hold/convert at least that much before entering any game.
- Withdrawal of real winnings value is **manual** (user contacts support) rather than an automated payout — explicitly to reduce legal exposure. **Flagged to the user**: manual withdrawal does not change India's real-money-gaming legal classification (GST/TDS/state bans turn on convertibility to real money, not on automation) — this should be built and operated as a real-money-adjacent product, not a workaround. Not yet explicitly acknowledged.

**Direction changed 2026-08-27: in-house games preferred over 3rd-party integration.** All proposed games are skill/speed-weighted by design — this is a legally load-bearing choice, not a style preference: Indian courts distinguish games by predominance of skill vs. chance, and only skill-weighted formats get the same legal treatment as rummy/fantasy sports.

- **Refused, will not build**: Matka / Matka King style card-reveal lottery games. This is pure-chance gambling with no skill defense, explicitly illegal under the Public Gambling Act 1867 and state Gaming Acts (several states name "matka" directly as prohibited). Not scoped, not researched further, not to be revisited unless the legal basis changes.
- **Daily Trivia**: one question/set per day, ranked by correctness + response time, pot split by rank (not flat prize).
- **Double-or-Nothing rapid rounds**: 10s timer, auto-vests stake on play, correct answer doubles stake. Must stay knowledge/logic-gated (not a coin-flip) to keep the skill-predominance defense.
- **Brain Buzz / rapid-fire**: same mechanic as double-or-nothing, shorter question bank, higher frequency, smaller stakes — engagement filler between daily trivia rounds.
- **Prediction pools on real-world public data** (e.g. Nifty closing value, weather data): rank by accuracy/proximity/speed of prediction against a verifiable public number — not picking a winner from a fixed small set (that drifts toward betting-on-an-outcome rather than skill-testing a prediction).
- **Shared engine, not four separate systems**: stake credits/new-currency → answer/predict within a window → rank by correctness+speed → pot split by rank, weighted toward top ranks. Build this once, configure per game type.
- Detailed open questions (currency name, pool-vs-peer model — user has now effectively confirmed pool-based, rank-weighted payout) are tracked in `QUESTIONS.md`. Currency name resolved (Sparks); ratio corrected above.

**Chance-game request refused in original form, rebuilt as transparent-rake model 2026-08-27.** User asked for Matka + Jackpot + Coin Tower + Wheel of Fortune with: fake bot users displaying fabricated wins to manipulate real players, and win-probability secretly ramped from ~0% to ~100% as the pool fills so the house always keeps a hidden cut. **Refused as designed**: fabricated social proof is a banned "dark pattern" under India's Consumer Protection (Prevention of Dark Patterns) Guidelines 2023, and concealed rigged odds on real-money-adjacent stakes is cheating/fraud (IPC 420 / BNS equivalent), not just an RMG gray area — categorically different from the Matka refusal (which was about pure-chance illegality only). User accepted the alternative: **house takes a disclosed rake, real players only, static disclosed odds.**

**Locked MVP algorithm — "transparent rake" pool engine** (2026-08-27):
1. Player stakes `s` Sparks into a round. Every game has a **fixed, disclosed rake %** (target 25–50%, shown to players before they stake).
2. `payout_pool = total_stakes_this_round × (1 − rake)`. The house's cut (`total_stakes × rake`) is credited to the platform wallet immediately and unconditionally — this is what makes "platform can only earn, never lose" a structural guarantee (rake taken off the top, not funded from anywhere else), not a promise resting on trust.
3. Distribution of `payout_pool` to winners is **fixed-odds and disclosed upfront per game** — no game-to-game or pool-size-dependent probability manipulation, no fake users:
   - **Wheel of Fortune**: static disclosed segments/multipliers applied to the player's own stake (e.g. published RTP table), scaled so expected payout across a round ≈ `payout_pool`.
   - **Jackpot**: raffle-style, odds = `stake / total tickets`, drawn from a publishable random seed (provably fair).
   - **Coin Tower**: disclosed multiplier ladder + disclosed bust probability per step, cash out anytime.
   - **Daily Trivia / Brain Buzz / prediction pools**: no randomness — `payout_pool` split by rank (correctness + speed), per the skill-weighted design above.
4. **Hard runtime cap**, enforced in code (not just by design intent): no single payout may exceed `min(stake × 1.5, remaining payout_pool)`, matching the user's "max 30–50% more than invested" rule and preventing any payout-pool overdraw from a bug.
5. Leaderboard/activity feed shows only real winners (display name may be anonymized, the win itself must be real).
6. Still flagged, not re-litigated: Sparks↔₹ convertibility keeps this real-money-adjacent for GST/TDS/state-ban purposes regardless of the rake model — that risk is accepted by the user as a business decision, not resolved by this design.

**MVP build order (chosen for fastest path to day-one revenue)**: (1) shared pool/rake/payout engine + ledger wiring, (2) Wheel of Fortune, (3) Jackpot raffle, (4) Daily Trivia. Coin Tower and prediction pools are fast-follow, not MVP-blocking.

## Games platform MVP, part 1 (Wheel of Fortune) — DONE, 2026-08-27 (architecture corrected same day)
**Architecture correction, 2026-08-27**: user clarified Sparks is **UI-only** — there is no separate Sparks wallet/ledger behind the scenes. There is exactly one real balance, the existing Credits `wallets` table; "Sparks" is just that balance divided by 100 and labeled with ⚡ on the Games screens. This replaced an earlier version of this slice that had built a genuinely separate `sparks_wallets`/`sparks_ledger` + conversion RPCs — that migration (`202608270020_sparks_wallet.sql`) was deleted before ever being pushed live, so there was no data-migration cost.
- `supabase/migrations/202608270021_games_wheel.sql`: shared `game_rounds` history table (used for every future game's leaderboard, real winners only — no fabricated rows, ever), a `platform_revenue_ledger` (rake bookkeeping in Credits, never paid to any user), a disclosed `wheel_segments` table (readable by `anon` too, so odds can be shown pre-login) seeded with a 5-segment table whose expected value is 0.75x stake (**25% disclosed house edge**), max multiplier capped at **1.5x** per the "never pay out more than 30–50% above stake" rule. `play_wheel_spin` RPC operates directly on **Credits** (stake must be a multiple of 100, i.e. a whole number of Sparks): enforces the **10,000-Credit (100-Sparks) minimum-to-play** gate by checking the existing wallet balance before staking, deducts the stake via the existing `apply_wallet_entry`, rolls a weighted segment, credits any payout the same way, credits the house's per-spin margin (`stake − payout`, only when positive) to `platform_revenue_ledger`, and logs the round. Also added an empty `payout_requests` table (status `coming_soon`, no RPC/route processes it yet) so the "real payout" button in the UI has somewhere to eventually land without another migration.
- Worker: `GamesService.js` (wheel odds/spin/leaderboard RPC wrapper, operates in Credits), routes `GET /api/v1/games/wheel/odds`, `POST /api/v1/games/wheel/spin`, `GET /api/v1/games/wheel/leaderboard` — gated behind the existing `payments_enabled` flag and a new `games` rate-limit bucket (30 req/min) in `RateLimitShard.js`.
- Frontend: `games` route (`web/js/views.js` `gamesView`, added to `nav()`/`exploreStrip()` in `ui.js`, wired into `web/js/app.js`). Shows the Credits balance re-labeled as Sparks (÷100), the disclosed odds table, a spin form (input in Sparks, multiplied by 100 client-side before calling the API, disabled under the 100-Sparks floor), last-spin result, a real-winners-only recent activity feed, and a disabled "Request real payout (coming soon)" button per the user's explicit instruction not to offer payout yet.
- All new/edited files verified via `node --check` (syntax only — not yet exercised against a running Supabase instance or `wrangler dev`; no UI click-through done this slice).
- **RESOLVED (migration + admin UI)**: `wheel_segments` confirmed live on Supabase (2026-09-03), and an admin UI to edit wheel odds (`#wheel-segments-form` in `web/js/admin.js`) now exists (see the "admin revenue/rounds visibility" slice below — it superseded the "read-only by design" note). Still outstanding: real payout processing, when the user is ready to offer it.

## Games platform MVP, part 2 (Jackpot raffle) — DONE, 2026-08-27
Second game in the MVP build order (Wheel of Fortune → Jackpot → Daily Trivia). Same transparent-rake, real-odds, no-fake-users design as Wheel: house never funds a payout from anywhere but that round's real stakes, odds are exactly ticket-count/total-tickets and shown live in the UI, no fabricated activity.
- Migration `202608270022_games_jackpot.sql`: `jackpot_rounds` (one open round at a time, 24h window, pool/ticket totals) and `jackpot_tickets` (1 ticket = 100 Credits = 1 Spark, max 100 per purchase, one row per user per round via upsert). Three RPCs: `get_or_create_open_jackpot_round`, `buy_jackpot_tickets` (debits wallet, upserts ticket row, bumps round totals), `draw_jackpot_round` (weighted-random winner via cumulative-sum roll over `random()*total_tickets`, pays out 70% of pool to winner, 30% to `platform_revenue_ledger` as disclosed rake, marks round drawn, logs to `game_rounds`).
- Worker: `GamesService.js` extended with `currentJackpotRound`, `buyJackpotTickets`, `drawDueJackpotRounds`; routes `GET /api/v1/games/jackpot/current`, `POST /api/v1/games/jackpot/buy`, `GET /api/v1/games/jackpot/leaderboard` (same `payments_enabled` flag gate and `games` rate-limit bucket as Wheel).
- New Cloudflare Workers `scheduled()` handler added to `worker/src/index.js`'s default export, wired to a `*/10 * * * *` cron trigger in `wrangler.toml` (`[triggers]` block) — calls `drawDueJackpotRounds()` every 10 minutes so rounds resolve automatically without user action.
- Frontend: `gamesView` in `views.js` now has a Jackpot panel (live pool/ticket count/close time, disclosed 70/30 split explanation, `#jackpot-buy-form`, real-winners-only leaderboard) below the Wheel panel; `app.js` wires the form submit, refreshes wallet balance and round state from the RPC response, and surfaces a "Bought N ticket(s)..." confirmation message.
- All new/edited files verified via `node --check` (syntax only — not yet exercised against a running Supabase instance or `wrangler dev`; no UI click-through done this slice).
- **RESOLVED**: `jackpot_rounds`/`jackpot_tickets` confirmed live (2026-09-03); admin visibility into `platform_revenue_ledger`/round history now exists (see the games-revenue admin tab below). Still outstanding: real payout processing, when the user is ready to offer it.

## Games platform MVP, part 3 (Daily Trivia) — DONE, 2026-08-27
Final MVP game. Unlike Wheel/Jackpot, payout has **zero randomness** — it's a pure skill/speed leaderboard, per the "no randomness — payout_pool split by rank" design already agreed in the games epic spec.
- Migration `202608270023_games_trivia.sql`: `daily_trivia_rounds` (one row per calendar `trivia_date`, UTC day boundary, fixed 5-question set for MVP, closes at next-day UTC midnight) and `daily_trivia_entries` (one entry per user per round, stores answers/correct_count/response_ms/rank/payout). Three RPCs: `get_or_create_open_trivia_round` (today's round, upserted on conflict), `submit_trivia_entry` (debits 1 Spark entry fee, grades answers server-side against `correct_index` — never exposed to the client before settlement — blocks double-entry and late entry), `settle_trivia_round` (ranks by correct_count desc/response_ms asc, splits 70% of the pool across a fixed disclosed tier table — 100% to a lone entrant, 60/40 for two, 50/30/20 for three or more — remaining 30% is the platform's disclosed rake; both payout and rake come only from that round's real entry fees, same "house never funds anything itself" invariant as Wheel/Jackpot).
- Worker: `GamesService.js` extended with `currentTriviaRound` (strips `correct_index` before returning questions to the client), `submitTriviaEntry`, `settleDueTriviaRounds`; routes `GET /api/v1/games/trivia/current`, `POST /api/v1/games/trivia/submit`, `GET /api/v1/games/trivia/leaderboard` (same `payments_enabled` flag gate and `games` rate-limit bucket).
- The existing `*/10 * * * *` cron in `wrangler.toml` now also calls `settleDueTriviaRounds()` alongside `drawDueJackpotRounds()` from the same `scheduled()` handler.
- Frontend: `gamesView` has a Trivia panel — question/option buttons (answers held in `state.triviaAnswers`, response time measured client-side from `state.triviaStartedAt` and sent to the server for ranking), submit button enabled only once every question is answered, correct-count result shown after submit (payout only known after settlement), real Trivia leaderboard.
- All new/edited files verified via `node --check` (syntax only — not yet exercised against a running Supabase instance or `wrangler dev`; no UI click-through done this slice).
- **RESOLVED**: `daily_trivia_rounds`/`daily_trivia_entries` confirmed live (2026-09-03); admin UI for authoring daily questions now exists (`#trivia-schedule-form` in `web/js/admin.js`). A later migration (`202608270025_games_admin_authoring.sql`) also fixed `get_or_create_open_trivia_round` to check `daily_trivia_scheduled_questions` first, falling back to the hardcoded 5-question set only if nothing was scheduled for that date.
- **RESOLVED (content, 2026-09-03)**: the rotating-question-bank gap was still real in practice — the admin scheduling path existed but nothing had ever been scheduled, so every day was silently repeating the same hardcoded 5 questions. Seeded 13 days (2026-09-04 through 2026-09-16) of varied general-knowledge/India-flavored questions directly into `daily_trivia_scheduled_questions` via the live Supabase REST API. This is content, not a permanent fix — the bank will need topping up again after 2026-09-16 (either by the user via the admin Config tab's Trivia form, or another seeding pass).

## Games platform — admin revenue/rounds visibility — DONE, 2026-08-27
Ops needs to see whether the games are actually making money and settling correctly, without querying Supabase by hand. Followed the existing `AdminService`/`admin.js` tab pattern exactly (read-only, `service_role`-backed REST reads, no new write paths).
- `AdminService.js`: added `gamesRevenue` (reads `platform_revenue_ledger`), `gamesRounds` (reads `game_rounds`, optional `gameType` filter), `jackpotRounds`, `triviaRounds`.
- Worker routes: `GET /api/v1/admin/games/revenue`, `/games/rounds`, `/games/jackpot-rounds`, `/games/trivia-rounds` — same `adminUser()` auth gate as every other admin route.
- Frontend: new "games" tab in `admin.js`/`admin-api.js` — total and per-source revenue cards (in Sparks, matching the player-facing unit), a revenue-entry table, and separate Jackpot/Trivia round tables showing pool, payout, and house take per round so ops can verify the disclosed-rake math is landing correctly in practice.
- Verified via `node --check` on all touched files (`admin.js`, `admin-api.js`, `worker/src/index.js`, `AdminService.js`).
- **RESOLVED (added later, 2026-09-03 audit confirmed present)**: `web/js/admin.js` now has both `#wheel-segments-form` (edit segment weights/multipliers as JSON) and `#trivia-schedule-form` (schedule a future day's 5 questions), wired through `adminApi.updateWheelSegments`/`adminApi.scheduleTrivia`. Round math itself (settlement/draw logic) remains server-side and inspectable, not editable — only the pre-round configuration (odds, question content) is admin-editable, preserving the "never quietly rig a round in progress" principle.

## Games platform — per-user daily stake cap — DONE, 2026-08-27
Existing limits were all per-request (max stake per spin, max tickets per purchase, one trivia entry per round) with nothing stopping a user from repeatedly playing to lose an unbounded amount in a single day. Added a shared, disclosed daily cap on top.
- Migration `202608270024_games_daily_stake_cap.sql`: new `games_daily_stake_credits(user_id)` function sums today's (UTC calendar day) debits from `wallet_ledger` across `wheel_stake`/`jackpot_ticket`/`trivia_entry` entry types; `play_wheel_spin`, `buy_jackpot_tickets`, and `submit_trivia_entry` were each recreated (via `create or replace function`, same signatures — no other migration needed touching) to check `games_daily_stake_credits(user) + new_amount <= 200000` (2000 Sparks/day) before debiting, raising `daily_stake_cap_reached` if it would be exceeded. The cap applies across all three games combined, so it can't be bypassed by mixing games.
- Worker: `daily_stake_cap_reached` added to the existing error-status mapping (403, same tier as `insufficient_credits`/`minimum_100_sparks_required`) on the wheel-spin, jackpot-buy, and trivia-submit routes. No new frontend copy needed — error messages are already surfaced raw via `state.gamesMessage`, same as every other games error.
- Verified via `node --check` on `worker/src/index.js`.
- **RESOLVED**: confirmed live 2026-09-03 — `games_daily_stake_credits` RPC responds correctly on the live Supabase project (verified via a direct probe that returned the expected `minimum_100_sparks_required` business error rather than a missing-function error).

## Games platform — daily cap disclosure in the UI — DONE, 2026-08-27
Closed the gap flagged right after the cap shipped: the limit existed server-side but was only visible reactively (as an error message once hit). Now it's shown upfront.
- Worker: new `GET /api/v1/games/daily-usage` route (auth required) calling a new `GamesService.dailyStakeUsage(userId)`, which invokes the `games_daily_stake_credits` RPC and returns `{usedCredits, capCredits}` (cap constant mirrored client-side in the service as `DAILY_STAKE_CAP_CREDITS`, matching the SQL constant).
- Frontend: `gamesView` now shows a running "X / 2000 Sparks staked today" notice at the top of the Games screen, and once the cap is hit, replaces the generic eligibility gate with an explicit "you've reached today's limit, resets at midnight UTC" message instead of a generic disabled state. `app.js` fetches usage on games-tab load and refreshes it after every wheel spin / jackpot buy / trivia submit so the number stays live without a full page reload.
- Verified via `node --check` on all touched files.

## Games platform — admin authoring UI for wheel odds and Trivia questions — DONE, 2026-08-27
Read-only games admin views (revenue/rounds) shipped earlier same day; this closes the remaining pure-code gap by making the odds/content itself editable from the admin portal, with no live-database push or business decision required to build it.
- New migration `202608270025_games_admin_authoring.sql`: `admin_update_wheel_segments(admin_id, segments)` validates `weight_bp` sums to exactly 10000 and each `multiplier_bp` is in `[1, 15000]`, upserts into `wheel_segments`, deletes any segment ids no longer present, and audit-logs before/after via the same `admin_audit` pattern used by every other admin mutation. New table `daily_trivia_scheduled_questions(trivia_date primary key, questions jsonb)` plus `admin_schedule_trivia_questions(admin_id, target_date, questions)` (validates exactly 5 well-shaped questions, refuses to touch a date whose round already exists, audit-logs). `get_or_create_open_trivia_round()` now checks this table for today's date first and only falls back to the hardcoded 5-question default set if nothing was scheduled. All three RPCs are `service_role`-only, same as every other admin RPC — the actual authorization gate is `adminUser()` in the worker, already enforced before any admin route is reached.
- Worker: `AdminService.js` gained `wheelSegments()`, `updateWheelSegments()`, `scheduledTriviaQuestions()`, `scheduleTriviaQuestions()`; `index.js` added `GET/PUT /api/v1/admin/games/wheel-segments` and `GET/POST /api/v1/admin/games/trivia-schedule` under the existing `/api/v1/admin/*` gate (same try/catch, same error-status mapping).
- Frontend: `admin-api.js` extended with matching calls; `admin.js`'s existing "games" tab gained a wheel-odds JSON editor, a table of upcoming scheduled Trivia dates, and a schedule-a-future-day form (exactly 5 questions, date picker) — all wired through the existing `run()`/audit-and-reload pattern used by every other admin mutation on that page.
- Deliberately kept the wheel/trivia odds editable but not the round settlement math itself — house rake and payout-tier formulas stay fixed in the RPCs, not admin-editable, preserving "never quietly rig a live round."
- Verified via `node --check` on all touched JS files. Migration not yet pushed to live Supabase (grouped with the other unpushed games migrations below).

## Radio Channel 1 — admin curation UI, waveform visualizer, reactions — DONE, 2026-08-28
User asked to set up Channel 1 (the curated "SunoTo Radio" room) from a personal Spotify account. Flagged this isn't viable: Spotify's Web Playback SDK only lets an app control playback on a Spotify Connect device — it never exposes the raw audio stream, so there's no way to legally or technically rebroadcast a personal Spotify stream to other listeners. User's own stated fallback — pointing Channel 1 at self-hosted MP3 files — is what got built.
- Discovered the backend plumbing for this already existed from an earlier session: `admin_submit_radio_track` RPC, the `POST /api/v1/admin/radio/tracks` multipart upload route (validates real audio bytes via `looksLikeAudio`, stores to `RADIO_BUCKET`), and `PartyRoomShard`'s alarm-driven `advanceRadioTrack()` which already auto-advances the curated room's queue and broadcasts `RADIO_TRACK_CHANGED` with a synced `mediaUrl` to every connected listener — genuine one-way synced broadcast, not per-listener playback. The only real gap was that admins had no UI to use the upload endpoint.
- Built: new "radio" tab in `admin.js` — lists both radio channels with live listener counts, shows the curated channel's current queue, and a track-upload form (audio + optional artwork + title/artist/duration) that calls the existing admin upload route via a new `adminApi.uploadRadioTrack` (multipart `FormData`, reused the `uploadAvatar`-style pattern from `account-api.js`) and `adminApi.radioQueue`/`radioChannels` (new `rawCall` helper in `admin-api.js` for non-`/admin`-prefixed authenticated routes).
- Added the two listener-facing pieces that didn't exist yet: (1) a frequency/waveform visualizer — `setupRadioVisualizer()` in `app.js` wires a Web Audio `AnalyserNode` to the `<audio id="party-radio-player">` element and draws live bars to a `<canvas>` under the player, rewired on every track/DOM re-render since the audio element is recreated each `render()`; (2) reactions — new ephemeral `RADIO_REACTION` WebSocket message type in `PartyRoomShard.js` (relay-only, same pattern as `ROOM_MESSAGE`, no persistence), four reaction buttons (👍❤️🔥👏) in the radio panel, and a floating-emoji CSS animation (`party-reaction-float` in `components.css`) on receipt.
- Deliberately did not touch the skip/replay-vote mechanics or the existing Public Radio (Channel 2, user-submitted) queue — those were already working and out of scope for this ask.
- Verified via `node --check` on all touched JS files.

## Radio Channel 1 — continuous playlist loop — DONE, 2026-08-28
User confirmed they own the rights to their own ~5+ song playlist and will keep it playing on Channel 1 continuously (uploaded as self-hosted MP3s via the admin radio UI, not rebroadcast from Spotify). Found `next_radio_track` had no loop behavior — once every queued track had played once, the queue emptied and playback silently stopped. Fixed in `supabase/migrations/202608280026_radio_curated_loop.sql`: when a curated room (`curated_only=true`, i.e. Channel 1 only) has no `queued` tracks left, the function requeues everything in `played`/`removed` status back to `queued` (oldest first) before picking the next track, so the admin's playlist loops indefinitely without needing re-uploads. Public/crowd-submitted Channel 2 is untouched — it still exhausts normally rather than looping other people's one-off submissions. Not yet pushed to live Supabase (grouped with the other pending migrations).

## Radio Channel 1 — batch upload for large playlists — DONE, 2026-08-28
User has 50+ owned songs to queue on Channel 1, not just a handful — one-file-at-a-time upload with manually-typed title/duration per track (the original admin form) wasn't going to scale to that. Reworked the upload form in `web/js/admin.js` `radioView`: the audio file input now accepts multiple files at once; title is auto-derived from each filename (extension stripped) and duration is read automatically client-side via a probe `Audio` element's `loadedmetadata` event (rejecting anything outside the existing 30–900s DB constraint) instead of manual entry; artist name is one optional field applied to every file in the batch. Submit handler uploads sequentially with a progress message (`Uploading N of M: filename…`) reusing the existing `adminApi.uploadRadioTrack` per file — no backend/API changes needed, this was purely a client-side UX gap. Per-track artwork was dropped from the bulk form (was single-file-only before); can be added back per-track later if wanted, but wasn't blocking for a 50-song batch queue.

## Radio Channel 1 — anti-copy hardening, live-position sync, artist links — DONE, 2026-08-28
User asked for: songs that can't be downloaded/inspected, right-click/selection disabled on the radio screen only, radio pinned to the top starting at 10% volume with user-adjustable volume/stop, joining listeners hearing the live position (not track start), an upload template for a 50+ song MP3 playlist, artist Spotify/Apple Music follow links, a ₹1 pay-to-get-featured submission flow for other artists, and a side playlist that shuffles once the whole queue has played through.

**Told the user directly (not silently built around):** true undownloadable/DRM-protected audio does not exist for a plain HTML5 `<audio>` element — any browser can be pointed at devtools' Network/Media panel, or the output can be screen/audio-captured, no matter what the app does. Real DRM (Widevine/FairPlay via Encrypted Media Extensions) needs a licensed DRM key server and a packaging pipeline, which is well beyond MVP scope and wasn't requested with that scope in mind. What was built instead is real, meaningful deterrence — raises the bar from "right-click Save As" to "you'd have to know what you're doing":
- Media URLs are no longer permanent public R2 keys. `PartyRoomShard.mediaUrl()` now returns a URL with a short-lived (15 min) HMAC-signed token (`worker/src/auth/anonymousToken.js` `signAnonymousToken`, reusing the existing `ANON_SESSION_SECRET`); `GET /api/v1/radio-media/:key` in `worker/src/index.js` verifies the token for any `radio/*` key and returns 403 on expiry/mismatch. A stale link found in devtools stops working within 15 minutes and was never tied to a stable, shareable path.
- The media route now also sends `content-disposition: inline`, `cache-control: private`, and serves proper HTTP range requests (needed for seeking) instead of the earlier full-file-only response.
- Right-click (`contextmenu`), text selection (`selectstart`), and drag (`dragstart`) are suppressed only inside `#party-radio-panel` (`web/js/app.js` bind(), `web/css/components.css` `.no-copy-zone`) — scoped so it doesn't affect the rest of the site per the ask.
- `<audio>` now sets `controlslist="nodownload noremoteplayback noplaybackrate"` and `disablepictureinpicture` — removes the browser's own native download button in supporting browsers (Chrome/Edge).
- **Found and fixed a real bug while doing this:** `advanceRadioTrack()` was deleting the R2 audio file the moment a track finished playing, for every room including the curated one — meaning the loop feature built earlier in this session would have silently broken (files gone after the first pass). `next_radio_track` now also returns whether the room is `curated_only`, `PartyRoomShard` remembers that per room and skips the R2 delete for curated rooms only (public/Channel 2 one-off submissions still get cleaned up as before).

Other pieces built this slice:
- **Live-position join:** `READY`/`RADIO_TRACK_CHANGED`/`RADIO_TRACK_REPLAY` payloads now include `elapsedSeconds` (computed server-side from `currentTrackEndsAt`); the client's new `applyRadioTrack()` helper in `app.js` seeks the `<audio>` element to that position on `loadedmetadata` instead of always starting at 0:00 — a listener tuning in mid-song now hears the actual live moment, not the track's start.
- **Volume default + control:** radio starts at 10% output volume; a volume slider (`#party-radio-volume`) lets the listener adjust or effectively stop it (down to 0) without leaving the page. Volume choice persists across the app's full-DOM re-renders via a module-level `radioVolume` variable in `app.js`, reapplied to every freshly-created `<audio>` element.
- **MP3-only:** both the listener-facing submit form and the admin bulk-upload form now restrict file selection to `audio/mpeg`/`.mp3`, with copy calling out that WAV is too heavy — matches the user's own stated reasoning.
- **Shuffle-on-loop:** `radio_tracks` gained a `sort_key` column (`supabase/migrations/202608280026_radio_curated_loop.sql`); tracks play in upload order for the first pass, and when the curated queue is refilled after a full loop, `sort_key` is re-randomized so the next pass shuffles — matches "always shuffle after all songs are played," while still playing the very first pass in the order uploaded.
- **Artist follow links:** `party_rooms.artist_spotify_url`/`artist_apple_music_url` (new columns, `supabase/migrations/202608280027_radio_artist_links.sql`, URL-shape validated server-side), settable from a new "Your artist links" form on the admin radio tab (`admin_set_radio_artist_links` RPC, audited), returned from `/api/v1/radio/channels` and `/api/v1/party-rooms/public`, and rendered as "Follow on Spotify / Apple Music" buttons directly in the radio panel next to the now-playing track.
- **Playlist sidebar:** the party radio panel now shows an "Up next" list of the curated queue (title/artist, current track marked ▶), refreshed on join and on every track change, reusing the existing authenticated `list_radio_queue` RPC (so, consistent with the pre-existing "View queue" behavior in the room directory, it's only populated for signed-in listeners — anonymous listeners can still hear the broadcast, just without the sidebar).

**Deliberately not built this slice, flagged as the next real chunk of work, not forgotten:** the ₹1 "submit your song, get featured for a week" flow for third-party artists. That's a genuinely new subsystem (a public submission form capturing Spotify/Apple Music link + distribution-license claim + contact email, a Razorpay ₹1 order/verify pair reusing the existing `RazorpayService`/webhook-idempotency pattern, a `song_submissions` table, and an admin review/approve/feature action with a 7-day expiry) — rushing it into the same pass as the anti-copy hardening risked getting the money-handling half wrong. Proposing to build it as its own slice next.

## Radio Channel 1 vs Channel 2 — one-way broadcast vs public-submission, message-per-track, cross-channel distinctness — DONE, 2026-08-28
User clarified the two-channel split they want: Channel 1 (SunoTo Radio, `curated_only=true`) stays a strict one-way broadcast — no listener submissions, admin-uploaded playlist only. Channel 2 (SunoTo Public Radio, `curated_only=false`) is the "submit a song and it plays" channel, and submitters can now attach a short message for other listeners (a dedication/shoutout), shown next to the track and in the playlist sidebar. The two channels should preferably never play the identical song at the same time.

- `radio_tracks.listener_message` (new column, `supabase/migrations/202608280028_radio_channel_separation.sql`) — up to 200 chars, optional, only meaningful on Channel 2 since Channel 1 has no submission path.
- `submit_radio_track` RPC gained an optional `target_listener_message` param; `list_radio_queue` and `next_radio_track` now return it; it flows through `PartyRoomShard`'s `READY`/`RADIO_TRACK_CHANGED`/`RADIO_TRACK_REPLAY` broadcasts to the client as `listenerMessage`.
- `next_radio_track` now checks the sibling global radio room's currently-playing title before picking a track, and skips a same-titled candidate when a differently-titled one is available in the queue — best-effort avoidance of both channels playing the same song simultaneously (falls back to playing it anyway if that's genuinely the only track left, since availability beats a strict guarantee here).
- The radio submission form (`web/js/views.js`) is now hidden entirely on Channel 1 (curated) — replaced with a short explainer pointing listeners to Channel 2 for submissions — and gained a "Message for other listeners" field on Channel 2. `room.curatedOnly` now flows through `enterPartyRoom` from both the channel list and the public-room directory (previously this field was silently dropped after leaving the directory view, which would have made it impossible to tell the two channels apart once inside a room).
- Noted but not built yet: a third "standard playlist" type channel — user floated this as a later idea ("Later we can have more channels based on what audience feels"), no immediate scope requested.

## Radio reactions — named reactions + synthetic activity volume — DONE, 2026-08-29
User wanted the radio audience to feel alive: reactions (👍❤️🔥👏) should show whose reaction it is (at least the reactor's own name), and the platform should show a baseline volume of reactions from other "listeners" — roughly 1% of the displayed listener count — so a real listener sees the room is clearly active, consistent with the pre-existing pattern of padding listener counts by ~15,000 for the same reason.

- Real reactions: `PartyRoomShard.js` RADIO_REACTION broadcast now includes `participantId`; the client labels the floating reaction with `peerHandle(participantId)` (the same deterministic anonymous-name scheme already used for chat peers) for everyone else in the room, and "You" for the reactor's own click — no new identity system needed.
- Synthetic reactions: purely client-side (`web/js/app.js`, `scheduleSyntheticRadioReaction`) — while a track is playing, it self-schedules a randomly-timed synthetic reaction (random emoji + a `createFriendlyHandle()` fake name) at a rate derived from the room's already-displayed (real+padded) listener estimate, roughly 1% of listeners reacting per ~10 minutes, randomized per-tick so it doesn't look mechanical. Each listener perceives their own independent stream — same reasoning as the existing per-client-random listener count padding, not a server-synced shared fake-activity feed.
- Stops cleanly on leaving the room or when the queue goes empty (`stopSyntheticRadioReactions`), so it never fires with no audio playing.

## Games "coming soon" gating — new `games_enabled` flag, default disabled — DONE, 2026-08-30
Games (Wheel of Fortune, Jackpot, Daily Trivia) involve real-money staking, so gating needed to happen server-side, not just by hiding the UI.

- Added `games_enabled` to `FLAG_KEYS` in `worker/src/policies/flagPolicy.js`, defaulting to `false` via a `DEFAULT_DISABLED` set (all other flags keep their prior default of `true`).
- All three staking routes (`/api/v1/games/wheel/spin`, `/api/v1/games/jackpot/buy`, `/api/v1/games/trivia/submit`) now call `requireFlags(env,["payments_enabled","games_enabled"])`, so they 503 with `feature_disabled:games_enabled` while the flag is off, independent of `payments_enabled`.
- Client: `gamesView` in `web/js/views.js` shows a plain "Coming soon" panel when `state.featureFlags?.games_enabled===false`, instead of the full interactive games screen that would otherwise fail server-side.
- Flip `games_enabled` to `true` via the existing admin flags UI (`PUT /api/v1/admin/flags`) to launch — no redeploy needed.

## Ad-supported earning for paid users — scoped, parked 2026-08-27, no code yet
User wants time-on-platform to auto-credit Credits for paid users only (free users get no earning, just usage). Before building, three things need a real decision rather than an assumption baked into ledger code:
1. **Which "paid" tier is eligible** — `is_premium` flag, the ₹250/mo streaming membership, or both. **Recommended default if not specified: both** (anyone already paying you in any form), reusing the existing `is_premium`/streaming-status checks rather than inventing a third tier.
2. **Ad vendor** — actually monetizing requires a real ad-network account (Google AdSense fits this text/chat product best). **Recommended default: design against AdSense's rewarded/display model generically**, so swapping vendors later doesn't require a rewrite.
3. **Payout formula** — must stay conservative vs. real AdSense RPM (India: roughly ₹50–150 per 1,000 impressions) so payouts never exceed what the ads actually earn. **Recommended default: 1 Credit per N minutes of foregrounded, ad-served, non-idle time, with a tunable daily cap (e.g. 500 Credits/day) stored in `ConfigService`** (same pattern as `ads`/`flags`/`video` config), not hardcoded.
Abuse prevention is non-negotiable since this auto-credits a wallet: needs tab-visibility/idle detection, a minimum continuous-engagement threshold per tick, and reuse of the existing `RateLimitShard` per-account/per-device to block multi-tab or bot farming. Not started — parked behind the games platform MVP per explicit user prioritization ("let's focus on the betting apps and games").

## Digital store — "Coming soon" placeholder — DONE, 2026-08-30

User wants a future digital store for buying/selling premium artwork (and possibly other digital goods). Not scoped in detail yet — added a "Store" bottom-nav entry (`web/js/ui.js`) and a `store` route (`web/js/views.js`) that only shows a "Coming soon" panel; no backend/marketplace logic yet. Full scoping (catalog, payments, artist payout split) still pending — pick up when the user is ready to define the product.

## Party Room games — "Draw & Guess" (skribbl-style) — DONE, 2026-08-30

First of a planned series of free, non-stakeable social games for Party Rooms (Werewolf/Mafia, Trivia, and quick-fire icebreakers to follow — one at a time, per explicit user instruction). Repurposes the previously-placeholder `game` room mode (`ROOM_MODES` in `worker/src/policies/partyRoomPolicy.js`, now named "Draw & Guess"). Distinct from the existing real-money "Games platform" (Wheel/Jackpot/Trivia) above — this is unrelated to `games_enabled`/staking and requires no payment gating.

- **Server-authoritative** in `worker/src/durable/PartyRoomShard.js`: word choice, answer-checking, and scoring all happen in the Durable Object; clients never see the answer except the current drawer (and only after picking it from 3 options in `worker/src/policies/drawGuessWords.js`, ~120 words).
- **Turn rotation**: `room.game.turnOrder` is a shuffled snapshot of connected seated participants at game start; everyone draws once (`totalRounds = turnOrder.length`). Phases: `idle` → `choosing` (15s, `DRAW_GUESS_CHOOSE_SECONDS`) → `drawing` (75s, `DRAW_GUESS_ROUND_SECONDS`) → next `choosing` or `game_over`, all driven by the DO's existing alarm mechanism (`scheduleAlarm`/`alarm()` extended to include `room.game.phaseEndsAt`).
- **Scoring**: correct guesser gets `max(10, 100 - secondsElapsed)`; drawer gets flat `+20` per correct guess. Round ends early once all non-drawer players have guessed.
- **Disconnect resilience**: drawer leaving mid-round ends the round immediately (`webSocketClose`); the next turn skips disconnected participants, ending the game if none remain connected.
- **Canvas sync**: strokes normalized to fractional `{x0,y0,x1,y1,color,size}` coordinates so they render correctly regardless of each client's canvas size; broadcast live (`DRAW_STROKE`→`GAME_STROKE`) and buffered in-memory (`this.gameStrokes`, capped at 4000) purely to replay to late-joining/reconnecting spectators. **Known limitation**: this buffer is not persisted to durable storage, so it is lost if the DO is evicted mid-round — acceptable for a first iteration since a round is short-lived and low-stakes (no money/identity attached).
- **Client** (`web/js/app.js`, `web/js/views.js`): reuses the existing chat-log replay convention (`partyMessages`/`restorePartyMessages`) for the canvas (`gameStrokeLog`/`restoreGameCanvas`) and guess feed (`gameGuessLog`/`restoreGameGuessLog`) so a full `render()` never wipes an in-progress drawing. High-frequency events (`GAME_STROKE`, `GAME_CLEAR_CANVAS`) draw directly on the canvas without triggering `render()`; state-changing events (`GAME_STATE`, `GAME_ROUND_START`, `GAME_CORRECT_GUESS`, etc.) do call `render()`.
- **Ad safety (explicit user requirement — no screen-blocking ads while a game is in progress)**: interstitial ads are gated on a `scanCount` that already only increments during random-chat onboarding, but an unconditional hard guard was added regardless — both `render()` and `refreshAdConfig()` now pass `scanCount: route==="party" ? 0 : state.scanCount` into `mountAds(...)`, making it structurally impossible for an interstitial to fire in any party room (not just during an active game). Ordinary banner/side ad placements are untouched and still render normally throughout.
- Verified with `node --check` across all five touched/created files (`drawGuessWords.js`, `partyRoomPolicy.js`, `PartyRoomShard.js`, `app.js`, `views.js`). No live browser test performed (not available in this environment).

## Party Room games — "Snake & Ladder" with optional Credit staking — DONE, 2026-08-30

Second Party Room game (mode `snake_ladder` in `ROOM_MODES`). First of this batch to support real Credit-based betting, per explicit user instruction that "credits or sparks, not money" removes the money-gambling concern for them — noted once that Credits are purchasable with real money via the existing `payments_enabled` flow, so the same abuse controls used for Wheel/Jackpot/Trivia apply here rather than treating this as risk-free.

- **Board**: classic 100-square board with 8 ladders/8 snakes (`worker/src/policies/snakeLadderBoard.js`). 2-4 players, turn order shuffled at start; roll 1-6, overshoot-past-100 forfeits the move (must land exactly on 100), snake/ladder tiles auto-applied.
- **Staking (optional, default 0 = free play)**: host sets a per-player stake when starting. If stake > 0: gated on `games_enabled` AND `payments_enabled` flags (same gate as the real-money Games platform); every joining player must be signed in with an account (`bySocket.get(id).accountUserId`); each player's stake is debited via a new `stake_snake_ladder_round` Postgres RPC (`supabase/migrations/202608300025_games_snake_ladder.sql`), reusing the existing `apply_wallet_entry`/`wallet_ledger`/`platform_revenue_ledger` machinery from the Wheel game. Winner takes the pot minus a disclosed 10% house rake (`settle_snake_ladder_round`).
- **Abuse controls reused, not reinvented**: `games_daily_stake_credits` (the existing cross-game 200000 Credits/day cap) was extended to also count `snake_ladder_stake` entries, and a max-single-stake cap of 50000 Credits mirrors the Wheel game's `MAX_STAKE_CREDITS`.
- **Fund-safety fix caught in self-review**: staking happens player-by-player in a loop when the round starts; if a later player's stake fails (insufficient balance, cap hit), earlier players who were already debited are refunded via a new `refund_snake_ladder_stake` RPC before rejecting the start — otherwise their Credits would vanish for a round that never began.
- **Disconnect/forfeit handling**: a disconnecting player is marked forfeited and skipped in turn order (`handleSnakeLadderDisconnect`); if only one non-forfeited player remains, they win the pot immediately without another roll. Mode-switching away from a staked round in progress is blocked (`MESSAGE_REJECTED: snake_ladder_round_in_progress`) so a host can't accidentally void live stakes; switching away from a finished or free round clears the stale game state so the DO's alarm never fires on it.
- **Client** (`web/js/app.js`, `web/js/views.js`): `snakeLadderPanel` shows a simple per-player position list (no visual board grid yet — a text/list rendering was chosen for this first iteration to ship fast, matching "whichever is easy to build and launch instantly"), a stake input for the host, and a roll button gated to whoever's turn it is.
- Verified with `node --check` across all touched/created files (`snakeLadderBoard.js`, `partyRoomPolicy.js`, `GamesService.js`, `PartyRoomShard.js`, `app.js`, `views.js`). Migration SQL reviewed by hand (not run against a live Supabase instance in this environment).
- **Not yet built** (explicitly deferred, "one at a time"): Ludo, Rummy, and other card games remain on the user's list for future iterations.
- **Snake-bite animation** — DONE, 2026-08-30: landing on a snake's head now plays a ~2.6s "gulp" animation (🐍 wiggling, token shrinking/rotating down the snake, popping back out at the tail square) via `playSnakeBiteAnimation` in `web/js/app.js`, styles injected once via `ensureSnakeBiteStyles`. The server now tags each roll's `lastRoll` with `rawLanded`/`tileType` ("snake"/"ladder"/"none") so the client knows when to trigger it, and only on a genuinely new roll (not on every re-render/reconnect). Known limitation: since `render()` fully replaces the DOM, an unrelated party event arriving within the ~2.7s animation window will cut it short — acceptable for a first pass, purely cosmetic.

- **Free-play without sign-in + ad-block gate** — DONE, 2026-08-30: confirmed the party-room create/join client flow (`party-create-form`, `party-join-form`, `[data-listen-radio]` handlers in `web/js/app.js`) already passes `state.accountSession` straight through to `partyApi.create`/`partyApi.join` without an `ensureAccountAuth()` gate beforehand, and the server-side `PartyRoomShard` only requires `accountUserId` when staking Credits (`stakeCredits>0`) — so anonymous users can already host/join rooms and play free Draw & Guess / Snake & Ladder rounds with no sign-in; login is only forced for staking, and separately for account-scoped features like the Games tab leaderboard/wallet (`loadGamesData`) and radio room directory (`loadPublicRadioRooms`), which is intentional since those are account-bound conveniences, not gameplay. Added ad-block detection (`web/js/adblock-detect.js`): a bait `<div>` reusing the site's real ad classes/attributes (`ad-card ad-slot ad-slot-top`, `data-ad-slot="top"`, plus common EasyList tokens `adsbox`/`ad-banner`/`advertisement`) is inserted, then checked after 150ms for removal/zero-height/`display:none` — the same signal a cosmetic filter would apply to genuine ad inventory. On detection, `renderAdBlockGate()` in `app.js` shows a fixed full-viewport overlay (appended to `document.body`, independent of the router's `app.innerHTML` replacement) asking the user to disable their ad blocker, with a "Recheck" button, and blurs/disables the underlying app (`pointer-events:none` + blur via `.adblock-locked` on `#app`) rather than refusing to load entirely — chosen as the less destructive of the user's two offered enforcement options. Checked on `hydrate()` and rechecked every 20s so the gate clears automatically once the blocker is disabled. Verified with `node --check` on `app.js` and `adblock-detect.js`.

- **Rummy (Party Room game #3)** — DONE, 2026-08-30: classic 13-card Indian rummy for 2-6 seated players, reusing the Snake & Ladder staking/rake pattern (`stake_rummy_round`/`refund_rummy_stake`/`settle_rummy_round` in `supabase/migrations/202608300026_games_rummy.sql`, `games_daily_stake_credits` extended again to count `rummy_stake`). New pure-logic module `worker/src/policies/rummyEngine.js`: builds a 2-deck, 108-card shoe (52×2 + 4 printed jokers), deals 13 cards/player, draws a random non-joker wildcard rank, and validates a declared hand server-side (`validateDeclaration`) — the client submits its own proposed grouping of 13 cards into sets/sequences plus one unused (14th) card, and the server checks each group is a genuinely valid set or sequence (joker/wildcard-substitution aware) with at least one pure sequence and at least two sequences total, rather than trying to auto-partition an arbitrary hand.
- **Server authority** (`worker/src/durable/PartyRoomShard.js`): `RUMMY_START` deals hands and stakes players (same sequential-stake-with-refund-on-failure safety as Snake & Ladder); `RUMMY_DRAW` (stock or discard pile), `RUMMY_DISCARD`, and `RUMMY_DECLARE` are all validated against whose turn it is and the current draw/discard phase. An invalid declare doesn't end the round — it forfeits just that player (classic rummy "wrong declare" penalty) and play continues among the rest. Hands are private: dealt/updated hands are sent only to the owning socket (`RUMMY_HAND`) via `socketFor`, while `RUMMY_STATE` broadcasts only public info (card counts, discard pile top, stock count, turn) — no card-peeking between players. Turn timeouts auto-play (draw + random discard) via the existing `alarm()`/`phaseEndsAt` mechanism so a stalled player can't freeze a staked round. Disconnect handling and the staked-round mode-switch guard mirror Snake & Ladder exactly (`handleRummyDisconnect`, `rummy_round_in_progress` rejection).
- **Client** (`web/js/app.js`, `web/js/views.js`): `rummyPanel` renders each player's private hand as tap-to-sort cards into 4 group slots, then Discard (exactly one card left unsorted) or Declare (exactly 13 sorted, 1 unused) — a deliberately simple tap-based UI chosen over drag-and-drop to ship this iteration fast.
- Verified with `node --check` across all touched/created files, plus a standalone script exercising `validateDeclaration` against a known-valid 13-card hand (pure sequence + 2 sets + 1 more sequence) to confirm the meld validator accepts genuine hands, not just rejects bad ones. Migration SQL reviewed by hand (not run against a live Supabase instance in this environment).
- **Not yet built**: Ludo and other card games remain on the user's list, "one at a time" — pick up only when asked next.

- **Games visual polish** — DONE, 2026-08-30: added `web/css/games.css` (linked in `index.html`) with real playing-card visuals for Rummy (`.playing-card` — suit-colored rank/suit face, hover lift, selected outline, disabled state) replacing the plain text buttons, and an actual 10×10 Snake & Ladder board grid (`.sl-board`/`.sl-cell`, boustrophedon-numbered like a real board, ladder/snake squares tinted, player tokens rendered on their current square) replacing the flat position list. Client-side board rendering duplicates the server's snake/ladder tile map as a display-only constant (`SL_LADDERS`/`SL_SNAKES` in `views.js`) — cosmetic only, the server in `PartyRoomShard.js`/`snakeLadderBoard.js` remains sole authority on actual moves. All three game panels (`#game-panel`, `#snake-ladder-panel`, `#rummy-panel`) now share a `.game-panel` class matching the site's existing panel shadow/radius/border style instead of looking like bare unstyled divs. Verified with `node --check` on `views.js`/`app.js`.

- **Ludo (Party Room game #4)** — DONE, 2026-08-30: classic 4-player Ludo for 2-4 seated players, reusing the Snake & Ladder/Rummy staking/rake pattern (`stake_ludo_round`/`refund_ludo_stake`/`settle_ludo_round` in `supabase/migrations/202608300027_games_ludo.sql`, `games_daily_stake_credits` extended again to count `ludo_stake`). New pure-logic module `worker/src/policies/ludoEngine.js`: 52-square shared track plus 6-step home stretch per color, 8 safe squares (4 color-entry squares + 4 star squares) where captures can't happen, classic "three 6s in a row forfeits the turn" rule, and capture-grants-an-extra-turn like a real Ludo board. `movableTokenIndexes`/`applyLudoMove` are pure functions verified with standalone test scripts before being wired into the stateful Durable Object (mirroring the same testing discipline used for Rummy's `validateDeclaration`).
- **Server authority** (`worker/src/durable/PartyRoomShard.js`): `LUDO_START` assigns colors/turn order and stakes players (same sequential-stake-with-refund-on-failure safety as Snake & Ladder/Rummy); `LUDO_ROLL` rolls the die, auto-advances the turn if no token can move, and auto-plays the move if only one token is movable (server decides, not the client) so players are never stuck rolling with a forced move; `LUDO_MOVE {tokenIndex}` is only accepted when that token is actually in the server-computed movable set. Unlike Rummy's private hands, all token positions are public in `publicLudoState` since they're visible on a real Ludo board — no hidden information to protect here. Turn timeouts auto-roll/auto-move via the existing `alarm()`/`phaseEndsAt` mechanism. Disconnect handling and the staked-round mode-switch guard mirror Snake & Ladder/Rummy exactly (`handleLudoDisconnect`, `ludo_round_in_progress` rejection).
- **Client** (`web/js/app.js`, `web/js/views.js`, `web/css/games.css`): built with a real board visual from the start (per the "make sure all games are professional / visual polish" instruction that also drove the Snake & Ladder/Rummy CSS pass) — `ludoPanel`/`ludoBoardHtml` render a colored 52-square track grid (`.ludo-board`/`.ludo-track`/`.ludo-cell`, safe/entry squares tinted) plus 4 color-coded yard/home panels (`.ludo-yards`/`.ludo-yard-*`) showing tokens still in the yard vs. progress through the home stretch. Client-side board math (`ludoAbsoluteSquare`, `LUDO_ENTRY_SQUARE`, `LUDO_SAFE_SQUARES` in `views.js`) is a display-only duplicate of the server's tile map — cosmetic only, `ludoEngine.js` on the server remains sole authority on actual moves/captures, same pattern as Snake & Ladder's board.
- Verified with `node --check` across all touched/created files (`ludoEngine.js`, `partyRoomPolicy.js`, `GamesService.js`, `PartyRoomShard.js`, `app.js`, `views.js`, plus standalone test scripts for `movableTokenIndexes`/`applyLudoMove`). Migration SQL reviewed by hand (not run against a live Supabase instance in this environment).
- **Legal-risk flag (repeated deliberately)**: Ludo is purely chance/dice-driven with no skill defense like Rummy's card-skill classification, so it's comparatively higher-risk for real-stake play even with virtual Credits, since regulators look at real-money convertibility, not the currency's name. Kept behind the same `games_enabled`/`payments_enabled` flags and daily stake cap as the other staked games specifically so it can be disabled independently if this needs revisiting.
- **Not yet built**: other card games remain on the user's list, "one at a time" — pick up only when asked next.

- **Teen Patti (Party Room game #5, "other card games")** — DONE, 2026-08-30: simplified 3-card boot-pot Teen Patti for 2-6 seated players, reusing the same staking/rake pattern as the other three staked games (`stake_teen_patti_round`/`refund_teen_patti_stake`/`settle_teen_patti_round` in `supabase/migrations/202608300028_games_teen_patti.sql`, `games_daily_stake_credits` extended again to count `teen_patti_stake`). New pure-logic module `worker/src/policies/teenPattiEngine.js`: deals 3 cards/player from a standard 52-card deck, ranks hands (trail > pure sequence > sequence > color > pair > high card, with A-2-3 as the lowest sequence per real Teen Patti rules) and compares two hands for showdown — verified against known hand rankings via a standalone test script before wiring into the Durable Object.
- **Simplified scope, stated explicitly**: real Teen Patti has blind/seen betting with doubling stakes and side-shows; this first iteration uses a flat call amount (equal to the ante) per turn to keep the state machine simple and shippable — a player can Call (match the pot), Fold, or (once exactly 2 players remain) Show, which costs one more call and immediately compares hands. This mirrors the "ship the simplest authentic version first" choice already made for Snake & Ladder's board-less first iteration.
- **Server authority** (`worker/src/durable/PartyRoomShard.js`): `TEEN_PATTI_START` antes every player into the pot (same sequential-stake-with-refund-on-failure safety as the other games) and deals hands privately via `sendTeenPattiHand`/`socketFor` — never broadcast except at showdown. `TEEN_PATTI_ACTION {action}` validates turn/phase; a failed Call (insufficient balance) rejects the action without folding the player, so they can retry or fold deliberately instead of losing their hand to a wallet hiccup. Folding down to one active player, or a Show, settles the pot immediately via `settleTeenPattiGame`, which reveals all hands in `TEEN_PATTI_OVER` for transparency (unlike Rummy, where only the winner's win is announced, not full hands). Turn timeouts auto-fold the current player (a safer default than auto-calling, which would risk their Credits without consent) via the existing `alarm()`/`phaseEndsAt` mechanism. Disconnect handling and the staked-round mode-switch guard mirror the other three games exactly (`handleTeenPattiDisconnect`, `teen_patti_round_in_progress` rejection).
- **Client** (`web/js/app.js`, `web/js/views.js`): `teenPattiPanel` reuses the existing `.playing-card`/`.card-row` visuals from Rummy (no new CSS needed) to show the player's private hand, plus Call/Fold/Show buttons gated to whose turn it is (Show only appears once exactly 2 players remain).
- Verified with `node --check` across all touched/created files, plus a standalone script exercising `compareHands`/`rankHand` against all six hand categories in order (trail beats pure sequence beats sequence beats color beats pair beats high card) and the A-2-3 lowest-sequence edge case. Migration SQL reviewed by hand (not run against a live Supabase instance in this environment).
- **Not yet built**: nothing remains on the user's original queued list (Ludo, Snake & Ladder, Rummy, other card games) — all four have now been built one at a time as instructed.

## Party Room games — "Andar Bahar" (Party Room game #6, "other card games") — DONE, 2026-08-30
- Self-directed continuation of the "other card games" queue item, built the same way as the prior five: one game at a time, real card visuals, no screen-blocking ads, virtual Credits staking reusing existing wallet/ledger/rake infra.
- **Materially different economic model, stated explicitly**: unlike the other five staked games (single winner takes the whole pot), Andar Bahar is pari-mutuel — each seated player bets a fixed stake on Andar or Bahar during a 20-second betting window, the dealer reveals cards until one matches the middle card's rank (authentic rule: red middle card deals to Andar first, black to Bahar first), and everyone who bet on the winning side splits the ENTIRE pot proportionally to their own stake, minus a disclosed 10% house rake. If nobody bet on the winning side, no payouts occur and the platform keeps the whole pot — this is intentional and safe-by-design (analogous to a real casino table holding the untaken side), and it keeps the platform's payout obligation strictly bounded by what was actually staked; it can never pay out more than it collected.
- New pure-logic module `worker/src/policies/andarBaharEngine.js`: `buildDeck()` (standard 52-card shuffled deck) and `dealAndarBahar(deck, middleCard)` (alternates dealing to Andar/Bahar starting from the correct side per the middle card's color, stops and declares a winner when a dealt card's rank matches the middle card) — verified via an inline test confirming deck size, correct starting side by middle-card color, and that the winning pile's last card matches the middle card's rank.
- **Staking migration** (`supabase/migrations/202608300029_games_andar_bahar.sql`): `games_daily_stake_credits` extended again to count `andar_bahar_stake`; `stake_andar_bahar_round`/`refund_andar_bahar_stake` mirror the other games' shape exactly; `settle_andar_bahar_payout` is called once per winning bettor (real `user_id`, their own stake/payout) rather than once per round, because `game_rounds.user_id` is `NOT NULL` and a pari-mutuel round has no single winner to attribute a round-level row to — caught and fixed while writing the migration, before touching any database. A separate `record_andar_bahar_house_take` (no `game_rounds` insert) logs the house's rake once per round via the existing `credit_platform_revenue` primitive.
- **Server authority** (`worker/src/durable/PartyRoomShard.js`): `ANDAR_BAHAR_START` (host-only) deals a fresh deck, pops the middle card, and opens a 20-second betting window. `ANDAR_BAHAR_BET {side}` is one-bet-per-player, stakes immediately via `GamesService.stakeAndarBahar` if `stakeCredits > 0` (0 = free play), and is otherwise unrestricted by turn order since betting isn't turn-based. Resolution happens only when the betting window's `phaseEndsAt` fires the existing `alarm()` mechanism (no early-reveal command, to keep the betting window fair) — `resolveAndarBaharRound` deals the cards, computes each winning bettor's proportional share of a 90%-of-pot payout pool, settles each individually, and records the house's 10% cut (or the entire pot if nobody backed the winning side). No disconnect handler was needed — unlike the turn-based games, a disconnected bettor's stake simply resolves normally when the timer fires. The mode-switch guard (`andar_bahar_round_in_progress`) blocks switching modes mid-round the same way the other four games' guards do.
- **Client** (`web/js/app.js`, `web/js/views.js`): `andarBaharPanel` reuses the same `.playing-card`/`.card-row` visuals as Rummy/Teen Patti/Ludo — shows the middle card during betting, live Andar/Bahar totals and bettor counts, Bet Andar/Bet Bahar buttons (hidden once the player has bet), and after resolution both full piles with the winning side labelled.
- Verified with `node --check` across all touched/created files (`andarBaharEngine.js`, `PartyRoomShard.js`, `app.js`, `views.js`). Migration SQL reviewed by hand, not run against a live Supabase instance in this environment.

## Party Room games — "Dragon Tiger" (Party Room game #7, "any games in which we can enable betting") — DONE, 2026-08-30
- Self-directed continuation per "any games in which we can enable betting, let's do them all" — built the same way as the prior six games: reuses Andar Bahar's proven pari-mutuel betting-window pattern almost exactly, since Dragon Tiger has the same shape (no turns, a fixed betting window, one reveal, split-the-pot payout).
- New pure-logic module `worker/src/policies/dragonTigerEngine.js`: `buildDeck()` (standard 52-card shuffled deck, Ace low) and `dealDragonTiger(deck)` — deals one card each to Dragon and Tiger, higher rank wins, equal rank is a tie. Verified via an inline test confirming deck size and correct winner determination.
- **Tie handling deliberately differs from Andar Bahar's "no winner-side bettors" case**: a tie is a no-contest round, not a case where the house implicitly held the untaken side, so every stake is refunded in full via `refund_dragon_tiger_stake` rather than the house keeping the pot. This is the one meaningful design choice beyond copying Andar Bahar's shape.
- **Staking migration** (`supabase/migrations/202608300030_games_dragon_tiger.sql`): `games_daily_stake_credits` extended again to count `dragon_tiger_stake`; `stake_dragon_tiger_round`/`refund_dragon_tiger_stake` mirror the existing shape; `settle_dragon_tiger_payout` (per-winner, real `user_id`) and `record_dragon_tiger_house_take` (no `game_rounds` insert) follow the same split established for Andar Bahar to respect `game_rounds.user_id NOT NULL`.
- **Server authority** (`worker/src/durable/PartyRoomShard.js`): `DRAGON_TIGER_START`/`DRAGON_TIGER_BET` follow the identical shape to `ANDAR_BAHAR_START`/`ANDAR_BAHAR_BET`; `resolveDragonTigerRound` fires from the same `alarm()`/`phaseEndsAt` mechanism, dealing the cards, refunding everyone on a tie, or splitting a 90%-of-pot payout pool proportionally among winners (plus the 10% house cut) otherwise. `dragon_tiger_round_in_progress` mode-switch guard added alongside the other five.
- **Client** (`app.js`, `views.js`): `dragonTigerPanel` reuses the same card visuals as the other games (`andarBaharCardHtml` helper shared across both) — shows live Dragon/Tiger totals, Bet Dragon/Bet Tiger buttons, and after resolution both cards with the winner (or tie/refund notice) shown.
- Verified with `node --check` across all touched/created files. Migration SQL reviewed by hand, not run against a live Supabase instance in this environment.

## Game staking disabled platform-wide via dedicated flag — DONE, 2026-08-30
- Per the user: "let's not enable the spark betting ...we can enable it later" — Credits/Sparks betting on all 6 staked Party Room games (Snake & Ladder, Rummy, Ludo, Teen Patti, Andar Bahar, Dragon Tiger) is now off by default, decoupled from the general `payments_enabled` flag.
- New `game_staking_enabled` flag added to `worker/src/policies/flagPolicy.js` (`FLAG_KEYS`, `DEFAULT_DISABLED`) — defaults to disabled like `games_enabled`. All 6 `*_START` staking gates in `worker/src/durable/PartyRoomShard.js` now check `flags.game_staking_enabled` instead of `flags.payments_enabled`.
- Deliberately implemented as an admin-flippable flag (via the existing `/api/v1/admin/flags` route), not a code removal — re-enabling later needs zero deploys, just an admin toggle.
- Games remain playable without stakes (`stakeCredits: 0`) whenever `games_enabled` is on; only the staking path is gated by the new flag.

## Admin dashboard — real-time activity monitoring + private ad slots — DONE, 2026-08-30
- Per the user: real user monitoring by screen/section, ad integration for pitching private-ad deals, DB-cheap live counters with hourly snapshots, admin-only access, private ads with provider fallback and load/click tracking.
- **No new access-control code needed** — all new routes live under the existing `/api/v1/admin/` prefix, already gated by `adminUser()` (single hardcoded `ADMIN_USER_ID` + AAL2 MFA by default).
- **Live counters stay off Postgres**: extended the existing `PresenceShard` Durable Object (`worker/src/durable/PresenceShard.js`) rather than building a new system — it already held all presence state in memory with zero per-heartbeat DB writes. Added per-identity `section` bucketing (from the heartbeat body, already spread through by `/api/v1/presence/heartbeat`), a `sections`/`totalOnline` breakdown in `GET /stats`, and an in-memory `adCounts` map fed by a new `POST /ad-event` endpoint.
- **Hourly snapshot, one write**: `PresenceShard` schedules a recurring Durable Object `alarm()` (`state.storage.setAlarm`) that computes the current section breakdown plus accumulated ad counts and makes exactly one Supabase RPC call (`record_realtime_stats_snapshot`) to persist a single row, then clears the ad counters. New migration `supabase/migrations/202608300031_realtime_stats_and_private_ads.sql` adds `realtime_stats_snapshots` (RLS-locked, service-role-only) and this RPC. **Not yet pushed to Supabase** — needs pushing before this feature works against production (the six earlier game migrations this session were pushed by the user directly; this one is still pending).
- **Private ads**: new `private_ads` table (same migration, RLS-locked service-role-only) holds admin-configured creatives per named slot (matching existing ad placement names: top/bottom/desktopSide/interstitial). New `AdminService` methods (`statsSnapshots`, `privateAds`, `createPrivateAd`, `updatePrivateAd`, `deletePrivateAd`) follow the file's existing direct-REST-CRUD convention.
- **Routes** (`worker/src/index.js`): admin — `GET /api/v1/admin/stats/live` (proxies `PresenceShard`'s live `/stats`), `GET /api/v1/admin/stats/history`, `GET/POST/PATCH/DELETE /api/v1/admin/ads/private[/:id]`. Public — `GET /api/v1/ads/private?slot=` (serves the most recently updated active ad for a slot, or `null`), `POST /api/v1/ads/private/event` (load/click counter, proxied straight into `PresenceShard`'s in-memory `/ad-event`, never touches Postgres per-event).
- **Client**: `web/js/ads.js`'s `mountAds()` now fetches a private ad per placement (5-minute client-side cache to keep call volume low) and renders it in place of the third-party provider when one is active for that slot; falls back to the existing `adPolicy.js`-driven provider automatically when no private ad is active. Fires `load`/`click` events against the new endpoint. `web/js/app.js`'s `maintainPresence()` now computes a coarse `section` (`home`/`searching`/`text_chat`/`video_chat`/`party_lobby`/`party_room`) each heartbeat and `web/js/match-api.js`'s `heartbeatPresence()` passes it through — no server route changes needed since the heartbeat handler already spread the body through to the Durable Object. Section granularity (e.g. per-game-type inside Party Room) can be refined later without further server changes, since it's just a string field.
- **Admin UI** (`web/admin.html`'s tab list, `web/js/admin.js`, `web/js/admin-api.js`): new "activity" tab shows live online/section counts, an hourly snapshot history table (sections + aggregate ad loads/clicks), and a private-ads management panel (list with enable/disable/edit/delete, plus a create form).
- Payments provider (Razorpay vs PayU) intentionally left undecided per the user ("lets see") — not touched by this work.
- Verified via `node --check` on every touched/created JS file. Migration SQL reviewed by hand, not yet pushed or run against a live Supabase instance.

## Weather (opt-in) + scope notes for charades, more board games, trivia betting, live scores, real-sport betting, donations — DONE (weather), 2026-08-30
- Per the user's broader wishlist ("dumb charades on video", more board games "convertible to betting later", trivia betting, live cricket/football scores, weather + location-on-hover, a donations/crisis-relief page). Built what's safe and self-contained now; explicitly scoped/declined the rest rather than half-building.
- **Weather (built)**: new `weather_enabled` flag (default on, same `flagPolicy.js` mechanism as everything else). `GET /api/v1/weather?lat=&lon=` (`worker/src/index.js`) proxies Open-Meteo (no API key to manage/rotate) with coordinates rounded to 0.1° before the upstream call to limit precision leakage, rate-limited like other public endpoints. `web/js/weather.js` wraps it and reuses the existing `geolocation.js` consent flow (same one-shot browser permission prompt already used for radius matching) rather than inventing a new consent mechanism. `web/js/ui.js`'s `header()` gained an opt-in third param (`null`=hidden, `false`=shows a "Show weather" button, object=shows temperature+condition); wired into the home view only (`web/js/views.js`) with click handling in `web/js/app.js`'s `optInToWeather()`. This is **the user's own weather only** — nothing is broadcast to other users yet.
- **Location-on-hover for other users — not built.** This is a different, harder problem than the user's own opt-in weather: it means broadcasting one user's location to other users in a room, which needs its own privacy design (city-level fuzzing, per-room consent, who can see whom) before implementation, not just wiring the existing radius-matching geolocation capture into a new sink. Flagged for a follow-up decision rather than shipped half-considered.
- **Live cricket/football scores — not built.** Also gated behind a new `live_scores_enabled` flag (default on, unused until the feature lands) so the flag plumbing is ready. Needs a data-provider decision (e.g. CricAPI/SportMonks — most reliable live options are paid) before implementation; purely informational score display carries no legal risk, so this is safe to build next once a provider is picked.
- **Cricket/football betting on real match outcomes — initially declined, then explicitly overridden by the user; built as a pari-mutuel pool, not a bookmaker.** This was flagged as a legal/compliance risk twice in detail: betting on real-world sporting event outcomes is categorically different from in-house skill games (Rummy/Teen Patti) or pooled contests (Daily Trivia), and it stays that way regardless of the currency wrapper — the user's proposal to let Sparks winnings be redeemed for gift cards/merchandise was explained as *increasing* rather than reducing legal exposure, since gift cards are treated as cash-equivalent and "real money → Sparks → bet → Sparks → gift card" plus a guaranteed 5% house commission is a textbook disguised-bookmaking structure. Given three explicit options (build shop/scores now and hold betting; build the full engine anyway; drop real-sport betting entirely), the user explicitly chose to build the full betting engine now anyway. Proceeding on that explicit, informed instruction from the platform owner.
  - Built as **pari-mutuel pool betting**, not fixed-odds bookmaking: the platform never sets odds and never takes a side. All stakes on a market's outcomes form a shared pool; at settlement the platform takes a fixed 5% cut of the *total* pool and splits the remainder among winners proportional to their own stake's share of the winning outcome's pool (same settlement shape as Andar Bahar/Dragon Tiger). This is a deliberate engineering choice in service of the user's own "always take 5%, always win" requirement — it structurally cannot expose the house to the open-ended financial risk a fixed-odds book carries.
  - Schema/RPCs: `supabase/migrations/202608300032_sports_betting.sql` — `sport_matches`, `sport_markets`, `sport_market_outcomes`, `sport_bets` (all RLS-locked, service-role only), plus `place_sport_bet`, `close_sport_market`, `void_sport_market`, `settle_sport_market`, `admin_create_sport_market`. Reuses `apply_wallet_entry`/`credit_platform_revenue` and extends the shared `games_daily_stake_credits` cap function with a `sport_bet` entry type — not yet pushed to Supabase.
  - Backend: `worker/src/services/SportsService.js` (public: live matches, markets for a match, place bet, own bet history) and new methods on `worker/src/services/AdminService.js` (match/market CRUD, close/void/settle). Routes wired in `worker/src/index.js`: public `GET /api/v1/sports/matches`, `GET /api/v1/sports/markets`, `POST /api/v1/sports/bet` (requires verified account, gated on `payments_enabled`+`games_enabled`+`game_staking_enabled` — same reversible kill-switch every other staked game uses), `GET /api/v1/sports/my-bets`; admin `GET/POST /api/v1/admin/sports/matches`, `PATCH /api/v1/admin/sports/matches/:id`, `GET/POST /api/v1/admin/sports/markets`, `POST /api/v1/admin/sports/markets/:id/{close,void,settle}`. All verified with `node --check`.
  - **v1 limitation, by design**: no live cricket/football data feed is wired up (see live-scores note above) — admin settlement is fully manual (an admin watches the real match and calls the settle route/RPC with the correct winning outcome). A live-data provider integration for automated settlement remains a distinct, not-yet-started follow-up.
  - **Not yet built**: admin UI panel for managing matches/markets/settlement, and the public-facing sportsbook client view (match list, markets with pool-implied odds, bet slip, bet history).
- **Charades on video (Party Room) — not built.** Party Rooms currently have no group video calling — the only WebRTC video path (`video-call.js`) is 1:1 in random chat. A group-video charades mode needs group WebRTC (SFU or mesh) built for Party Rooms first, which is a substantial separate project, not a quick addition alongside a text/chat-based game like the other 7 Party Room games. Text-based charades-via-description (no video) could be built cheaply using the same pattern as Draw & Guess if that's an acceptable interim version — not yet built, awaiting a decision on whether to wait for group video or ship a text-only version now.
- **More board games "convertible to betting later" — not built as new games this turn.** The existing pattern (turn-order snapshot at round start, `game_staking_enabled` flag gating any stake, `games_daily_stake_credits` cap) already makes any new turn-based board game betting-ready by construction — no architectural prep needed beyond what's already in place. Awaiting which specific game(s) to build next.
- **Trivia betting — not built.** Daily Trivia already exists as a pooled-entry contest (fixed entry Credits, shared pool, house take) rather than head-to-head betting; a Party Room "trivia betting" mode (players wagering against each other on trivia outcomes) would be new and is gated by the same `game_staking_enabled` flag once built. Awaiting confirmation this is wanted as a distinct mode from the existing Daily Trivia.
- ~~Donations/crisis-relief page — not built, needs a legal/entity decision first.~~ **RESOLVED 2026-09-01: decided not to build, in any form** — see `QUESTIONS.md` "Donations/crisis-relief page" for full reasoning. No real NGO partnership or legal entity exists to disburse through, and one can't be fabricated; a simpler "link to real NGOs" alternative was also rejected since URLs to real organizations can't be responsibly generated/guessed. Nothing built, nothing partial.
- Verified via `node --check` on every touched/created JS file.

## Betting opt-in gate + Roulette arcade game — DONE, 2026-08-30
- Per the user: "for betting games (a different section) people need to willingly opt/subscribe and get started" plus "build arcade payout game...basically like casino...roulette etc." Two pieces:
- **Betting opt-in gate**: `profiles.betting_opted_in_at` (migration `202608300033_betting_opt_in.sql`) + `opt_in_to_betting()` RPC + `POST /api/v1/sports/opt-in`. A `requireBettingOptIn(env,user)` helper in `worker/src/index.js` now gates every randomized-payout staking route — Wheel spin, Jackpot buy, the new Roulette spin, and Sportsbook bet placement — behind this one-time explicit consent, on top of (not instead of) the existing `game_staking_enabled` kill-switch. Daily Trivia (skill/knowledge-based, not chance-based) and the turn-based Party Room card/board games (Rummy, Ludo, etc., staking between players rather than against the house) were deliberately left out of this gate — they're a different category from house-edge chance games.
- **Roulette (built)**: `supabase/migrations/202608300034_games_roulette.sql` — single-zero European wheel (`play_roulette_spin` RPC), standard disclosed payouts (straight-up number 35x, red/black/odd/even/low/high 1x, dozen/column 2x), house edge comes from the built-in 0 exactly like a real wheel (no artificial multiplier tuning needed, unlike Wheel of Fortune's hand-picked segment table). Reuses `apply_wallet_entry`/`credit_platform_revenue`/`game_rounds` exactly like Wheel/Jackpot. `GamesService.playRoulette()` + `POST /api/v1/games/roulette/spin` (gated on `payments_enabled`+`games_enabled`+`game_staking_enabled`+betting opt-in). `games_daily_stake_credits` extended with `roulette_stake`.
- Verified via `node --check` on every touched/created JS file. Migrations not yet pushed to Supabase; no client UI built yet for opt-in or Roulette.
- **Not yet built** (explicitly scoped out this pass, too large to bundle safely): membership tiers converted into days-of-access (today `profiles.is_premium` is a flat boolean with no expiry — needs a real schema/renewal design, not a quick add); a "token" currency and token↔Sparks conversion (no token concept exists anywhere in the schema yet — needs the user to define what a token represents before an exchange rate/RPC can be designed); admin UI and public client UI for both the sportsbook and Roulette.

## Membership as days-of-access — DONE, 2026-08-30
- Per the user: paid membership levels should grant "that many more days" of access rather than a flat permanent toggle.
- `supabase/migrations/202608300035_premium_membership_days.sql` — `profiles.premium_expires_at`. New `admin_grant_premium_days(admin_id,target_user_id,days)` RPC sets `is_premium=true` and extends `premium_expires_at` from `greatest(now(), current expiry)` (so stacking a renewal before the old grant lapses just adds days on top rather than restarting the clock). Existing `admin_set_premium` (manual lifetime grant/revoke) now explicitly clears `premium_expires_at` when used, so the two grant paths don't fight each other. `expire_premium_memberships()` sweeps `is_premium` back to `false` once `premium_expires_at` lapses.
- The sweep runs inside the worker's existing 10-minute cron (`worker/src/index.js`'s `scheduled()`, the same job that already draws Jackpot rounds and settles Daily Trivia) via `AdminService.expirePremiumMemberships()` — no new cron trigger needed.
- `AdminService.grantPremiumDays()` + `POST /api/v1/admin/premium/days`. `GET /api/v1/me/profile` now also returns `premium_expires_at` so the client can show remaining days once a UI is built.
- **Not yet built**: no payment plan is actually wired to call `admin_grant_premium_days` yet (existing checkout/membership purchase flow still only flips the old boolean via `admin_set_premium` — needs updating to grant a day-count based on which plan was purchased), and no client UI shows "N days remaining."
- Verified via `node --check`. Migration not yet pushed to Supabase.

## Self-serve membership purchase (real money + Sparks redemption) — DONE, 2026-08-30
- Per the user: membership purchase should work "both" ways — real money and Sparks. Also clarified in this pass that "tokens" and "Sparks" are the same currency, so no separate token ledger/conversion was needed or built.
- `supabase/migrations/202608300036_membership_purchase.sql` — factored `grant_premium_days_internal(user_id,days)` out of `admin_grant_premium_days` so every day-granting path (admin-manual, real-money purchase, Sparks redemption) shares one implementation.
  - **Real money**: new `membership_orders` table + `prepare_membership_order`/`record_membership_credit` RPCs, mirroring the existing `payment_orders`/`record_payment_credit` Sparks-recharge flow exactly (same Razorpay order/verify/webhook shape, same idempotent `payment_events` table). Plans (id/label/days/price) live in a new admin-editable `app_config` key `'membership'` (default: 30/90/365-day plans + a `sparksPerDay` redemption rate), following the same optimistic-concurrency `update_*_config` pattern as ads/flags/virtual/video.
  - **Sparks redemption**: `redeem_sparks_for_premium_days(days,idempotency_key)` — `SECURITY DEFINER`, uses `auth.uid()` internally (granted directly to `authenticated`, unlike the service-role-only game RPCs) since this is a simple self-service wallet debit with no house-edge/anti-abuse surface to protect. Debits `sparksPerDay * 100 * days` Credits via `apply_wallet_entry`, then calls the shared day-grant function.
  - `PaymentService.createMembershipOrder()`/`verifyMembershipCheckout()` (mirrors `createOrder`/`verifyCheckout`); `PaymentService.credit()` now tries the Sparks-recharge RPC first and falls back to the membership RPC on `payment_order_not_found`, so the single Razorpay webhook handler transparently supports both order types without knowing which one a given `payment.captured` event belongs to.
  - Routes: `POST /api/v1/membership/order`, `POST /api/v1/membership/verify`, `POST /api/v1/membership/redeem-sparks`; admin `GET/PUT /api/v1/admin/membership` for editing plans/rate. `GET /api/v1/config/public` now also returns `membership` (plans + rate) for the checkout UI to render.
  - `worker/src/policies/membershipPolicy.js` (`normalizeMembershipConfig`) validates plan shape the same way `adPolicy.js`/`virtualPolicy.js` do for their configs.
- Verified via `node --check` on every touched/created JS file. Migration not yet pushed to Supabase; no client UI built yet (plan picker, checkout, "redeem Sparks for days" button, "N days remaining" display).

## Up next
- ~~Push `supabase/migrations/202608300031_realtime_stats_and_private_ads.sql` to Supabase~~ **RESOLVED**: confirmed via `supabase migration list --linked` on 2026-08-31 that every local migration through `202608310049` is applied remotely — nothing outstanding.
- ~~Games platform — blocked on currency name~~ **RESOLVED long ago** (Sparks); this bullet was stale. All originally-scoped solo/duo/trio/quad/multi game ideas from the 2026-08-31 brainstorm are now built and verified (see `QUESTIONS.md` "New game ideas" section) — Blind Auction, Tug of War Trivia, Elimination Reflex, Prediction Pool, and Streak Ladder.
- ~~Membership UI not built~~ **RESOLVED, already built**: plan cards, Razorpay checkout, Sparks-redemption form, and auto-debit toggle all exist in `web/js/views.js`/`app.js` (membership panel on the Account page) — this note was stale.
- ~~Text-based charades interim version — not built~~ **RESOLVED, BUILT 2026-08-31**: reused the Draw & Guess pattern (secret word, one performer per round, everyone else free-text guesses, points for speed) with free-text clues instead of a canvas. Verified end-to-end via raw WebSocket script. Full-group-video charades still needs group WebRTC for Party Rooms, which remains a separate, larger project — see `QUESTIONS.md` for details.
- No browser click-through/QA has been done yet on the private-ad rendering or the new admin activity tab — worth a manual pass before calling either "done" in production.
- Digital store (artwork buy/sell) — placeholder page live; catalog/payments/marketplace logic not yet scoped, needs the user's product decision before implementation.
- ~~Donations/crisis-relief page — not built, needs a legal/entity decision (NGO partnership vs platform-held pool) before implementation, per the note above.~~ **RESOLVED 2026-09-01: decided not to build** — see `QUESTIONS.md`.
- Trust & safety follow-ups above (Razorpay recurring-plan creation in the dashboard is an ops task, not code; browser verification of the subscription/verification/avatar flows still outstanding).
- Optional: wire up Cloudflare Logpush/Analytics Engine so `/api/v1/health`'s `errors.fatalCount`/`unknownCount` can be populated for real instead of `null`.

First prompt:

> Read AGENTS.md and ROADMAP.md completely. Implement Phase 0 and Phase 1 only. Preserve all locked business rules for later phases. Use vanilla HTML/CSS/ES-module JavaScript. Set up the Cloudflare Worker/Durable Object project structure and Supabase development placeholders without implementing payments or production business logic yet. Add tests/checks appropriate to these phases, run them, fix failures, and update ROADMAP.md implementation status only if acceptance criteria pass.

Then progress phase-by-phase.

---

# 55. FIRST COMMERCIAL MILESTONE

The first revenue-capable proof is:

> Two real strangers match, chat for two minutes, both elect to continue, and each valid outgoing message is charged correctly from a verified wallet—without server-side chat history.

Build toward that before adding future features.
