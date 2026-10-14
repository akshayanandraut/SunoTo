# SunoTo central provisioning handoff

Product: `sunoto`. Origin: `https://sunoto.grasany.com`. Product database: `mybjgljylmcweeprhhlw`. Central identity authenticates only; product account mapping, operator roles, wallet, membership and entitlements remain SunoTo-local. Do not match identities by email or forward browser Supabase tokens.

## Identity minimum

- Register exact OIDC redirect: `https://sunoto.grasany.com/auth/callback`; no wildcard or radio-domain callback. Login entry is `GET /api/v1/auth/grasany/start`; session read is `GET /api/v1/auth/session`; local logout is same-origin CSRF-protected `POST /api/v1/auth/logout`.
- Return a secret-free versioned packet with issuer, discovery URL, authorization/token/JWKS endpoints, client ID, exact callbacks, scopes `openid email profile`, supported RS256/ES256 ID-token signing, PKCE S256, initial refresh-token issuance and rotation behavior. If central uses a different handoff protocol, return that explicit contract rather than enabling this OIDC adapter.
- Supply the revocation endpoint/behavior and separately verified central-admin claim only if provisioned. Central login alone must not confer product operator authority.
- Current Worker configuration names: `GRASANY_OIDC_ISSUER`, `GRASANY_OIDC_CLIENT_ID`, `GRASANY_OIDC_REDIRECT_URI`; locally generated server-only 32-byte base64url key `GRASANY_OIDC_TOKEN_ENCRYPTION_KEY`. Session Durable Object is already bound. Provision secrets through the platform store, never chat or Git.
- Activation requires actual login, callback, session reload, refresh and logout acceptance plus the product account adapter. The old disabled packet is not approval.

## Support minimum

Confirm SunoTo support sender/reply identity, allowed templates, notification service base URL, scoped app HMAC credential provisioning, queue/status contract and actual transport acceptance. Existing signer targets `POST /api/notifications/v1/requests` and `GET /api/notifications/v1/status?notification_id=<uuid>`, app ID `sunoto`, headers `x-grasany-app-id`, `x-grasany-timestamp`, `x-grasany-signature`; canonical HMAC input is timestamp-ms, method, pathname and raw body separated by newlines. Confirm this exact contract before activation. Queued/accepted is not delivered.

## Payments minimum

Return product/business-line-scoped merchant approval evidence, provider/MID reference, central service endpoint and versioned order/verification/refund/webhook contract, scoped secret provisioning, currency/minor-unit rules and idempotency behavior. Secrets stay server-side. SunoTo uses credits, memberships and chat services; any games/stakes require separately confirmed permitted scope. Do not infer suitability from an existing Akshari ecommerce MID or a generally active Razorpay account. If an existing Social MID is unsuitable, return the precise provider restriction and required owner action. Keep payments closed until approved configuration and controlled live acceptance exist.

## Concrete external blockers

1. Central identity registration/protocol and support provisioning; SunoTo account adapter/acceptance then follows locally.
2. Product-scoped payment approval/service contract and safe credential delivery, owned by Grasany.
3. Owner-enabled Cloudflare R2 plus per-track commercial redistribution rights evidence; never accept billing consent or invent a catalogue licence.
4. Central StatusNerve scheduler registration for the existing protected `POST https://sunoto.grasany.com/api/internal/heartbeat` with the isolated product HMAC key, transferred only through a secret store.

Automated suites remain deferred by owner instruction. Completed source, pushed commits, deployed revision and live acceptance are recorded separately in the roadmap/release evidence.
