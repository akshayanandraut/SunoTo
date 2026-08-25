# Phase 24 launch checklist

Phase 24 stays incomplete until the external evidence below exists. Repository tests cannot substitute for staging, provider or community-launch evidence.

## Staging

- Deploy all Supabase migrations, the Worker and the static frontend to isolated staging projects.
- Set exact staging origins and staging/test provider keys. Keep production data and secrets out of staging.
- Run `STAGING_API_URL=https://.../api/v1 STAGING_WEB_ORIGIN=https://... RELEASE_REVISION=<full-sha> SMOKE_REPORT_PATH=<new-report.json> node scripts/staging-smoke.mjs` and attach the immutable report to the release record. The command refuses to overwrite an existing report.
- The smoke command prints the report SHA-256 after writing it. Record that value beside the immutable report reference; independently recheck it with `node scripts/fingerprint-launch-report.mjs <report.json> <full-sha> staging-smoke` before approval.
- Test two real browsers through match, reconnect, idle, report/block, virtual disclosure, data export and deletion request flows. Confirm no normal message text appears in logs or database queries.
- Record the two distinct browsers, a manual-flow evidence reference and timestamp, and explicit pass flags for match, one active identity, reconnect, idle, report/block, virtual disclosure, data export, deletion request and no transcript persistence.

## Payments

- Begin with Razorpay test mode. Complete a ₹50 recharge, checkout verification, signed webhook replay, duplicate event, failed capture and partial/full refund reconciliation.
- Reconcile provider order/payment/refund IDs against `payment_orders`, provider-event dedupe rows, wallet balance and the append-only ledger.
- After business/KYC activation and counsel-approved terms, perform one controlled live ₹50 payment and refund. Never paste keys or payment data into the release record; retain only provider references and reconciliation evidence.
- Record amount and refund as integer paise, currency, captured/processed confirmations, credited and reversed Credits, and duplicate-webhook outcome. The launch validator requires 5,000 paise INR, a full refund, equal credit/reversal quantities and confirmed idempotency.

## Advertising

- Select a provider only after policy/privacy review. Implement it behind `adProviderFor`; do not place provider secrets in browser configuration.
- Register the reviewed adapter through `registerAdProvider`. Adapter failures must remove their slot rather than break matching/chat UI. Update and review CSP domains before enabling it.
- Validate mobile layout, desktop side placement, every-fifth-scan interstitial, 1–1,000 Credit no-interstitial tier, above-1,000 Credit ad-free tier and global kill switch.
- Keep ads disabled if the provider, consent model or content categories are unresolved.
- Record policy, privacy, consent and CSP review; provider-failure fallback; mobile/desktop placement; all three Credit tiers; every-fifth-scan interstitial cadence; and the global kill switch. Every flag must be true before the launch evidence gate passes.

## Spike and soak

- Run `k6 run -e STAGING_API_URL=https://.../api/v1 load/staging-spike.js` from approved infrastructure. The default public-edge spike requires p95 <500 ms, p99 <1 s and <1% failures.
- Run `STAGING_API_URL=https://.../api/v1 STAGING_WEB_ORIGIN=https://... REALTIME_PAIRS=10 REALTIME_CONCURRENCY=2 RELEASE_REVISION=<full-sha> REALTIME_REPORT_PATH=<new-report.json> node load/staging-realtime.mjs` from approved distributed runners. It uses disposable signed identities and measures match, WebSocket upgrade, relay, reconnect and cleanup paths. Each runner is deliberately capped at 50 pairs and concurrency 10; respect production abuse limits instead of adding a hidden bypass. Successful runs refuse to overwrite an existing report.
- The realtime command prints the report SHA-256 after writing it. Record it in the load evidence and independently recheck it with `node scripts/fingerprint-launch-report.mjs <report.json> <full-sha> staging-realtime`.
- Confirm queues/active claims return to zero and no chat payload persisted. Record the test ID, revision, region mix, peak VUs, results and cleanup evidence.

## Launch and rollback

- Run the production configuration validator, full tests and both builds on the exact release commit. Record immutable frontend/Worker versions and database backup ID.
- Start with ads and virtual fallback disabled. Enable one provider at a time only after baseline health is stable.
- Prepare a truthful Reddit post: state 18+, text-only, India focus, virtual fallback disclosure, no fabricated member/activity count, and a direct feedback/grievance route. Obtain moderator approval where required; do not automate posting or vote manipulation.
- Define abort thresholds for 5xx, match failure, payment mismatch, safety backlog and latency. Roll back application versions, use kill switches, and use compensating ledger entries—never rewrite money history.

## Evidence required to check Phase 24

- Staging URL and smoke-test timestamp/commit.
- Two-browser manual-flow reference, browser list, timestamp and complete acceptance matrix.
- Immutable frontend/Worker versions, applied migration version, backup reference and restore-drill timestamp.
- Staging smoke report reference and SHA-256 fingerprint in addition to its URL and timestamp.
- Successful controlled live INR 50 payment and full-refund provider references, captured/processed state, equal credit/reversal quantities, duplicate-webhook confirmation and a ledger reconciliation reference.
- Approved ad provider, review reference and tier/kill-switch verification.
- Spike/soak report reference and SHA-256 fingerprint with cleanup evidence.
- Reddit post URL and moderation/feedback monitoring owner.

Validate the completed record against the exact release commit with `node scripts/validate-launch-evidence.mjs path/to/evidence.json <40-character-release-sha>`. The command fails if the record names another revision or uses missing/future completion timestamps.


Create a release-bound working record with `RELEASE_REVISION=<full-sha> EVIDENCE_PATH=<new-evidence.json> SMOKE_REPORT_PATH=<smoke.json> REALTIME_REPORT_PATH=<realtime.json> npm run launch:evidence:init`. The command requires the exact clean Git checkout, verifies both reports, writes their relative paths and fingerprints, and refuses to overwrite an existing draft.

The generated record intentionally keeps every external reference, approval and completion field as a placeholder. Fill those only from real evidence, then run `npm run launch:validate -- <evidence.json> <full-sha>`.
The evidence file must include local smoke and realtime report paths relative to the evidence JSON. The validator opens both files, verifies their kind and release revision, recomputes their SHA-256 fingerprints, and fails if either artifact was replaced.
