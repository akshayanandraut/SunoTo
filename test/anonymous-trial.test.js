import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { ipPrefix,signAnonymousToken,verifyAnonymousToken } from "../worker/src/auth/anonymousToken.js";
import { evaluateIpRisk,TRIAL_DEFAULTS,trialEligibility } from "../worker/src/policies/trialRiskPolicy.js";
import { AnonymousIdentityShard } from "../worker/src/durable/AnonymousIdentityShard.js";

describe("signed anonymous sessions",()=>{
  it("verifies valid tokens and rejects tampering or expiry",async()=>{const secret="a-secure-development-secret-32-bytes",token=await signAnonymousToken({v:1,sub:"anonymous-1",exp:200},secret);assert.equal((await verifyAnonymousToken(token,secret,100)).sub,"anonymous-1");assert.equal(await verifyAnonymousToken(`${token}x`,secret,100),null);assert.equal(await verifyAnonymousToken(token,secret,201),null);});
  it("reduces IPs to coarse prefixes",()=>{assert.equal(ipPrefix("203.0.113.42"),"203.0.113.0/24");assert.equal(ipPrefix("2001:db8:abcd:12::1"),"2001:db8:abcd::/48");});
});

describe("trial and shared-IP risk policies",()=>{
  it("allows five successful connections",()=>{assert.deepEqual(trialEligibility(4),{successfulConnections:4,remaining:1,accountRequired:false});assert.deepEqual(trialEligibility(5),{successfulConnections:5,remaining:0,accountRequired:true});});
  it("raises risk without treating a moderately shared IP as one person",()=>{const now=1_000_000,five=Object.fromEntries(Array.from({length:5},(_,i)=>[`id-${i}`,now]));assert.deepEqual(evaluateIpRisk(five,now).riskLevel,"elevated");const twenty=Object.fromEntries(Array.from({length:TRIAL_DEFAULTS.accountRequiredAtNewIdentities},(_,i)=>[`id-${i}`,now]));assert.equal(evaluateIpRisk(twenty,now).accountRequired,true);});
});

describe("atomic anonymous trial ledger",()=>{
  it("consumes a session once even when the event is duplicated",async()=>{const values=new Map(),state={storage:{get:key=>values.get(key),put:(key,value)=>values.set(key,structuredClone(value))}},shard=new AnonymousIdentityShard(state,{ANON_SESSION_SECRET:"a-secure-development-secret-32-bytes"});const issue=await shard.fetch(new Request("https://anonymous/issue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({anonymousId:"anonymous-123",localSecret:"local-secret-at-least-16",ipHash:"ip-hash"})}));assert.equal(issue.status,200);const consume=()=>shard.fetch(new Request("https://anonymous/consume",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identityId:"anonymous-123",sessionId:"session-1",reason:"message"})}));assert.equal((await (await consume()).json()).consumed,true);const duplicate=await (await consume()).json();assert.equal(duplicate.consumed,false);assert.equal(duplicate.idempotent,true);assert.equal(duplicate.successfulConnections,1);});
});
