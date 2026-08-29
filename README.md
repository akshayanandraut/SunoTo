# SunoTo

Mobile-first anonymous text chat for India. The project uses vanilla HTML, CSS and ES modules on the frontend, Cloudflare Workers/Durable Objects for realtime coordination, and Supabase Auth/Postgres for persistent account and business data.

## Local development

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and use development-safe values.
3. Run the frontend with `pnpm dev`.
4. In a second terminal, run the Worker with `pnpm worker:dev`.

The realtime socket is available at `/api/v1/chat/:sessionId/socket` on the Worker. It accepts two WebSockets, authenticates them through subprotocol credentials and supports temporary resume tokens. See `docs/WEBSOCKET_PROTOCOL.md` for the event contract.

Random matchmaking and ephemeral presence endpoints are documented in `docs/API.md`. Signed anonymous sessions and scoped abuse controls protect the public boundary.

Phase 5 adds server-owned session timing, idle and reconnect alarms, skip locking, server-derived early-skip exceptions and configurable repeated-skip cooldowns.

Phase 6 adds signed anonymous sessions, five qualifying trial connections, idempotent trial consumption, coarse shared-IP risk signals and exact internal activity counters. Configure `ANON_SESSION_SECRET` through Wrangler's secret store before running the Worker.

Phase 7 adds lazy-loaded Supabase email/password signup, sign-in, verification state, password recovery, RLS-protected profiles, atomic username changes and newest-device ownership. Apply the migration in `supabase/migrations` to a development Supabase project before live account testing.

Phase 8 adds an RLS-protected wallet and append-only ledger. All balance changes use a service-role-only PostgreSQL function that locks the wallet row, rejects overdrafts and deduplicates operations by idempotency key; the Account route shows the current balance and recent entries.

Phase 9 adds Razorpay Standard Checkout with server-created INR orders, a server-enforced ₹50 minimum, checkout and raw-webhook HMAC verification, captured/paid status checks, idempotent wallet credits and append-only refund reversals. Live keys and the webhook secret belong in Wrangler's secret store.

Phase 10 adds database-configured automatic offers and coupons. The seeded launch offer doubles Credits through 2026-09-30 23:59:59 IST; server-side quote and settlement functions enforce date, recharge, audience, combinability and redemption limits.

Phase 11 adds transactional daily access for post-trial paid matching. A trusted server service charges 200 Credits once per IST access day; activation at or after 10 PM includes the following calendar day. Verified email and a prior successful recharge are enforced in the database.

Phase 12 adds paid gender, age, language and common-interest matching. The server validates and prices requests, waits 30 seconds for an exact mutual human match, then permits a zero-fee random fallback. Preference fees for both users commit atomically and require separately verified accounts.

Phase 13 adds permission-gated radius matching for 5–100 km. Coordinates are requested only for radius searches, cached for about ten minutes, used temporarily during matchmaking, and never returned to peers. Geo searches use a 45-second timeout, 10% distance tolerance and coarse distance bands.

Phase 14 adds mutual paid continuation. Free expiry reserves the room for up to five minutes; after both verified participants accept, each delivered outgoing human message costs its sender 10 Credits. Event IDs make debits idempotent, insufficient balance opens a neutral recharge hold, and five message-idle minutes end the paid room.

Phase 15 adds fast browser and authoritative room contact guards for phone numbers, email, links, social handles and split/obfuscated attempts. Blocked messages are rejected before charging. Cross-session copy-paste signals use expiring message fingerprints rather than stored text.

Phase 16 adds mutual contact sharing. A request and peer acceptance debit 500 Credits from both wallets in one transaction, then suspend the contact guard for five minutes. A decline, insufficient wallet or failed pair debit leaves restrictions enabled and neither user partially charged.

Phase 17 adds one-per-chat likes, metadata-only reports, weighted risk with roughly 30-day decay, immediate rematch exclusion and registered cross-device blocks. Likes expose no public count; reports never store transcripts; blocks add no risk points and can be removed by their owner.

Phase 18 adds online-only reconnect requests for browser-local favourites. The target must accept while both identities remain online; only then is the verified initiator charged 50 Credits and given a fresh two-minute session. Offline, declined, expired and failed-payment requests create no queue and no charge.

Phase 19 adds a disabled-by-default, swappable ad provider boundary and the three locked tiers: free/zero-Credit users may see banners, desktop side placements and every-fifth-scan interstitials; registered users with 1–1,000 Credits never see interstitials; registered users above 1,000 Credits see no ads. A separately authorized super-admin can version and audit provider, placement and kill-switch changes.

Phase 20 adds disabled-by-default virtual fallback for cold starts. Humans always have priority; random searches wait at least 15 seconds and paid-preference searches wait their full timeout. Virtual matches are visibly marked, cost no preference or message Credits, end after the free two minutes, and use a replaceable mock/Workers AI provider. At match start they either wait or send one configurable short greeting, then remain silent until the human replies.

Phase 21 replaces the admin shell with a server-authorized operations portal for exact live room counts, accounts, wallets/ledgers, reports, restrictions, offers/coupons, ads, virtual configuration and audit history. The configured super-admin must use a verified Supabase session at AAL2/MFA. Wallet, moderation, promotion and configuration writes are versioned or idempotent, transactionally audited, and active restrictions immediately end affected rooms.

Phase 22 adds idempotent, content-free event aggregation by IST day. Server-owned match, virtual, delivered-message, trial, payment, contact, reconnect and safety outcomes feed exact admin aggregates without storing user IDs or message payloads. Public stats expose rounded-down real, virtual and message activity labels only; zero and small samples are stated plainly rather than inflated.

Phase 23 adds fail-closed production hardening: scoped Durable Object and room message rate limits, exact-origin CORS, CSP/HSTS and browser defenses, sanitized server errors, account data export/deletion requests, public grievance intake, and audited admin queues for grievance/deletion processing. Policy pages remain explicitly subject to counsel approval. `docs/PRODUCTION_RUNBOOK.md` defines custom SMTP, retention, recovery and incident gates; `pnpm production:validate` rejects placeholders, insecure origins, disabled admin MFA, and missing SMTP/legal evidence.

The frontend is connected to the authoritative API for signed anonymous sessions, matchmaking, realtime chat, account/wallet operations, payments, safety controls, paid preferences, virtual disclosure and favourite reconnect. Browser chat history and favourites remain local-only. Phase 24 is intentionally open until staging, live payment/refund, advertising-provider, load-test and launch evidence pass the documented gates.

## Checks

Use Node.js 22.12 or newer. Run `pnpm check` and `pnpm worker:build` for the full local gate. Run `pnpm production:validate` only with the intended production environment; it intentionally fails until all secrets, officer details, SMTP evidence and legal approval references are supplied.
