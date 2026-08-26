# HTTP API v1

## Anonymous session

`POST /api/v1/anonymous/session` accepts the browser's opaque anonymous ID and local secret. It returns a short-lived signed bearer token, remaining trial connections and a coarse risk level. The raw local secret and raw IP are not stored. Matchmaking, presence and WebSocket routes require this token.

## Matchmaking

- `POST /api/v1/match/search` with optional `profile`, `preferences`, browser-local `blockedPeerIds` fields and an optional `mode` (`"text"` default or `"video"`)
- `GET /api/v1/match/result`
- `POST /api/v1/match/cancel`
- `POST /api/v1/match/end` with `{ "sessionId": "opaque-session" }`
- `POST /api/v1/presence/heartbeat` with `{ "status": "online|waiting|chatting" }`

The first eligible person waits. The next eligible person receives a shared session ID; the waiting person obtains the same result by polling. Active claims prevent either identity from joining another random chat until the session ends.

The server derives `identityId` from the signed bearer token and ignores client identity claims. WebSockets send protocols `random-chat.v1` and `rc-auth.<token>` because browser WebSocket APIs cannot set an Authorization header. The Worker verifies the credential, strips it, and forwards only the non-secret protocol marker to the session object; signed tokens never enter URL logs.

Paid preference searches may include validated `profile` and `preferences` fields and must send the Supabase bearer credential in `X-Account-Authorization`. Exact gender/age/language/common-interest matches return the server-computed fee. After 30 seconds a random fallback returns `preferenceFee: 0`.

A radius preference accepts only 5, 10, 25, 50 or 100 km and requires gender plus a complete age range. Radius matching uses a 45-second preference timeout and 10% tolerance. Successful geo results may include `approximateDistance`; exact coordinates are never returned.

A connection consumes one trial for both participants after the first valid delivered message or 30 connected seconds. The ledger key is unique per session and identity, so duplicate events and reconnects do not consume twice. Exact activity counters are internal and are not exposed as fabricated public counts.

## Registered accounts

- `GET /api/v1/me/profile` validates the Supabase bearer token and returns the caller's RLS-protected profile.
- `POST /api/v1/username` invokes the atomic database username function; verified email is required.
- `POST /api/v1/account/device/claim` makes the current device the newest account owner and reports the previous device when ownership moved.

## Wallet

- `GET /api/v1/wallet` returns the caller's integer-credit balance and version.
- `GET /api/v1/wallet/ledger` returns up to 50 recent append-only ledger entries.

Wallet mutation is intentionally absent from the public API. Trusted Worker services invoke the service-role-only `apply_wallet_entry` database function with a unique idempotency key.

## Payments

- `POST /api/v1/payments/orders` accepts `{ "amountPaise": 5000, "couponCode": "optional" }` for a verified account and returns a server-created Razorpay order plus the server-resolved Credits and active offer. The minimum is ₹50.
- `POST /api/v1/payments/verify` accepts the three Razorpay Checkout result fields, verifies their HMAC, fetches provider status and credits only a captured payment belonging to the caller's paid order.
- `POST /api/v1/payments/webhook` accepts Razorpay events. It authenticates `X-Razorpay-Signature` against the raw body and deduplicates `X-Razorpay-Event-Id`.

`payment.captured` and `order.paid` reconcile the same wallet-credit idempotency key. `refund.processed` appends a proportional credit reversal rather than changing ledger history.

## Favourite reconnect

- `POST /api/v1/reconnect/request` accepts `{ "targetPeerId": "opaque-id" }` with both the anonymous bearer token and a verified account token in `X-Account-Authorization`.
- `POST /api/v1/reconnect/cancel` cancels the caller's pending outgoing request without a charge.
- `GET /api/v1/reconnect/request` polls for an incoming request addressed to the anonymous identity.
- `POST /api/v1/reconnect/respond` accepts `{ "requestId": "opaque-id", "accepted": true|false }`.

Requests are temporary and online-only. Decline, expiry or either identity going offline costs zero. Acceptance atomically charges the initiator 50 Credits before returning a fresh session ID; a failed debit rolls back the match.

## Configuration and ads

- `GET /api/v1/config/public` returns non-secret ad provider, placement, tier threshold and kill-switch configuration. Failure returns the safe disabled default.
- `GET /api/v1/admin/ads` returns versioned ad configuration to the configured super-admin.
- `PUT /api/v1/admin/ads` accepts `{ "expectedVersion": 1, "config": { ... } }`; stale versions are rejected and successful changes are audited atomically.

Admin access requires a verified Supabase session whose user ID exactly matches the Worker's secret `ADMIN_USER_ID`. Frontend visibility is never treated as authorization.

Admin operations additionally require an AAL2/MFA Supabase access token unless `ADMIN_REQUIRE_AAL2=false` is explicitly set for isolated local development. Available server-authorized routes include:

