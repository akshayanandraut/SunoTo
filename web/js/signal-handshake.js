// Signal handshake — a privacy-safe, optional Easter egg for the 1:1 chat screen.
//
// Either participant can trigger a short, silent visual "pulse" (one of a small fixed set of
// patterns). It is relayed to the peer over the existing chat WebSocket as pure ephemeral UI
// signal — no chat content, no identity, nothing persisted server-side beyond a short in-memory
// rate-limit window that already exists for TYPING (see worker/src/durable/ChatSession.js).
//
// If *both* participants happen to pick the *same* pattern within a short window of each other,
// their two browsers independently compute a "matched" state and each shows a small local
// synchronized animation. Neither side is told anything about the other beyond "you both picked
// the same pattern just now" — no names, no timestamps beyond the local session, no persistence.
//
// This module is intentionally framework-free and DOM-free so it can be unit tested deterministically.

export const PULSE_PATTERNS = Object.freeze(["wave", "pulse", "spark"]);

// Minimum time between two pulses sent by the *same* participant. Keeps the relay cheap and
// prevents someone from spamming the peer with flashes.
export const PULSE_COOLDOWN_MS = 4000;

// How long a sent-or-received pulse stays "live" for matching purposes. If the peer's matching
// pulse doesn't arrive within this window, no synchronized animation happens.
export const MATCH_WINDOW_MS = 6000;

export function createHandshakeState() {
  return {
    lastSentAt: 0,
    lastSentPattern: null,
    lastReceivedAt: 0,
    lastReceivedPattern: null,
    matched: false,
    matchedAt: null,
    matchedPattern: null,
  };
}

export function canSendPulse(state, now) {
  return !state.lastSentAt || now - state.lastSentAt >= PULSE_COOLDOWN_MS;
}

function evaluateMatch(state, now) {
  const sentRecent = state.lastSentAt && now - state.lastSentAt <= MATCH_WINDOW_MS;
  const receivedRecent = state.lastReceivedAt && now - state.lastReceivedAt <= MATCH_WINDOW_MS;
  if (sentRecent && receivedRecent && state.lastSentPattern && state.lastSentPattern === state.lastReceivedPattern) {
    return { ...state, matched: true, matchedAt: now, matchedPattern: state.lastSentPattern };
  }
  return { ...state, matched: false, matchedAt: null, matchedPattern: null };
}

// Local participant tries to send a pulse. Pure function: returns the next state plus whether the
// send is allowed (caller is responsible for actually transmitting it over the socket only when
// `sent` is true).
export function applySend(state, pattern, now) {
  if (!PULSE_PATTERNS.includes(pattern)) return { state, sent: false, reason: "invalid_pattern" };
  if (!canSendPulse(state, now)) return { state, sent: false, reason: "cooldown" };
  const next = evaluateMatch({ ...state, lastSentAt: now, lastSentPattern: pattern }, now);
  return { state: next, sent: true };
}

// A pulse arrived from the peer over the socket.
export function applyReceive(state, pattern, now) {
  if (!PULSE_PATTERNS.includes(pattern)) return state;
  return evaluateMatch({ ...state, lastReceivedAt: now, lastReceivedPattern: pattern }, now);
}

// Must be called on chat end/next/navigation/reconnect so a stale match or pending pulse never
// bleeds into a new session or a new peer.
export function resetHandshake() {
  return createHandshakeState();
}
