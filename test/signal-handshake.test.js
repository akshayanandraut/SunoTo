import { describe,it } from "node:test";
import assert from "node:assert/strict";
import {
  createHandshakeState,
  applySend,
  applyReceive,
  resetHandshake,
  canSendPulse,
  PULSE_PATTERNS,
  PULSE_COOLDOWN_MS,
  MATCH_WINDOW_MS,
} from "../web/js/signal-handshake.js";

describe("signal handshake state machine",()=>{
  it("starts idle, unmatched, and able to send",()=>{
    const state=createHandshakeState();
    assert.equal(state.matched,false);
    assert.equal(canSendPulse(state,Date.now()),true);
  });

  it("rejects an unrecognized pattern without mutating state",()=>{
    const state=createHandshakeState();
    const result=applySend(state,"confetti",1000);
    assert.equal(result.sent,false);
    assert.equal(result.reason,"invalid_pattern");
    assert.deepEqual(result.state,state);
  });

  it("enforces the send cooldown per participant",()=>{
    let state=createHandshakeState();
    const first=applySend(state,"wave",1000);
    assert.equal(first.sent,true);
    state=first.state;
    const tooSoon=applySend(state,"wave",1000+PULSE_COOLDOWN_MS-1);
    assert.equal(tooSoon.sent,false);
    assert.equal(tooSoon.reason,"cooldown");
    const afterCooldown=applySend(state,"wave",1000+PULSE_COOLDOWN_MS);
    assert.equal(afterCooldown.sent,true);
  });

  it("matches when both a send and a receive of the same pattern land within the window",()=>{
    let state=createHandshakeState();
    state=applySend(state,"spark",1000).state;
    state=applyReceive(state,"spark",1000+2000);
    assert.equal(state.matched,true);
    assert.equal(state.matchedPattern,"spark");
    assert.equal(state.matchedAt,3000);
  });

  it("does not match when the patterns differ",()=>{
    let state=createHandshakeState();
    state=applySend(state,"wave",1000).state;
    state=applyReceive(state,"pulse",1500);
    assert.equal(state.matched,false);
  });

  it("does not match once the window has elapsed",()=>{
    let state=createHandshakeState();
    state=applySend(state,"wave",1000).state;
    state=applyReceive(state,"wave",1000+MATCH_WINDOW_MS+1);
    assert.equal(state.matched,false);
  });

  it("a receive alone (nothing sent yet) never matches",()=>{
    const state=applyReceive(createHandshakeState(),"wave",1000);
    assert.equal(state.matched,false);
  });

  it("ignores a receive of an invalid pattern rather than throwing",()=>{
    const state=createHandshakeState();
    const next=applyReceive(state,"not-a-pattern",1000);
    assert.deepEqual(next,state);
  });

  it("reset clears a matched state completely, so a stale match cannot bleed into a new peer",()=>{
    let state=createHandshakeState();
    state=applySend(state,"pulse",1000).state;
    state=applyReceive(state,"pulse",1200);
    assert.equal(state.matched,true);
    const reset=resetHandshake();
    assert.deepEqual(reset,createHandshakeState());
    assert.equal(reset.matched,false);
    assert.equal(canSendPulse(reset,0),true);
  });

  it("exposes exactly the fixed, non-arbitrary pattern set used by the server allowlist",()=>{
    assert.deepEqual([...PULSE_PATTERNS].sort(),["pulse","spark","wave"]);
  });

  it("a later send updates the pattern under match consideration (no stale-pattern false match)",()=>{
    let state=createHandshakeState();
    state=applySend(state,"wave",1000).state;
    state=applySend(state,"spark",1000+PULSE_COOLDOWN_MS).state;
    state=applyReceive(state,"wave",1000+PULSE_COOLDOWN_MS+500);
    assert.equal(state.matched,false);
  });
});
