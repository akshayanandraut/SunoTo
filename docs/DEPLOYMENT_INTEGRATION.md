# Deployment integration

SunoTo uses two deployment boundaries:

- Grasany ID is the only account identity provider. Supabase/Postgres is product-local persistence for account mapping, roles, memberships, consent, wallet and entitlement data; it must not become an alternate login provider. Apply the ordered files in `supabase/migrations/` only after the dedicated target project is verified. Those migrations enable RLS and keep privileged product operations behind server-side RPCs.
- Cloudflare Pages serves the static Vite frontend from `main`; Cloudflare Workers + Durable Objects remain the realtime/API layer. Configure public frontend values in Pages: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`. Configure Worker secrets with `wrangler secret put`; never put service-role, payment, or anonymous-session secrets in Pages.

## One-time dashboard setup

1. Verify the dedicated Supabase project, create the reviewed identity-link migration from `docs/identity-supabase-activation-pack.sql`, apply the ordered migration history, and run RLS/advisor checks. Do not link accounts by email. Copy only the HTTPS URL and publishable key into the approved Worker configuration; the browser does not use Supabase Auth.
2. Connect the GitHub repository and `main` branch to Cloudflare Pages. Set the build command to `npm run build`, output directory to `dist`, and root directory to the repository root. The repository pins `pnpm@11.19.0` and declares the root workspace explicitly for Cloudflare dependency installation.
3. Deploy the Worker separately with `npm run worker:deploy` after setting Wrangler secrets and bindings. Point `VITE_API_BASE_URL` at that Worker’s `/api/v1` origin.
4. Set the exact Pages frontend origin in the Worker’s `ALLOWED_ORIGIN`. Register that exact origin and `/auth/callback` with Grasany ID, then provide the accepted central packet and server-only OIDC configuration. Do not configure product-local Google, password, or Supabase Auth redirects.
5. Run the documented staging smoke/realtime and production validation gates before switching traffic.

No live credentials are stored in this repository. `.env.example` is the template; `.env.local` is intentionally ignored. Merchant/provider credentials, payment callbacks and webhook routing belong to the central Grasany payment service; SunoTo remains payment-disabled until its approved scoped contract is present. Do not delete any existing Vercel project until the Cloudflare production URL is verified.

## Monitoring

Use GET /api/health for the private App Status Control Center. It is intentionally app-only and fast; it does not query Supabase or other dependencies. Use the authenticated operational health surface separately when dependency diagnostics are needed.
