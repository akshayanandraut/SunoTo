# Production runbook

This is an operational checklist, not legal advice. Do not launch until every required item has an owner, evidence and rollback path.

## Release gates

- Use Node.js 22.12 or newer, install from the lockfile, and run `node --test`, the frontend build, and the Worker build from a clean `main` checkout.
- Apply every migration in `supabase/migrations` to staging first. Record the migration version and backup identifier.
- Keep virtual fallback and ads disabled until their providers pass staging review. Never replace truthful activity counts with marketing numbers.
- Confirm that normal chat text is absent from Postgres, analytics, Worker logs and Durable Object state after a room ends.

## Supabase Auth and SMTP

Configure a dedicated sending domain through Supabase Auth custom SMTP. Store the SMTP password only in the Supabase dashboard or secret manager. Publish SPF and DKIM records supplied by the provider and a DMARC policy with reporting; validate alignment before increasing volume.

Set a recognisable sender name and reply-to inbox. Customize verification, password-reset and security-change templates without inserting access tokens into analytics links. In staging, complete these tests on at least two major mailbox providers:

1. Sign up, receive the verification message, and verify that the link returns only to the allowed production/staging origin.
2. Request a reset, use the link once, and confirm replay/expiry behavior.
3. Confirm SPF, DKIM and DMARC pass in the received headers and that the message is not classified as spam.
4. Exercise resend/rate-limit behavior without creating an email enumeration signal.

Monitor delivery, bounce and complaint rates. Suspend sends and investigate if the provider or mailbox ecosystem reports abnormal complaints.

## Secrets and environment

Set Worker secrets with `wrangler secret put`; never commit values. Required production values are `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ANON_SESSION_SECRET`, `ADMIN_USER_ID`, `ALLOWED_ORIGIN`, `GRIEVANCE_OFFICER_NAME` and `GRIEVANCE_EMAIL`. Keep `ADMIN_REQUIRE_AAL2=true`.

`ALLOWED_ORIGIN` must be the exact HTTPS frontend origin. The anonymous signing secret must contain at least 32 cryptographically random bytes. Configure Cloudflare access/log retention to avoid request bodies and sensitive headers.

## Data rights, retention and grievances

- Test account export and deletion requests with an ordinary verified account.
- A pending deletion immediately prevents new searches and ends active claims. Operations must process the queue, remove data that is no longer necessary, and retain only records required for payments, fraud, accounting or law. Record the legal basis and retention deadline for exceptions.
- Run `public.cleanup_operational_retention()` on a scheduled privileged job and alert on failure. It removes analytics idempotency keys after 35 days and resolved/rejected grievances after three years.
- Publish the actual grievance officer name and monitored email. Test the public form and reference ID. Target acknowledgement within 24 hours and resolution within 15 days, while routing categories with faster legal requirements immediately.
- Maintain an incident route for urgent child safety, credible threats and unlawful content; the general grievance SLA is not an excuse to delay emergency action.

Counsel must review the privacy notice, terms, community rules, data-processing vendors, retention schedule and user-rights workflow against the [Digital Personal Data Protection Act, 2023](https://www.indiacode.nic.in/handle/123456789/22037?col=123456789%2F1362&view_type=search), [Digital Personal Data Protection Rules, 2025](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025.pdf), and the [MeitY IT Rules page](https://www.meity.gov.in/documents/act-and-policies/information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021-it-rules-2021-IjM5QjMtQWa), including current amendments/corrigenda.

## Security and recovery

- Confirm TLS/HSTS, CSP, origin rejection, admin AAL2, webhook signature rejection and all rate limits in staging.
- Configure Supabase point-in-time recovery or scheduled backups and perform a restore drill. A backup is not accepted until restore time and reconciliation are measured.
- Alert on Worker 5xx rate, Durable Object failures, payment webhook failures, wallet conflicts, grievance backlog and SMTP delivery failures. Logs must contain request/event references, not message bodies, tokens or payment secrets.
- Rotate a suspected secret immediately, invalidate sessions where relevant, disable affected providers through the kill switch, reconcile payment/ledger state, and preserve only necessary incident evidence.

## Rollback

Deploy immutable frontend and Worker versions. On regression, disable ads/virtual providers first, roll the Worker back to the last verified version, and keep database migrations forward-compatible. Never reverse a money ledger row; apply a compensating idempotent entry.
