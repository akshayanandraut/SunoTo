import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseClientEvent } from "../worker/src/protocol.js";
import { SafetyService } from "../worker/src/services/SafetyService.js";
import { ChatSession } from "../worker/src/durable/ChatSession.js";
import { MatchmakingService } from "../worker/src/services/MatchmakingService.js";

const socket=id=>({sent:[],send(value){this.sent.push(JSON.parse(value))},deserializeAttachment(){return{participantId:id}}});
const setup=()=>{const now=Date.now(),a=socket("identity-a"),b=socket("identity-b"),values=new Map([["session",{sessionId:"session-safety",participants:{"identity-a":{accountUserId:"user-a",lastActivityAt:now},"identity-b":{accountUserId:"user-b",lastActivityAt:now}},disconnects:{},startedAt:now,ended:false}]]),state={values,getWebSockets:()=>[a,b],storage:{get:key=>values.get(key),put:(key,value)=>values.set(key,structuredClone(value)),setAlarm:()=>{}}};return{a,b,state};};

describe("safety protocol",()=>{
  it("validates report reasons",()=>{assert.equal(parseClientEvent(JSON.stringify({v:1,type:"REPORT",payload:{reason:"scam"}})).ok,true);assert.equal(parseClientEvent(JSON.stringify({v:1,type:"REPORT",payload:{reason:"dislike"}})).code,"invalid_report_reason");assert.equal(parseClientEvent(JSON.stringify({v:1,type:"LIKE"})).ok,true);assert.equal(parseClientEvent(JSON.stringify({v:1,type:"BLOCK"})).ok,true);});
  it("allows one like per participant and notifies the peer",async()=>{const{a,b,state}=setup(),room=new ChatSession(state,{SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"service",FETCHER:async()=>Response.json(true)});await room.webSocketMessage(a,JSON.stringify({v:1,type:"LIKE"}));await room.webSocketMessage(a,JSON.stringify({v:1,type:"LIKE"}));assert.equal(b.sent[0].type,"LIKE_RECEIVED");assert.equal(a.sent.at(-1).payload.code,"like_already_sent");});
  it("reports metadata, avoids the peer and ends without exposing the reason",async()=>{const{a,b,state}=setup(),matchCalls=[];const MATCHMAKING={idFromName:()=>"id",get:()=>({fetch:async(url,options)=>{matchCalls.push({url,body:JSON.parse(options.body)});return Response.json({ok:true});}})},room=new ChatSession(state,{SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"service",MATCHMAKING,FETCHER:async()=>Response.json([{weight:4,recent_score:4}])});await room.webSocketMessage(a,JSON.stringify({v:1,type:"REPORT",payload:{reason:"scam"}}));assert.equal(a.sent[0].type,"REPORT_ACCEPTED");assert.deepEqual(matchCalls[0].body,{identityId:"identity-a",peerId:"identity-b"});assert.deepEqual(matchCalls[1].body,{identityId:"identity-a",sessionId:"session-safety"});assert.equal(b.sent[0].payload.reason,"peer_left");assert.equal(JSON.stringify(b.sent).includes("scam"),false);assert.equal(state.values.get("session").ended,true);});
});

describe("safety persistence",()=>{
  it("calls only service-role RPCs",async()=>{const calls=[],service=new SafetyService({url:"https://project",serviceKey:"service",fetcher:async(url,options)=>{calls.push({url,options});return Response.json(true);}});await service.like("session-1","actor-1","target-1");await service.report("session-1","actor-1","target-1","spam");await service.block("00000000-0000-0000-0000-000000000001","target-ref");assert.deepEqual(calls.map(call=>call.url.split("/").at(-1)),["record_like","record_report","create_block"]);assert.ok(calls.every(call=>call.options.headers.authorization==="Bearer service"));});
  it("stores no transcript and applies weighted 30-day decay",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608250005_phase17_safety.sql",import.meta.url),"utf8");assert.match(sql,/power\(0\.5[\s\S]*\/30\)/i);assert.match(sql,/count\(distinct reporter_ref\)/i);assert.match(sql,/unique\(session_id,actor_ref\)/i);assert.match(sql,/create policy "users read own blocks"/i);assert.doesNotMatch(sql,/message|transcript/i);});
});

describe("immediate rematch exclusion",()=>{
  it("excludes an avoided pair for thirty minutes",()=>{const service=new MatchmakingService();service.avoid("identity-a","identity-b",()=>0);service.search({identityId:"identity-a",blockedPeerIds:[]},()=>1);assert.equal(service.search({identityId:"identity-b",blockedPeerIds:[]},()=>2).status,"searching");assert.equal(service.queue.length,2);});
  it("releases both active claims when safety ends a room",()=>{const service=new MatchmakingService({active:{"identity-a":{peerId:"identity-b",sessionId:"session-1"},"identity-b":{peerId:"identity-a",sessionId:"session-1"}}});service.avoid("identity-a","identity-b");assert.deepEqual(service.active,{});});
});
