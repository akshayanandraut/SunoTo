# Grasany ID / OIDC integration contract

## Source of truth

- Central integration packet: `C:\grasany\grasany\docs\product-integrations\sunoto.json`, schemaVersion 2, regenerated from the Grasany registry and OIDC contract.
- Final central contract commit: `8d6f18a9000eb736a11ecc789a097cab7bc0f7d9` (on packet fix `33c720d`). It supersedes earlier refresh-contract revision `49ed4e0af558cd9d6ecc8be1608285a2f5a0c866`.
- Packet `oidc.session.refresh.requestedScopes` and `requiredScopes` are exactly `openid`, `email`, and `profile`; `phone` is provider-supported but intentionally excluded, and `offlineAccessScope` says not to request `offline_access`.
- Provider refresh documentation cited by the packet: https://supabase.com/docs/guides/auth/oauth-server/oauth-flows

## Implemented locally

- The authorization request asks for exactly the packet's three scopes and omits `offline_access`.
- `worker/src/auth/grasanyOidc.js` contains validated discovery/JWKS and JWT claim/signature logic, PKCE transaction helpers, AES-GCM token-envelope helpers, exact same-origin return paths, and the packet-derived readiness gate. `worker/src/services/grasanyOidcTokenContract.js` validates initial responses. Refresh form construction uses `grant_type=refresh_token`, `refresh_token`, and `client_id`; it does not add a scope parameter.
- A successful refresh requires a new access token, bearer token type, and positive expiry; a non-empty replacement refresh token is atomically stored, otherwise the prior token is retained. Failure/partial responses destroy the local session and must not retry that refresh token.
- `worker/src/durable/IdentitySessionShard.js` and `worker/src/auth/identityStore.js` persist one-use transactions and opaque sessions in SQLite-backed Durable Objects. OAuth token sets are AES-GCM encrypted before persistence, and provider refreshes use a durable single-use lock to avoid retrying a token after an interrupted rotation.
- Regression fixtures live in `test/fixtures/identity/`; tests are authored but intentionally not run per the current work instruction.
- The final packet requires non-null refresh/token contracts and retains `liveFlowVerified: false`; central conformance command is `node scripts/oidc-conformance.mjs` in the central repository, not an invented SunoTo npm script.
- Browser account code uses only the Worker-owned same-origin session cookie and its CSRF token. It does not initialize Supabase Auth, conduct the authorization-code exchange, retain central access/refresh tokens, or send identity bearer tokens to product HTTP/realtime clients.

## Not implemented or verified

OIDC is disabled in the packet; client ID, registered origin/callback, and revocation endpoint are unprovisioned/null. Login/callback/session reload/refresh/logout/revocation acceptance flags are false, and `liveFlowVerified` is false. Supabase product account mapping/membership storage and RLS activation remain disabled. Identity status is visible at `/api/v1/identity/status`; protected account routes return `503 identity_service_not_configured`. Invalid-grant details and refresh-token reuse/grace behavior need live acceptance. Do not enable or deploy SSO until those gates pass. API JWTs are rejected by the Worker boundary.
