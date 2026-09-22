# Claude Sonnet 5 implementation task: SunoTo

## Purpose

You are working in the canonical repository for **SunoTo**. Act as a principal product engineer, interaction designer, accessibility specialist, security reviewer, and release engineer.

A Cloudflare-hosted anonymous random-chat relay using Durable Objects/BroadcastChannel patterns, with strict privacy, abuse, permission, and deployment boundaries.

This file is an implementation brief, not evidence that any feature or integration already works.

## Required first step

Before editing:

1. Read the repository instructions, README, product specifications, readiness documents, tests, deployment files, Git status, recent history, and current branch/upstream.
2. Inspect the actual current product and existing functionality. Reuse good work; do not build a parallel replacement.
3. Identify dirty or untracked files. Treat them as user-owned unless clearly created by this task.
4. Determine the canonical branch and deployment model from repository evidence.
5. Write a short implementation plan tied to concrete files and acceptance checks, then execute it without waiting for routine clarification.

## Mandatory non-redundancy gate

Before proposing or implementing work, build a compact evidence matrix for every requested capability with exactly one status:

- **Working and verified** — preserve it and do not rebuild, restyle, rename, or move it unless a reproduced defect requires a narrow fix.
- **Implemented but unverified** — test it first; do not rewrite it merely because verification was missing.
- **Partial or defective** — document the concrete gap and make the smallest coherent fix that completes the intended experience.
- **Missing** — implement it using the existing architecture.
- **Externally blocked** — keep or add a truthful adapter/documented boundary; do not simulate the provider.

Treat existing tests, files, routes, and UI as evidence only after inspecting what they actually cover. Do not duplicate an existing component, page, state machine, API, database table, integration adapter, Easter egg, documentation file, or test suite under a new name. If all requested capabilities are already working, make no product-code commit; run the acceptance checks and report the verified state instead. A different visual preference by itself is not permission for a ground-up rewrite.



## Product work to complete

- Complete safe anonymous matching, connection/disconnection states, moderation/report/block boundaries, retry/recovery, mobile UX, accessibility, and Cloudflare deployment readiness.
- Audit Durable Object coordination, identity minimization, retention, rate limiting, permissions policy, origin handling, and abuse controls.
- Do not claim end-to-end encryption, perfect anonymity, moderation coverage, or production availability without evidence.
- Keep camera/microphone permissions explicit and user-triggered.

## Product-specific playful interaction

Add a privacy-safe 'signal handshake' Easter egg: two users who independently trigger the same optional visual pattern during an active session see a local synchronized animation. It must exchange no additional personal data, be rate-limited, work without sound, and never reveal identities.

The Easter egg must satisfy all of these constraints:

- Optional and non-blocking: every primary task remains obvious and usable without discovering it.
- Tasteful and product-relevant, not a generic confetti animation, random gradient, or unrelated mini-game.
- Fully usable with pointer, touch, and keyboard, with visible focus and meaningful accessible names/status.
- Respect `prefers-reduced-motion`; never autoplay audio; provide mute/caption/fallback treatment when sound exists.
- Recover safely from resize, orientation change, lost pointer capture, navigation, and reset.
- Never fabricate a real reward, coupon, subscription, transaction, user, metric, availability, provider, or integration.
- If a reward concept exists, implement only a server-verifiable claim boundary and truthfully label preview/sandbox states until authentication, billing, merchant, and destination systems are real.
- Add deterministic tests for state transitions and safety invariants rather than only snapshotting visuals.

## Experience standard

Create an original visual and interaction system that belongs to this product. Do not merely recolor the common AI-generated pattern of a centred hero, gradient background, glass cards, repeated pills, and generic dashboards.

Required qualities:

- The first viewport immediately explains what the product is, who it serves, and the primary action.
- Mobile, tablet, laptop, and wide desktop layouts are intentional.
- Information density scales through search, filtering, grouping, progressive disclosure, or compact views rather than endless scrolling.
- All interactive controls have hover, focus, active, disabled, loading, success, empty, offline, and error behavior where relevant.
- Copy uses familiar user language. Avoid gimmicky terminology when standard language is clearer.
- Use code-native SVG/icons and existing assets where possible. Do not copy third-party designs or copyrighted assets.
- Metadata, favicon, manifest/social preview, skip links, landmarks, headings, contrast, zoom, screen-reader behavior, and reduced motion must be production quality.
- Preserve privacy, domain, legal, health, financial, and commerce boundaries already documented in the repository.

## Engineering rules

- Work only in this canonical repository and current canonical task.
- Preserve unrelated user changes. Never reset, clean, stash, force-push, or rewrite history.
- Do not create another repository, app, task, or alternate implementation.
- Do not hard-code secrets or privileged credentials into source, logs, prompts, client bundles, URLs, or tests.
- Keep demo fixtures explicitly labelled and structurally separate from real persisted records.
- Keep domain logic separate from presentation and animation.
- Prefer the existing stack and smallest justified dependency set.
- Use truthful adapters/interfaces for unavailable payments, email, storage, authentication, provider APIs, native capabilities, or AI services.
- Do not make production/readiness claims from a local build alone.
- Do not remove a safety boundary merely to make a demo look complete.

## Verification

Add or update tests that meaningfully cover:

- The primary user journey and validation.
- The Easter egg state machine, accessibility, reset, and reduced-motion behavior.
- Demo-versus-real data isolation.
- Authentication/authorization or role boundaries where applicable.
- Failure, empty, loading, offline, and retry paths.
- Responsive layout invariants or browser-level smoke coverage where the stack supports it.
- Security-sensitive adapters and non-functional integration boundaries.
- Existing regression suites.

Run the repository's full relevant test, lint, type-check, production build, and diff checks. Manually inspect the result at representative widths: 360, 390, 768, 1366, and 1440 pixels. Check the browser console. If a live deployment exists, verify the exact deployed revision and critical journey; otherwise say live verification is pending.

## Git and delivery

Use repository-local Git identity:

- Name: `Akshayanand Raut`
- Email: `16624767+akshayanandraut@users.noreply.github.com`

Then:

1. Commit only coherent product changes.
2. Push normally to the canonical upstream branch.
3. Never force-push.
4. Report the commit SHA and exact test/build commands with results.
5. List changed files and summarize user-visible behavior.
6. Separate completed code from external blockers.
7. If the remote advanced concurrently, fetch and reconcile normally without discarding either side.
8. Do not call the project complete unless repository state, tests, and—when available—the deployed application all support that conclusion.

## Completion response

Return:

- What you found.
- What you changed.
- How the Easter egg works and why it fits this product.
- Accessibility and safety decisions.
- Tests/builds run and results.
- Commit and push evidence.
- Live verification evidence or the exact reason it remains pending.
- Remaining external credentials, providers, approvals, or business decisions.
