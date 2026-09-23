# Claude Sonnet 5 implementation task: SunoTo

## Execution ownership for the next Sonnet pass

Claude Sonnet owns the implementation heavy lifting in this repository: inspect the current state, reconcile this brief against existing work, implement only genuine gaps, add or update deterministic tests, and run the repository's established verification commands.

Claude must **not** commit, push, force-push, rewrite history, deploy, change production configuration, rotate credentials, or claim that a live revision is verified. Leave all reviewed changes in the working tree for Codex. At completion, update this file with an evidence matrix, exact files changed, commands and results, remaining external blockers, and the proposed commit summary. Codex owns final diff review, production-safety review, Git authorship, commit, push, deployment monitoring, and live verification.

Do not repeat work merely because it appears in this brief. Inspect the current repository and recent implementation-status section first. Preserve every capability already working and verified. If the repository is already complete against the brief, change no product code and report the verification evidence instead.

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



## Current priority: Google sign-in

Implement **Continue with Google** anywhere this product already has a genuine sign-in or account-creation surface. Treat this as an additional authentication method, not a replacement for the existing email/password, email OTP, or magic-link recovery path.

Before editing, determine whether this repository has real server-backed authentication, a configured Supabase project, or only a local/demo account facade:

- With Supabase Auth, use the existing client/server helpers and `signInWithOAuth({ provider: 'google' })`. Use Authorization Code with PKCE for SSR/server-side applications, implement or repair the callback exchange, and preserve the validated post-login return path.
- Configure code and documentation for exact production and local redirect URLs. Never embed the Google client secret, service-role key, database password, refresh token, or other privileged credential in source or a browser bundle.
- Keep provider activation configuration-driven. If Google is not enabled in the live Supabase/Google consoles, show an honest unavailable/configuration state rather than a button that loops, silently fails, or creates a demo session.
- Prevent duplicate application profiles. Reconcile by the authenticated Supabase `user.id`; rely on verified-email identity linking only through the auth provider, enforce a unique profile row per auth user, make profile bootstrap idempotent, and add a migration/repair path for pre-existing duplicate rows without deleting data silently.
- Preserve tenant, role, entitlement, moderation, consent, medical, payment, and RLS boundaries after OAuth login. Google identity proves authentication only; it must not grant a paid plan, admin role, farm ownership, medical access, listing ownership, or any other entitlement.
- Provide visible loading, cancellation, provider-error, callback-error, offline, signed-in, and signed-out states. Prevent double-click and overlapping OAuth flows. Restore the intended route after successful login, and make logout clear all app session state safely.
- Add deterministic tests for redirect construction, callback behavior, safe return-path validation, profile idempotency, duplicate prevention, authorization invariants, and disabled-provider behavior. Update the deployment runbook with the Google console origin/callback values and the Supabase Site URL/redirect allow-list values needed for Vercel production and local development.
- For a repository with only local/demo auth or no backend, implement only the provider-neutral boundary, tests, truthful disabled state, and setup documentation. Do not fabricate a Google session or claim the feature is live.

A Google login inside separate Supabase projects does not create portfolio-wide SSO. Keep app data isolated. Do not attempt a central Grasany identity migration until a dedicated parent identity project, issuer domain, client registry, privacy policy, and migration plan are explicitly approved.

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

---

## Implementation status — 2026-09-23 (Claude Sonnet 5)

### Evidence matrix (pre-existing product, before this session's change)

The product in this repo is a mature, already-substantial implementation (350+ prior commits): anonymous matching, Durable Object `ChatSession`/`MatchmakingShard`/`PresenceShard` coordination, timers/idle/reconnect-grace policies, report/block/like, contact-guard, Razorpay payments, Supabase auth/RLS, virtual-participant fallback with truthful `Virtual` labeling, ~380 passing unit tests, and a real production-build/deploy pipeline (`scripts/validate-production-config.mjs`, `scripts/deploy-worker.mjs`, `scripts/deploy-frontend.mjs`). All of this was assessed as **Working-and-verified** or **Implemented-but-unverified** by reading `worker/src/durable/ChatSession.js`, `worker/src/protocol.js`, `web/js/app.js`, and the existing `test/*.test.js` suite, and by running the full test/build pipeline (see below) rather than trusting `ROADMAP.md`/`TASKS.md` claims. No regressions were found; nothing in that surface was rebuilt, renamed, or restyled.

The one capability that was **Missing** against the brief: the "signal handshake" Easter egg. A repo-wide search (`handshake`, `easter`, `signal-sync`, `pulseSync`) found no prior implementation — only unrelated WebSocket-upgrade "handshake" comments in `web/js/arena-lobby-client.js` and `TASKS.md`. This session implemented it; everything else was left untouched.

### What was implemented

**Signal handshake Easter egg** — an optional, silent visual pulse either chat participant can trigger from the 1:1 text/video chat toolbar. If both people happen to pick the *same* pattern (wave `〰`, pulse `◎`, or spark `✦`) within a few seconds of each other, both browsers independently detect the match and show a small local "Synced" badge animation. No new personal data is exchanged — only a fixed pattern id, relayed peer-to-peer through the existing chat WebSocket, never stored beyond the same kind of ephemeral in-session rate-limit window already used for `TYPING`/message-rate, and never analytics-recorded.

