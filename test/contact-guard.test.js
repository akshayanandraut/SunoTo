import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { checkContactMessage } from "../web/js/contact-guard.js";
import { ChatSession } from "../worker/src/durable/ChatSession.js";
import { AnonymousIdentityShard } from "../worker/src/durable/AnonymousIdentityShard.js";

describe("contact guard",()=>{
  it("blocks phone, email, URL and social-app attempts",()=>{for(const text of ["call +91 98765 43210","mail me a.user @ gmail dot com","visit example dot com","telegram me there"])assert.equal(checkContactMessage(text).blocked,true,text);});
  it("detects split digits and number words across messages",()=>{let state={};for(const text of ["nine eight seven","six five four","three two one zero"]){const result=checkContactMessage(text,state);state=result.state;}assert.equal(checkContactMessage("zero",state).blocked,true);});
  it("keeps ordinary conversation available",()=>{assert.equal(checkContactMessage("I have two books and one is about music").blocked,false);assert.equal(checkContactMessage("meet me at the park in the story").blocked,false);});
});

describe("server contact ordering",()=>{
  it("rejects contact before any paid debit or relay",async()=>{const socket=id=>({sent:[],send(value){this.sent.push(JSON.parse(value))},deserializeAttachment(){return{participantId:id}}}),a=socket("identity-a"),b=socket("identity-b"),session={sessionId:"session-contact",participants:{"identity-a":{accountUserId:"user-a",lastActivityAt:1},"identity-b":{accountUserId:"user-b",lastActivityAt:1}},disconnects:{},startedAt:1,freeExpiredAt:2,paidActive:true,lastPaidMessageAt:Date.now()},values=new Map([["session",session]]);let walletCalls=0;const state={getWebSockets:()=>[a,b],storage:{get:key=>values.get(key),put:(key,value)=>values.set(key,structuredClone(value)),setAlarm:()=>{}}},room=new ChatSession(state,{SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"service",FETCHER:async()=>{walletCalls++;return Response.json([]);}});await room.webSocketMessage(a,JSON.stringify({v:1,type:"CHAT_MESSAGE",eventId:"contact-event",payload:{text:"my number is 98765 43210"}}));assert.equal(a.sent[0].payload.code,"contact_blocked");assert.equal(b.sent.length,0);assert.equal(walletCalls,0);assert.equal(JSON.stringify(values.get("session")).includes("my number is"),false);});
});

describe("cross-session spam fingerprints",()=>{
  it("rate-limits the same fingerprint across three sessions without storing text",async()=>{const data={identities:{"identity-a":{}},ipSignals:{},consumptions:{},spamSignals:{},counters:{}},values=new Map([["anonymous_state",data]]),state={storage:{get:key=>values.get(key),put:(key,value)=>values.set(key,structuredClone(value))}},shard=new AnonymousIdentityShard(state,{}),send=sessionId=>shard.fetch(new Request("https://anonymous/spam-fingerprint",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identityId:"identity-a",sessionId,fingerprint:"a".repeat(24)})}));assert.equal((await(await send("session-1")).json()).allowed,true);assert.equal((await(await send("session-2")).json()).allowed,true);const third=await(await send("session-3")).json();assert.equal(third.allowed,false);assert.ok(third.retryAt>Date.now());assert.equal(JSON.stringify(values.get("anonymous_state")).includes("message text"),false);});
});
