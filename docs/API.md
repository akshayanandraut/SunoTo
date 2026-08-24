# HTTP API v1

## Anonymous session

`POST /api/v1/anonymous/session` accepts the browser's opaque anonymous ID and local secret. It returns a short-lived signed bearer token, remaining trial connections and a coarse risk level. The raw local secret and raw IP are not stored. Matchmaking, presence and WebSocket routes require this token.

## Matchmaking

- `POST /api/v1/match/search` with `{ "identityId": "opaque-id", "blockedPeerIds": [] }`
- `GET /api/v1/match/result`
- `POST /api/v1/match/cancel` with `{ "identityId": "opaque-id" }`
- `POST /api/v1/match/end` with `{ "identityId": "opaque-id", "sessionId": "opaque-session" }`
- `POST /api/v1/presence/heartbeat` with `{ "identityId": "opaque-id", "status": "online|waiting|chatting" }`

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
- `GET /api/v1/reconnect/request` polls for an incoming request addressed to the anonymous identity.
- `POST /api/v1/reconnect/respond` accepts `{ "requestId": "opaque-id", "accepted": true|false }`.

Requests are temporary and online-only. Decline, expiry or either identity going offline costs zero. Acceptance atomically charges the initiator 50 Credits before returning a fresh session ID; a failed debit rolls back the match.

## Configuration and ads

- `GET /api/v1/config/public` returns non-secret ad provider, placement, tier threshold and kill-switch configuration. Failure returns the safe disabled default.
- `GET /api/v1/admin/ads` returns versioned ad configuration to the configured super-admin.
- `PUT /api/v1/admin/ads` accepts `{ "expectedVersion": 1, "config": { ... } }`; stale versions are rejected and successful changes are audited atomically.

Admin access requires a verified Supabase session whose user ID exactly matches the Worker's secret `ADMIN_USER_ID`. Frontend visibility is never treated as authorization.
