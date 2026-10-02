# Deployment budget and readiness policy

This repository must not create a Vercel production or preview deployment merely to show progress, validate a small edit, or publish an incomplete feature. Work and validation happen locally first. Related changes are grouped into a coherent feature slice; push only when that complete slice is ready, producing at most one deployment per slice.

## Readiness gate

Before a push that can trigger Vercel, the feature owner records evidence that all applicable items below pass:

- Acceptance criteria are complete; no placeholder adapter, partial UI, or deferred dependency is represented as usable.
- Meaningful automated tests and the production build pass locally.
- Deployment/runtime configuration is validated without exposing secrets.
- Database migrations are ordered, compatible with existing data, and safe to apply.
- Security and privacy checks pass, including authorization, input validation, and data minimization.
- Relevant browser/user flows work end-to-end.
- External dependencies are configured and fail closed when unavailable.

Payments may remain intentionally disabled if all payment paths fail closed; this alone does not block an otherwise ready non-payment feature.

## Push and deployment controls

- Treat pushes to deployment-connected branches as deployment triggers until repository settings prove otherwise.
- Do not create throwaway previews. Preserve the free-plan limit of 100 deployments per day for launch-critical, complete work.
- General authorization to push or "do the needful" is not permission to deploy a known-incomplete slice.
- A manual override is valid only when the user explicitly names the product or feature and requests deployment despite known incomplete checks. Record the skipped/failed checks and override in the deployment report.
- Before and after delivery, report local `main`, remote `main`, and production separately. Never infer that a push means production is aligned or healthy.
- Do not deploy solely to publish this policy.

## Readiness record

For every deployment candidate, record the commit, acceptance criteria, test/build/configuration/migration/security/privacy/browser evidence, unresolved external dependencies, and any explicit override. If any applicable gate is not met, keep the work local and report what remains.

Suggested local commands from `package.json`: `npm run check` (tests and regular build), `npm run production:validate`, and `npm run production:build`. Run the test/build commands for a deployment candidate; this policy change did not run them. These commands are a starting point, not a substitute for the feature-specific checklist above, migration compatibility, or browser-flow evidence. A successful build alone is not readiness.
