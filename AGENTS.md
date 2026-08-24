# AGENTS.md

This repository is intended to be implemented with Codex.

## Source of truth

Read `ROADMAP.md` before architecture or product changes.

Do not silently change locked product rules.

## Priorities

1. Money/payment correctness and idempotency.
2. One identity = one active chat.
3. No permanent storage of normal chat messages.
4. Mobile-first performance.
5. Modular vanilla HTML/CSS/JavaScript.
6. Cloudflare Workers + Durable Objects for realtime.
7. Supabase Auth/Postgres for persistent account/business state.
8. Razorpay for recharge.
9. Replaceable pricing/matching/moderation policies.
10. Tests before roadmap completion checkmarks.

## Frontend

Do not introduce React/Vue/Svelte unless explicitly approved.

Use ES modules and small modules.

## Persistence

Do not create a normal `messages` table.

Browser chat history and favourites are local-only.

Minimal temporary session state for relay/reconnect/contact detection is allowed and must be discarded when the session ends.

## Money

Client is never authoritative for balance, debit, credit, payment success, daily access, preference fees, paid message charges, reconnect or contact unlock.

Use transactional/idempotent server logic.

## Trust

Do not fabricate real-user counts.

Virtual participants must be subtly but clearly indicated as virtual and never incur the human paid-message continuation fee.

## Execution

Implement one roadmap phase at a time.

Before coding:
1. identify phase,
2. inspect code,
3. state implementation plan.

After coding:
1. run tests,
2. fix failures,
3. summarize files,
4. update only completed phase checkbox.

## Secrets

Never commit secrets. Use placeholders and platform secret stores.

## Security

Never render user chat via `innerHTML`.

Validate server-side.

Enforce admin authorization server-side.

Use RLS for Supabase private data.

## Ambiguity

Prefer the simplest implementation preserving ROADMAP.md.

If requirements conflict, surface the conflict instead of inventing a new business rule.
