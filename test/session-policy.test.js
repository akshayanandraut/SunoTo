import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { SESSION_DEFAULTS } from "../worker/src/config/defaults.js";
import { idleDecision,reconnectDecision,skipDecision,timerState } from "../worker/src/policies/sessionPolicy.js";
import { recordSkip } from "../worker/src/policies/skipAbusePolicy.js";

describe("free session timer",()=>{
  it("runs for two minutes and highlights the final thirty seconds",()=>{assert.equal(timerState(0,89_000,SESSION_DEFAULTS).phase,"free");assert.equal(timerState(0,90_000,SESSION_DEFAULTS).phase,"ending_soon");assert.deepEqual(timerState(0,120_000,SESSION_DEFAULTS),{elapsedSeconds:120,remainingSeconds:0,phase:"free_expired"});});
});
describe("skip policy",()=>{
  it("locks normal skips for thirty seconds",()=>assert.deepEqual(skipDecision({startedAt:0,now:10_000},SESSION_DEFAULTS),{allowed:false,remainingSeconds:20}));
  it("allows server-confirmed idle and disconnected exceptions",()=>{assert.equal(skipDecision({startedAt:0,now:5_000,reason:"peer_idle"},SESSION_DEFAULTS).allowed,true);assert.equal(skipDecision({startedAt:0,now:5_000,reason:"peer_disconnected"},SESSION_DEFAULTS).allowed,true);});
  it("applies a configurable cooldown after repeated skips",()=>{const now=60_000,history=[10_000,20_000,30_000,40_000,50_000];const result=recordSkip(history,now,SESSION_DEFAULTS);assert.equal(result.allowed,false);assert.equal(result.cooldownUntil,180_000);});
});
describe("idle and reconnect policy",()=>{
  it("warns at sixty seconds and marks idle after the grace period",()=>{assert.equal(idleDecision(0,60_000,SESSION_DEFAULTS).state,"warning");assert.equal(idleDecision(0,80_000,SESSION_DEFAULTS).state,"idle");});
  it("expires reconnect after thirty seconds",()=>{assert.equal(reconnectDecision(0,29_000,SESSION_DEFAULTS).expired,false);assert.equal(reconnectDecision(0,30_000,SESSION_DEFAULTS).expired,true);});
});
