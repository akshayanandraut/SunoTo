# WebSocket protocol v1

Phase 3 exposes `GET /api/v1/chat/:sessionId/socket`. The request must be a WebSocket upgrade and a session accepts two active sockets.

```json
{"v":1,"type":"CHAT_MESSAGE","eventId":"client-unique-id","payload":{"text":"Hello"}}
```

Client events include `HELLO`, `HEARTBEAT`, `ACTIVITY`, `CHAT_MESSAGE`, `NEXT_REQUEST`, `SESSION_END`, `SESSION_RESUME`, `CONTINUE_ACCEPT`, and `CONTINUE_DECLINE`. Chat messages require an event ID and 1–1000 text characters. Either participant can end immediately with `SESSION_END`; early `NEXT_REQUEST` exceptions remain derived from server-observed peer state, never trusted from client claims.

Server events additionally include `CONTINUE_REQUESTED`, `CONTINUE_ACTIVATED`, `CONTINUE_NOT_ACCEPTED`, and `PAYMENT_HOLD`. Paid continuation requires both verified participants, charges 10 Credits to the sender of each accepted message, and idempotently maps the debit to the message event ID.

The server owns the two-minute timer, 30-second normal skip lock, 60-second idle warning, 20-second idle grace, and 30-second reconnect grace. Repeated skips are evaluated through a configurable cross-session policy.

`READY` supplies an opaque participant ID and temporary resume token. Reconnect using the same session URL with `?resumeToken=...`. Resume metadata is temporary session state. Normal message text is relayed only: it is never written to Durable Object storage, logs, or a database.

Contact information and off-platform links are rejected with `MESSAGE_REJECTED { code: "contact_blocked" }` before any paid debit. Repeated bypass or cross-chat copy-paste may emit `RATE_LIMITED`; only temporary detector fragments and fingerprints are retained.

Contact sharing uses `CONTACT_UNLOCK_REQUEST`, `CONTACT_UNLOCK_ACCEPT`, and `CONTACT_UNLOCK_DECLINE`. Successful mutual payment emits `CONTACT_UNLOCKED { seconds: 300 }`; expiry or failure emits `CONTACT_UNLOCK_ENDED`. The 500-Credit debit for each participant is atomic across both wallets.

`LIKE` is accepted once per participant and the peer receives `LIKE_RECEIVED`. `REPORT` requires a fixed reason and replies with `REPORT_ACCEPTED` before ending privately. `BLOCK` requires a registered account, persists account-wide and ends the room without exposing the action to the peer.

`SIGNAL_PULSE { pattern: "wave"|"pulse"|"spark" }` is the optional "signal handshake" Easter egg: a silent, non-blocking visual pulse either participant can trigger from the chat toolbar. The server only relays the pattern id to the peer as `PEER_SIGNAL_PULSE`; it is rate-limited to one per participant every 3.5 seconds (`RATE_LIMITED { reason: "signal_pulse_cooldown" }` otherwise), carries no chat content or identity, and is never written to storage beyond the same in-memory per-session rate window already used for message rate limiting. Each browser independently decides locally (see `web/js/signal-handshake.js`) whether its own most recent sent pulse and the peer's most recently received pulse are the same pattern within a 6-second window; if so, both sides show a small local synchronized badge animation. No additional data is exchanged to compute the match.

For virtual fallback, `READY` includes `peer.virtual: true` and a limited public profile; `CHAT_STARTED` also includes `virtual: true`. The virtual participant either waits or sends one configured short greeting, then sends nothing further until the human replies. Provider replies include `payload.virtual: true`, are not persisted as transcript state, and never trigger wallet debits. The room ends after its free two minutes without offering paid continuation or contact unlock.
