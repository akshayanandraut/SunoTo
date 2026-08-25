import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseClientEvent } from "../worker/src/protocol.js";
import { ContactUnlockService } from "../worker/src/services/ContactUnlockService.js";
import { ChatSession } from "../worker/src/durable/ChatSession.js";

const socket=id=>({sent:[],send(value){this.sent.push(JSON.parse(value))},deserializeAttachment(){return{participantId:id}}});
const roomState=(a,b)=>{const now=Date.now(),values=new Map([["session",{sessionId:"session-unlock",participants:{a:{accountUserId:"user-a",lastActivityAt:now},b:{accountUserId:"user-b",lastActivityAt:now}},disconnects:{},startedAt:now,ended:false}]]);return{values,getWebSockets:()=>[a,b],storage:{get:key=>values.get(key),put:(key,value)=>values.set(key,structuredClone(value)),setAlarm:()=>{}}};};

describe("contact unlock protocol",()=>{
  it("accepts request, accept and decline events",()=>{for(const type of ["CONTACT_UNLOCK_REQUEST","CONTACT_UNLOCK_ACCEPT","CONTACT_UNLOCK_DECLINE"])assert.equal(parseClientEvent(JSON.stringify({v:1,type})).ok,true);});
  it("charges both accounts atomically after mutual consent",async()=>{const a=socket("a"),b=socket("b"),state=roomState(a,b);let body;const room=new ChatSession(state,{SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"service",FETCHER:async(_url,options)=>{body=JSON.parse(options.body);return Response.json([{left_balance:500,right_balance:500,idempotent:false}]);}});await room.webSocketMessage(a,JSON.stringify({v:1,type:"CONTACT_UNLOCK_REQUEST"}));await room.webSocketMessage(b,JSON.stringify({v:1,type:"CONTACT_UNLOCK_ACCEPT"}));assert.equal(body.left_user_id,"user-a");assert.equal(body.right_user_id,"user-b");assert.ok(state.values.get("session").contactUnlockedUntil>Date.now());assert.equal(a.sent.some(event=>event.type==="CONTACT_UNLOCKED"),true);});
  it("allows contact during the five-minute window",async()=>{const a=socket("a"),b=socket("b"),state=roomState(a,b);state.values.get("session").contactUnlockedUntil=Date.now()+300000;const room=new ChatSession(state,{});await room.webSocketMessage(a,JSON.stringify({v:1,type:"CHAT_MESSAGE",eventId:"unlocked-message",payload:{text:"email me at a@example.com"}}));assert.equal(b.sent[0].type,"MESSAGE_RECEIVED");});
});

describe("contact unlock money boundary",()=>{
  it("uses the privileged pair RPC",async()=>{let body;const service=new ContactUnlockService({url:"https://project",serviceKey:"service",fetcher:async(_url,options)=>{body=JSON.parse(options.body);return Response.json([{left_balance:500,right_balance:500}]);}});await service.activate({sessionId:"session-1",leftUserId:"left",rightUserId:"right"});assert.equal(body.target_session_id,"session-1");assert.equal(body.left_user_id,"left");assert.equal(body.right_user_id,"right");});
  it("rejects missing or identical accounts before calling the database",async()=>{let calls=0;const service=new ContactUnlockService({fetcher:async()=>{calls++;return Response.json([]);}});await assert.rejects(()=>service.activate({sessionId:"session-1",leftUserId:"same-user",rightUserId:"same-user"}),/invalid_contact_unlock/);await assert.rejects(()=>service.activate({sessionId:"session-1",leftUserId:"left",rightUserId:null}),/invalid_contact_unlock/);assert.equal(calls,0);});
  it("locks and debits both wallets in one transaction",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608250004_phase16_contact_unlock.sql",import.meta.url),"utf8");assert.match(sql,/least\(left_user_id::text,right_user_id::text\)/i);assert.match(sql,/greatest\(left_user_id::text,right_user_id::text\)/i);assert.match(sql,/-500,'contact_unlock'/i);assert.match(sql,/public\.apply_wallet_entry[\s\S]*public\.apply_wallet_entry/i);assert.match(sql,/service_role/i);assert.doesNotMatch(sql,/create table(?: if not exists)? public\.messages/i);});
});