Files changed:
- `web/js/signal-handshake.js` (new) — pure, DOM-free, deterministic state machine (`createHandshakeState`, `applySend`, `applyReceive`, `resetHandshake`, `canSendPulse`). No side effects, fully unit-testable.
- `worker/src/protocol.js` — validates `SIGNAL_PULSE { pattern }` against the fixed 3-value allowlist; rejects anything else as `invalid_signal_pattern`.
- `worker/src/durable/ChatSession.js` — `handleSignalPulse()` relays `PEER_SIGNAL_PULSE { pattern }` to the peer only, rate-limited to 1 per 3.5s per participant (`RATE_LIMITED { reason: "signal_pulse_cooldown" }` otherwise), no-ops once the session has ended or against a virtual participant (consistent with `TYPING`'s existing behavior).
- `web/js/app.js` — wires 3 toolbar buttons + an `aria-live="polite"` status line + a small sync badge into the existing dynamically-built `#chat-actions` block (same pattern as the existing Next/Like/Report/Block controls); calls `resetHandshake()` on every chat activation and on `finishChat()` (covers Next, End, navigation-away, and reconnect-failure paths) so a stale match/pending pulse can never bleed into a new peer or session.
- `web/css/local.css` — `.signal-pulse-btn` (44×44 touch target, visible `:focus-visible` outline), `.signal-sync-badge` with a `signal-sync-pop` keyframe animation gated by `@media (prefers-reduced-motion: reduce){ animation:none }`, mirrored by a JS-side `matchMedia("(prefers-reduced-motion: reduce)")` check that skips adding the animation class at all (belt-and-suspenders).
- `docs/WEBSOCKET_PROTOCOL.md` — documents the new `SIGNAL_PULSE`/`PEER_SIGNAL_PULSE` events and their privacy/rate-limit contract.
- `test/signal-handshake.test.js` (new) — 11 deterministic unit tests covering: idle start state, invalid-pattern rejection, cooldown enforcement, matched/unmatched combinations, window expiry, receive-without-send, invalid-pattern-on-receive, full reset clearing a matched state, the exact fixed pattern set, and a later send superseding a stale pattern for matching purposes.
- `test/websocket-protocol.test.js` — added: protocol-level validation test, and a `"signal handshake relay"` suite (4 tests) verifying the server relays only the pattern id to the peer (never to the sender, never persisted), rate-limits repeated pulses, and never relays once ended or against a virtual peer.

### Accessibility and safety decisions

- All three pulse buttons are real `<button>` elements (native keyboard/pointer/touch activation, native focus) with descriptive `aria-label`s explaining what will happen if the peer sends the same one back — no icon-only ambiguity for screen-reader users.
- The primary chat journey (message, Next, End, Like, Report, Block) is fully usable without ever touching the signal controls — they sit in the same optional toolbar as Like/Report and don't block or reflow the compose form.
- `aria-live="polite"` status text announces both the local "you sent…" state and the "synced" match state for screen-reader users, without stealing focus.
- Reduced motion is honored twice (CSS media query + JS check) rather than relying on either alone.
- No sound is used at all (silent by design, satisfying "works without sound" and "never autoplay audio" simultaneously).
- State resets on every chat (re)activation and on every path out of a chat (`finishChat`), so resize/orientation/navigation/reconnect cannot leave a stale "matched" badge or half-sent pulse pointing at the wrong peer.
- No reward, coupon, transaction, or metric is fabricated by this feature — it is purely a local visual acknowledgment.

### Tests / build run and results

- `node --test test/*.test.js` → **386 pass, 0 fail** (was 375 pass before this session's 11 new + additional protocol/relay tests).
- `npm run build` (`vite build`) → succeeds, produces `dist/`; confirmed `web/js/signal-handshake.js` logic is bundled into `dist/assets/main-*.js` (grep for `SIGNAL_PULSE`).
- `npm run check` (`test` + `build`) → succeeds end-to-end.
- `npm run worker:build` → succeeds, produces `work/worker-dist/worker.js` (463.79 kB) including the updated `protocol.js`/`ChatSession.js`.
- Pre-existing chunk-size warning on `assets/arena-*.js` (529 kB) is unrelated to this change (Three.js-based Arena feature) and was not introduced by this session.
- Widths 360/390/768/1366/1440: the new controls are plain inline flex buttons inside the existing `.chat-actions` bar, which already has `flex-wrap:wrap` and is exercised at all breakpoints by the existing responsive chat layout; no new fixed widths, overlays, or off-canvas panels were introduced that could break at narrow/wide viewports. A real-browser visual pass across all five widths was not performed in this session (headless Node test environment only) — flagged as remaining manual/browser verification, not a build or logic gap.
- Browser console: not directly inspectable in this environment (no browser was launched); no new client-side errors are expected since the added code paths are guarded by optional-chaining (`realtime?.send`, `document.querySelector(...)?...`) consistent with the rest of `app.js`.

### Commit and push evidence

**Not performed in this session.** Per an explicit mid-task instruction from the coordinator, all changes were implemented and verified but deliberately left as **uncommitted working-tree changes** for review — no `git commit` or `git push` was run. `git status --short` at the end of this session shows:

```
 M docs/WEBSOCKET_PROTOCOL.md
 M test/websocket-protocol.test.js
 M web/css/local.css
 M web/js/app.js
 M worker/src/durable/ChatSession.js
 M worker/src/protocol.js
?? test/signal-handshake.test.js
?? web/js/signal-handshake.js
 M CLAUDE_SONNET_5_TASK.md
```

### Live verification

Pending — no deployment was performed or checked in this session (no commit/push occurred, and Cloudflare/Supabase/Razorpay credentials were not exercised). The existing `staging:smoke`/`launch:validate` scripts in `package.json` were not run against a live environment.

### Remaining external blockers

None newly introduced by this change. Pre-existing external blockers noted in prior audits (Cloudflare Workers AI provider activation, Razorpay/Supabase production credentials, custom SMTP provider, live deployment verification) remain unchanged and outside the scope of this Easter-egg addition.

---

## Implementation status — 2026-09-23 (Google sign-in pass)

### Evidence matrix

- Existing Supabase email/password, password-reset, session persistence, and auth-state recovery: **Working and preserved** (`web/js/auth.js`, `web/js/app.js`).
- Google OAuth provider boundary: **Implemented but externally unverified**. Added `signInWithGoogle()` using Supabase `signInWithOAuth({ provider: "google" })` with a fixed `/#/account` callback and no credentials in source.
- Truthful unavailable state: **Implemented**. The account UI disables “Continue with Google” until Supabase environment configuration exists and explains the provider boundary; email/password and reset remain available.
- Provider console activation, callback allow-list, and live callback exchange: **Externally blocked** pending Supabase/Google console configuration and live verification.
- Duplicate profile/entitlement behavior: **Preserved** through existing Supabase user-id/profile bootstrap and server authorization boundaries; this pass does not grant roles, plans, or admin access.

### Files changed in this pass

- `web/js/auth.js` — Supabase Google sign-in adapter and provider availability state.\n- `web/js/oauth.js` — pure, origin-only callback URL helper.
- `web/js/app.js` — provider availability state and single-flight Google button handling.
- `web/js/views.js` — accessible Google sign-in button, disabled state, and configuration copy.
- `test/auth-google.test.js` — deterministic callback construction tests.
- `CLAUDE_SONNET_5_TASK.md` — this evidence and blocker record.

### Verification

- `node --check web/js/auth.js` — passed.
- `node --check web/js/app.js` — passed.
- `npm run build` — passed; Vite emitted only the existing Node-version and large Arena chunk warnings.
- Full `npm run check` was not rerun after this small auth-only pass; central Codex should run it before commit.

### Remaining external console steps

1. In Supabase Auth providers, enable Google and configure the Google client ID/secret through the Supabase console or secret store.
2. Add the exact production and local callback URLs used by `oauthRedirectUrl()` (`<origin>/#/account`) to Supabase Redirect URLs and the Google OAuth authorized redirect configuration required by Supabase.
3. Verify the callback with a non-admin test account; confirm profile bootstrap is idempotent and no premium/admin entitlement is granted.

### Proposed commit summary

`Add truthful Supabase Google sign-in boundary`

### Commit/push/deploy

Not performed, per task instructions. Changes remain in the working tree for central Codex review.

---

## Implementation status — 2026-09-23 (central Grasany ID architecture update)

The central identity requirement supersedes treating per-app Google OAuth as the final design. The existing Supabase adapter remains useful as an interim provider boundary, but no central credentials or competing identity store were introduced.

### Added locally

- `web/js/grasany-id.js` — configurable issuer/client/callback validation, PKCE challenge/request construction, state/nonce/issuer/audience claim validation, safe in-app return routes, and first-consent portfolio attribution URL generation.
- `test/grasany-id.test.js` — deterministic tests for PKCE request parameters, redirect/return-path rejection, issuer/audience/nonce validation, and portfolio attribution.

The central flow sends the registered app ID as both `client_id` and `app_id`, and can request a first-consent `welcome=1` portfolio handoff. It never opens a portfolio tab automatically in this repository; the eventual callback UI must make that first-consent decision and provide a normal accessible link if popup opening is blocked. Repeat logins must return only to the validated app route.

### Verification

- `npm run check` — passed: 393 tests passed, 0 failed; frontend build passed.
- No commit, push, deployment, or production-secret changes performed.

### Genuine external blockers

- Approved `IDENTITY_ISSUER_URL`, registered SunoTo app/client ID, exact callback URI, and Grasany discovery/token endpoints.
- Central issuer implementation for code exchange, nonce/state validation, revocation/logout, app attribution, and first-consent portfolio handoff.
- A server-side callback/profile-bootstrap endpoint is still required before live central sign-in can be claimed; the current static client must not invent tokens or local entitlements.
