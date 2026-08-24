# Phase 24 launch checklist

Phase 24 stays incomplete until the external evidence below exists. Repository tests cannot substitute for staging, provider or community-launch evidence.

## Staging

- Deploy all Supabase migrations, the Worker and the static frontend to isolated staging projects.
- Set exact staging origins and staging/test provider keys. Keep production data and secrets out of staging.
- Run `STAGING_API_URL=https://.../api/v1 STAGING_WEB_ORIGIN=https://... node scripts/staging-smoke.mjs` and attach its output to the release record.
- Test two real browsers through match, reconnect, idle, report/block, virtual disclosure, data export and deletion request flows. Confirm no normal message text appears in logs or database queries.

## Payments

- Begin with Razorpay test mode. Complete a ₹50 recharge, checkout verification, signed webhook replay, duplicate event, failed capture and partial/full refund reconciliation.
- Reconcile provider order/payment/refund IDs against `payment_orders`, provider-event dedupe rows, wallet balance and the append-only ledger.
- After business/KYC activation and counsel-approved terms, perform one controlled live ₹50 payment and refund. Never paste keys or payment data into the release record; retain only provider references and reconciliation evidence.

## Advertising

- Select a provider only after policy/privacy review. Implement it behind `adProviderFor`; do not place provider secrets in browser configuration.
- Register the reviewed adapter through `registerAdProvider`. Adapter failures must remove their slot rather than break matching/chat UI. Update and review CSP domains before enabling it.
- Validate mobile layout, desktop side placement, every-fifth-scan interstitial, 1–1,000 Credit no-interstitial tier, above-1,000 Credit ad-free tier and global kill switch.
- Keep ads disabled if the provider, consent model or content categories are unresolved.

## Spike and soak

- Run `k6 run -e STAGING_API_URL=https://.../api/v1 load/staging-spike.js` from approved infrastructure. The default public-edge spike requires p95 <500 ms, p99 <1 s and <1% failures.
- Add a distributed realtime scenario using disposable identities. Respect the production abuse limits rather than adding a hidden bypass. Measure match latency, WebSocket upgrade success, relay latency, Durable Object errors, reconnects and cleanup after the test.
- Confirm queues/active claims return to zero and no chat payload persisted. Record the test ID, revision, region mix, peak VUs, results and cleanup evidence.

## Launch and rollback

- Run the production configuration validator, full tests and both builds on the exact release commit. Record immutable frontend/Worker versions and database backup ID.
- Start with ads and virtual fallback disabled. Enable one provider at a time only after baseline health is stable.
- Prepare a truthful Reddit post: state 18+, text-only, India focus, virtual fallback disclosure, no fabricated member/activity count, and a direct feedback/grievance route. Obtain moderator approval where required; do not automate posting or vote manipulation.
- Define abort thresholds for 5xx, match failure, payment mismatch, safety backlog and latency. Roll back application versions, use kill switches, and use compensating ledger entries—never rewrite money history.

## Evidence required to check Phase 24

- Staging URL and smoke-test timestamp/commit.
- Successful controlled live payment and refund provider references with ledger reconciliation.
- Approved ad provider and tier/kill-switch verification.
- Spike/soak report with cleanup evidence.
- Reddit post URL and moderation/feedback monitoring owner.
