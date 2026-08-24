# Architecture baseline

- `web/`: static mobile-first HTML/CSS/ES-module frontend for Cloudflare Pages.
- `worker/`: Cloudflare Worker API and future Durable Objects for realtime coordination.
- `supabase/`: future PostgreSQL migrations, RLS policies and local seed data.
- `test/`: cross-cutting tests.

The browser is never authoritative for money, entitlements, reports, bans or payment success. Normal chat messages must not be permanently stored server-side.

Phase 3 adds a hibernation-compatible `ChatSession` Durable Object. It persists only opaque reconnect metadata; message bodies pass directly between attached sockets and are not written to storage.

Phase 4 adds a durable matchmaking shard for waiting queues, match results and one-active-chat claims. Random eligibility lives in a replaceable policy module. Presence is intentionally held in ephemeral Durable Object memory so heartbeats do not create persistent writes; exact counts remain internal.

Phase 5 moves session timing, skip eligibility, idle state and reconnect expiry into configurable server policies. Durable Object alarms drive transitions across hibernation. Skip-frequency state is stored by opaque identity in the matchmaking shard; client-provided early-skip reasons are ignored.

Phase 6 introduces a keyed anonymous-identity ledger. Browser IDs are bound to a local-secret fingerprint and authorized with short-lived HMAC tokens. Only keyed coarse IP-prefix fingerprints are retained for short-window risk signals. Trial consumption is atomic and idempotent per identity/session; normal message content remains absent from the ledger.

Phase 7 uses Supabase Auth for persistent email/password accounts. The browser receives only the publishable key; the Worker validates account access tokens with Supabase before proxying profile and username operations. PostgreSQL RLS restricts profile/history reads to `auth.uid()`, while a locked-row database function enforces verified email, case-insensitive username uniqueness, cooldown and lifetime limits. The auth client is lazy-loaded only on the Account route.

Phase 8 stores integer-credit balances in `wallets` and every mutation in the append-only `wallet_ledger`. A service-role-only database function serializes changes with a row lock, checks non-negative results and treats the idempotency key as the operation identity. Browser-facing reads remain RLS-scoped to the authenticated user; no browser endpoint can mutate balances.

Phase 9 creates Razorpay orders only in the Worker and stores the server-selected paise and credit amounts. Checkout success is authenticated with HMAC and then checked against Razorpay's captured payment and paid order state. Webhooks are authenticated against their unmodified request bytes and deduplicated by provider event ID; database functions atomically join payment state changes to wallet credits or refund reversals.

Phase 10 resolves recharge offers inside PostgreSQL from dated configuration. Payment orders retain the resolved offer, coupon and immutable credit quantity. Coupon rows are locked while final redemption limits are checked, and the redemption and wallet credit share one transaction.

Phase 11 represents daily paid access as an explicit entitlement period. Its service-role-only function serializes activations per account, requires verified email and a prior payment credit, debits the wallet through the common ledger function, and calculates midnight/10 PM grace boundaries in `Asia/Kolkata`. Free-trial flows never call this paid-access service.

Phase 12 keeps preference pricing and satisfaction in a replaceable policy. Matchmaking waits for mutually compatible real profiles before using random fallback, and fallback results always carry a zero fee. Paid filters require a verified Supabase account alongside the anonymous match token. A single PostgreSQL transaction locks and debits both qualifying wallets so partial charging cannot occur.

Phase 13 extends that policy with short-lived coordinates. The browser requests geolocation only for an explicit radius filter and refreshes its session cache after ten minutes. Queue state drops coordinates when a match leaves the queue, exact coordinates never enter results or wallet metadata, and only a coarse distance band may be displayed.

Phase 14 binds account payer IDs to server-owned matchmaking claims and carries them into temporary room state. Free expiry becomes a bounded continuation hold. Mutual acceptance activates paid mode; every valid event ID maps to one sender wallet debit before relay, while unavailable peers, duplicates and insufficient funds do not create additional charges. Message bodies remain absent from storage.

Phase 15 places contact and spam checks before the payment stage. The room keeps only capped contact-shaped detector fragments and deletes them when it ends. Repeated cross-session content is represented by a truncated SHA-256 fingerprint with a ten-minute lifetime in the anonymous risk ledger; raw normal messages remain relay-only.

Phase 16 keeps contact sharing inside temporary room state. Both verified account IDs come from server matchmaking claims, and a service-role PostgreSQL function locks both wallets before applying two idempotent 500-Credit debits. Only then does the room disable its contact guard for five minutes; the normal safety and paid-message pipeline remains active.

Phase 17 stores only safety/reputation metadata: one like key per session and actor, report reason/weight and identity references, decaying aggregate risk, and account-owned block references. Report/block closes active claims and places the pair on a temporary server avoid list. Matching also loads the signed-in account's persistent blocks; browser favourites remain unrelated and local-only.

Phase 18 keeps favourites and display names in browser IndexedDB while sending only an opaque peer ID in a temporary reconnect request. Presence is checked both when requesting and accepting. Match activation is rolled back if the initiator's idempotent 50-Credit debit fails; a successful acceptance creates an ordinary fresh session so the server-owned two-minute timer and continuation rules apply unchanged.

Phase 19 isolates tier selection in `AdPolicy` and rendering behind a browser provider registry. Public configuration exposes no provider secret and fails closed to ads disabled. The configuration service caches versioned reads briefly; only the verified Supabase user matching the Worker `ADMIN_USER_ID` may update ads. PostgreSQL locks the config row, rejects stale versions and writes the config change plus admin audit in one transaction.

Phase 20 lets the matchmaking shard create a virtual claim only after rechecking the real queue and the configured fallback delay. Persona/config metadata is temporary room state; the match result and `READY` event carry an explicit virtual marker. The shared provider sees only the latest human message, replies without a stored transcript, and cannot initiate beyond one configured short greeting. Virtual rooms bypass all wallet services and end at free expiry instead of offering paid continuation.

Phase 21 uses a single configured super-admin identity plus a validated Supabase AAL2 claim; the browser never receives the service role. Exact transient counts come directly from Presence and Matchmaking Durable Objects, while persistent operational summaries and lists come from service-role database functions. Money, restriction, promotion and config mutations lock their authoritative rows and append `admin_audit` in the same transaction. A restriction removes queue/active claims and sends a server-side termination to every affected room.
