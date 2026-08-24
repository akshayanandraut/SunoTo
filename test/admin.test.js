import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AdminService } from "../worker/src/services/AdminService.js";
import { MatchmakingService } from "../worker/src/services/MatchmakingService.js";
import { PresenceShard } from "../worker/src/durable/PresenceShard.js";
import { ChatSession } from "../worker/src/durable/ChatSession.js";

describe("admin service boundaries",()=>{
  it("uses privileged RPCs for audited wallet and restriction changes",async()=>{const calls=[],service=new AdminService({SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"secret"},async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json([{balance:10}]);});await service.wallet({adminId:"admin",userId:"user",delta:10,reason:"Support correction",operationId:"operation"});await service.restrict({adminId:"admin",targetRef:"identity-a",status:"banned",reason:"Confirmed abuse"});assert.match(calls[0].url,/rpc\/admin_adjust_wallet$/);assert.equal(calls[0].body.credit_delta,10);assert.match(calls[1].url,/rpc\/admin_set_restriction$/);assert.equal(calls[1].body.new_status,"banned");});
  it("uses service-role authorization rather than a browser credential",async()=>{let headers;const service=new AdminService({SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"service-secret"},async(_url,options)=>{headers=options.headers;return Response.json({accountHolders:0});});await service.dashboard();assert.equal(headers.apikey,"service-secret");assert.equal(headers.authorization,"Bearer service-secret");});
});

describe("restriction enforcement",()=>{
  it("removes a queued or active account by identity, account, or public reference",()=>{const service=new MatchmakingService();service.search({identityId:"identity-a",accountUserId:"user-a",accountPublicId:"public-a",blockedPeerIds:[],preferences:{},profile:{}},()=>0);assert.deepEqual(service.restrict("public-a").removed,["identity-a"]);service.search({identityId:"identity-a",accountUserId:"user-a",accountPublicId:"public-a",blockedPeerIds:[],preferences:{},profile:{}},()=>1);service.search({identityId:"identity-b",accountUserId:"user-b",accountPublicId:"public-b",blockedPeerIds:[],preferences:{},profile:{}},()=>2,()=>"session");const result=service.restrict("user-a");assert.equal(result.sessionsEnded,1);assert.deepEqual(result.sessionIds,["session"]);assert.deepEqual(service.active,{});});
  it("ends the authoritative room when an admin restriction is enforced",async()=>{const sent=[],socket={send:value=>sent.push(JSON.parse(value))},values=new Map([["session",{participants:{},ended:false}]]),state={getWebSockets:()=>[socket],storage:{get:key=>values.get(key),put:(key,value)=>values.set(key,structuredClone(value))}},room=new ChatSession(state,{}),response=await room.fetch(new Request("https://chat.internal/admin/end",{method:"POST"}));assert.equal(response.status,200);assert.equal(values.get("session").ended,true);assert.equal(sent[0].payload.reason,"account_restricted");});
  it("excludes stale presence from exact admin counts",async()=>{const shard=new PresenceShard();shard.presence.set("stale",{status:"waiting",anonymous:true,lastSeen:Date.now()-100000});shard.presence.set("live",{status:"chatting",anonymous:false,lastSeen:Date.now()});const stats=await(await shard.fetch(new Request("https://presence/stats"))).json();assert.equal(stats.waiting,0);assert.equal(stats.chatting,1);assert.equal(stats.registeredOnline,1);});
});

describe("phase 21 database safeguards",()=>{
  it("locks and audits privileged changes without a messages table",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608250008_phase21_admin.sql",import.meta.url),"utf8");assert.match(sql,/admin_adjust_wallet/i);assert.match(sql,/apply_wallet_entry/i);assert.match(sql,/admin_audit/i);assert.match(sql,/for update/i);assert.match(sql,/enable row level security/i);assert.doesNotMatch(sql,/create table[^;]*messages/i);});
});
