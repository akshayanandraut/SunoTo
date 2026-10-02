# SunoTo database heartbeat activation

The source contract is `C:\grasany\grasany\docs\HEARTBEAT-CONTRACT.md` (v1). This implementation is product-local and reports only SunoTo's dedicated Supabase database connectivity. A successful probe does not promise to prevent an inactivity pause or restore a paused database.

## Request boundary

StatusNerve's server calls `POST /api/internal/heartbeat` with the exact JSON body `{"probeId":"<uuid>"}` and these headers: `x-grasany-product: sunoto`, `x-grasany-timestamp` (Unix milliseconds), `x-grasany-nonce` (UUID), and `x-grasany-signature` (lowercase HMAC-SHA256 hex). The signed UTF-8 text is `v1\nsunoto\nPOST\n/api/internal/heartbeat\n<timestamp>\n<nonce>\n<SHA256 hex of exact raw body bytes>`. The secret is a random SunoTo-only Worker secret named `STATUSNERVE_HEARTBEAT_KEY`. No browser token, admin JWT, database key, or cross-product secret is accepted.

The Worker rejects incorrect method/path/query, unknown JSON fields, bodies over 1024 bytes, invalid HMAC, stale timestamps beyond 300 seconds, and replayed nonces. The SQLite `HEARTBEAT_GUARD` Durable Object keeps only bounded nonce identifiers and expiries, admits one authenticated probe per 60 seconds, and rejects concurrent/replayed attempts before Postgres access. The Worker response includes only v1 product/probe IDs, overall and stage statuses, UTC check time, and duration. Unauthenticated requests receive a generic denial.

## Database boundary

The reviewed Git migration `supabase/migrations/20261002171218_sunoto_heartbeat_probe.sql` creates private `grasany_ops.heartbeat` with a `product_id = 'sunoto'` constraint, RLS, and no browser-role table or RPC access. The server-role-only `public.sunoto_heartbeat_probe` RPC is `SECURITY INVOKER`. It takes a product advisory transaction lock, handles an absent first row, reads the counter, writes only the fixed row, reads it back, and verifies both the probe ID and incremented counter before reporting success. A duplicate probe ID does not write again. Function lock/statement timeouts and a five-second Worker fetch timeout bound the operation. SQL errors never reach the response.

## Activation gate

1. Verify the exact dedicated SunoTo Supabase project and review the migration and grants. Apply through the normal Git migration pipeline, then verify migration history, RLS, `anon`/`authenticated` denial, server-role RPC access, and the single-row constraint. Do not run it against another product project.
2. Configure `STATUSNERVE_HEARTBEAT_KEY` as a Worker secret, independently from every other product; configure the existing server-only Supabase URL and service role key. Set `HEARTBEAT_DB_ENABLED=1` only after the migration and privilege checks succeed.
3. Register the exact HTTPS SunoTo origin and matching per-product HMAC key in StatusNerve's server-side registry. StatusNerve must authorize its own admin, use no redirects, bound request timeout/concurrency, and display attempt, success, stage, latency and freshness separately.
4. Run the authored local failure-path tests and a controlled staging probe before production. The current code-only instruction deferred running tests. A production probe and response are not yet verified.
