# Deployment integration

SunoTo uses three deliberately separate boundaries:

- Supabase Auth/Postgres is the persistent account and business-data layer. Apply the ordered files in `supabase/migrations/` to the target project. Those migrations enable RLS and keep privileged wallet/payment operations behind server-side RPCs.
- Cloudflare Workers + Durable Objects remain the realtime/API layer. Configure Worker secrets with `wrangler secret put`; never put service-role, payment, or anonymous-session secrets in Vercel.
- Vercel serves the static Vite frontend from `main` using `vercel.json`. Configure only the public frontend values there: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.

## One-time dashboard setup

1. Create or select the Supabase project and apply the migration history. Copy its HTTPS URL and publishable/anon key into the Vercel project and Worker environment configuration.
2. Connect the GitHub repository and `main` branch to Vercel. Keep the project root at the repository root; the checked-in config runs `npm ci`, `npm run build`, and serves `dist`.
3. Deploy the Worker separately with `npm run worker:deploy` after setting its Wrangler secrets and bindings. Point `VITE_API_BASE_URL` at that Worker’s `/api/v1` origin.
4. Set the exact frontend origin in the Worker’s `ALLOWED_ORIGIN` and configure Supabase Auth redirect URLs for that same Vercel origin.
5. Run the documented staging smoke/realtime and production validation gates before switching traffic.

No live credentials are stored in this repository. `.env.example` is the template; `.env.local` is intentionally ignored.