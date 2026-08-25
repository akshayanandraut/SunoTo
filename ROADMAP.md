# Random Chat India — Codex-Ready Product & Engineering Roadmap

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
- [x] immutable staging smoke and realtime reports bound to a full release SHA and SHA-256 content fingerprints
- [x] Worker health and frontend manifest revision verification
- [x] revision-bound Worker and Cloudflare Pages deploy wrappers
- [x] clean tracked Git checkout verification before either deployment
- [x] Phase 24 evidence schema and fail-closed validator

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

# 49. COMING SOON / NOT MVP

Coming Soon UI:

- free-text interests
- video chat
- random video
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

First prompt:

> Read AGENTS.md and ROADMAP.md completely. Implement Phase 0 and Phase 1 only. Preserve all locked business rules for later phases. Use vanilla HTML/CSS/ES-module JavaScript. Set up the Cloudflare Worker/Durable Object project structure and Supabase development placeholders without implementing payments or production business logic yet. Add tests/checks appropriate to these phases, run them, fix failures, and update ROADMAP.md implementation status only if acceptance criteria pass.

Then progress phase-by-phase.

---

# 55. FIRST COMMERCIAL MILESTONE

The first revenue-capable proof is:

> Two real strangers match, chat for two minutes, both elect to continue, and each valid outgoing message is charged correctly from a verified wallet—without server-side chat history.

Build toward that before adding future features.