- `GET /api/v1/admin/dashboard`, `/users`, `/users/:id/ledger`, `/reports`, `/restrictions`, `/offers`, `/coupons`, and `/audit`.
- `POST /api/v1/admin/wallet` for an integer ledger adjustment with reason and operation ID.
- `POST /api/v1/admin/restrictions` for restrict, ban, or clear with a required reason.
- `POST /api/v1/admin/promotions` for validated offer/coupon creation or updates.
- `GET|PUT /api/v1/admin/ads` and `/virtual` for versioned configuration.

Admin wallet operations are idempotent and never update balances directly. Restriction, promotion, wallet and configuration changes write an audit row transactionally.

## Virtual fallback

When enabled in server configuration, `GET /api/v1/match/result` may return `virtual: true`, `matchMode: "virtual_fallback"`, a public virtual profile and `preferenceFee: 0`. Random searches remain human-only for at least 15 seconds; paid preference/radius searches remain human-only for their full 30/45-second timeout. Virtual provider configuration and persona prompts are not exposed by the public API.

## Analytics and truthful public counts

- `POST /api/v1/analytics/event` accepts only a small client allowlist (`landing_view`, `onboarding_completed`, `signup_started`, `return_visit`) with an opaque event ID. It accepts no metadata or chat content.
- `GET /api/v1/stats/public` returns rounded-down labels for real connections, virtual connections and delivered messages today, with an `approximate: true` marker and source timestamp.

Money, match, session, reconnect, safety and virtual events are recorded only by trusted Worker flows. Admin dashboard analytics remain exact and keep real/virtual dimensions separate.

## Privacy and compliance

- `GET /api/v1/me/export` returns the authenticated account's server-held profile, wallet, ledger, payment, block and deletion-request data. It explicitly excludes browser-only chat history.
- `DELETE /api/v1/me/account` requires `{ "confirm": "DELETE", "reason": "optional" }`, ends active claims and creates or returns an idempotent pending deletion request. Pending/processing accounts cannot start a new search.
- `GET /api/v1/compliance/public` exposes the configured grievance officer and operational response targets without secrets.
- `POST /api/v1/grievances` accepts a validated email, category and 20–2,000 character description. It returns a reference ID and is rate-limited.
- Admin-only `GET /api/v1/admin/grievances` and `POST /api/v1/admin/grievances/:id` operate the audited grievance queue.
- Admin-only `GET /api/v1/admin/deletions` and `POST /api/v1/admin/deletions/:id` operate a locked, audited deletion queue. A transition requires a substantive processing note; completion must only be recorded after the runbook process is actually performed.
- `POST /api/v1/feedback` accepts a 10–2,000 character suggestion, optionally linked to the caller's account if a bearer token is supplied. It returns a reference ID and is rate-limited.
- Admin-only `GET /api/v1/admin/feedback` and `POST /api/v1/admin/feedback/:id` operate the audited feedback queue.

## Real-user video beta

Video chat is a separate matching mode from text chat, mirroring Omegle's distinct "Text chat" and "Video chat" entry points: a searcher picks `mode: "video"` up front in `POST /api/v1/match/search`, and the matchmaking pool is partitioned by mode at the lowest eligibility-check level (`isEligibleRandomPair`), so a text-mode seeker can never be paired with a video-mode seeker or vice versa.

Video mode is a limited beta, gated by the `video` server config (`enabled` + a `betaUserIds` allowlist of Supabase Auth UUIDs, managed only through `GET/PUT /api/v1/admin/video`). Eligibility is enforced at search time — a `mode: "video"` request is rejected with `video_beta_not_available` (403) unless the caller is a verified account on the allowlist — before the seeker is ever queued. A queued video-mode seeker also never receives a virtual/bot fallback match, regardless of wait time.

The matched `mode` propagates from the matchmaking claim through `/authorize-session` into the `ChatSession` Durable Object. Video-eligibility (both participants real, authenticated, allow-listed) is only computed for sessions whose `mode` is `"video"`; a random text-mode match between two beta users never surfaces video signaling. Eligible sessions receive a per-participant `VIDEO_ELIGIBLE` WebSocket event carrying a deterministic `initiator` flag so exactly one side starts the WebRTC offer automatically. Call setup then flows entirely peer-to-peer over WebRTC, with the Durable Object relaying only `VIDEO_OFFER`, `VIDEO_ANSWER`, `VIDEO_ICE_CANDIDATE` and `VIDEO_END` signaling messages on the existing chat socket.

API responses use exact-origin CORS and private routes default to `Cache-Control: no-store`. Unknown browser origins are rejected. WebSocket upgrades preserve their native response rather than being reconstructed by the HTTP header wrapper.
