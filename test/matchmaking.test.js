import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { isEligibleRandomPair,selectRandomCandidate } from "../worker/src/policies/randomMatchPolicy.js";
import { MatchmakingService } from "../worker/src/services/MatchmakingService.js";
import { PresenceShard } from "../worker/src/durable/PresenceShard.js";

const user=(identityId,extra={})=>({identityId,blockedPeerIds:[],queuedAt:0,...extra});

describe("random match policy",()=>{
  it("never matches an identity to itself",()=>assert.equal(isEligibleRandomPair(user("identity-a"),user("identity-a")),false));
  it("excludes blocks, inactive candidates, and active identities",()=>{assert.equal(isEligibleRandomPair(user("identity-a",{blockedPeerIds:["identity-b"]}),user("identity-b")),false);assert.equal(isEligibleRandomPair(user("identity-a"),user("identity-b",{idle:true})),false);assert.equal(isEligibleRandomPair(user("identity-a"),user("identity-b"),{"identity-b":{sessionId:"s"}}),false);});
  it("selects the longest-waiting eligible person",()=>{const found=selectRandomCandidate(user("identity-a"),[user("identity-new",{queuedAt:20}),user("identity-old",{queuedAt:10})],{});assert.equal(found.identityId,"identity-old");});
});

describe("matchmaking lifecycle",()=>{
  it("queues the first person and matches the second",()=>{const service=new MatchmakingService();assert.equal(service.search(user("identity-a"),()=>1).status,"searching");const match=service.search(user("identity-b"),()=>2,()=>"session-1");assert.deepEqual(match,{status:"matched",sessionId:"session-1",peerId:"identity-a"});assert.deepEqual(service.result("identity-a"),{status:"matched",sessionId:"session-1",peerId:"identity-b"});});
  it("enforces one active chat per identity",()=>{const service=new MatchmakingService();service.search(user("identity-a"),()=>1);service.search(user("identity-b"),()=>2,()=>"session-1");assert.equal(service.search(user("identity-a")).status,"already_active");});
  it("cleans both active claims when a session ends",()=>{const service=new MatchmakingService();service.search(user("identity-a"),()=>1);service.search(user("identity-b"),()=>2,()=>"session-1");assert.equal(service.end("identity-a","session-1").status,"ended");assert.deepEqual(service.active,{});assert.equal(service.result("identity-b").status,"idle");});
  it("replaces duplicate waiting searches without restarting the timeout",()=>{const service=new MatchmakingService();service.search(user("identity-a"),()=>1);service.search(user("identity-a"),()=>2);assert.equal(service.queue.length,1);assert.equal(service.queue[0].queuedAt,1);});
});

describe("ephemeral presence",()=>{
  it("tracks real statuses without persistent storage",async()=>{const shard=new PresenceShard();await shard.fetch(new Request("https://presence/status",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identityId:"identity-a",status:"waiting",anonymous:true})}));const response=await shard.fetch(new Request("https://presence/stats"));const stats=await response.json();assert.equal(stats.waiting,1);assert.equal(stats.anonymousOnline,1);assert.equal(Object.hasOwn(shard,"state"),false);});
});
