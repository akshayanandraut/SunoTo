# Product Supabase identity activation (pending)

`worker/src/auth/supabaseIdentityAdapter.js` is deliberately disabled. The Worker does not link accounts by email, use browser Supabase tokens as identity, or infer entitlements/admin roles from OIDC claims.

The companion [SQL activation pack](identity-supabase-activation-pack.sql) is a design artifact, not an applied migration. It creates an unexposed `app_private.grasany_identity_links` table with RLS enabled and no `anon`/`authenticated` policies. Only a server-side adapter may read/write it after a reviewed migration is generated using `supabase migration new`. Product membership, payment entitlements and product roles remain in product-owned tables and must be checked separately after resolving the verified `sub` mapping. Central admin remains a separate signed namespaced claim; this packet currently provides no such namespace.

The Supabase CLI was not available in the checkout; `pnpm exec supabase --version` attempted a package install and failed with `EPERM`. No migration history file was fabricated, no database was changed, and no migration was applied.
