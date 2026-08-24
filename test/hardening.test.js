import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RateLimitShard } from "../worker/src/durable/RateLimitShard.js";
import { ChatSession } from "../worker/src/durable/ChatSession.js";
import { AccountPrivacyService } from "../worker/src/services/AccountPrivacyService.js";
import { AdminService } from "../worker/src/services/AdminService.js";

function rateState(){const values=new Map();return{storage:{get:key=>values.get(key),put:(key,value)=>values.set(key,structuredClone(value)),list:({prefix})=>new Map([...values].filter(([key])=>key.startsWith(prefix))),delete:keys=>keys.forEach(key=>values.delete(key)),setAlarm:()=>{}},values};}
function socket(id){return{sent:[],send(value){this.sent.push(JSON.parse(value))},deserializeAttachment(){return{participantId:id,resumeToken:`token-${id}`}}};}

describe("production rate limits",()=>{
  it("rejects the 21st anonymous session request in a minute",async()=>{const shard=new RateLimitShard(rateState()),request=()=>new Request("https://rate/check",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bucket:"anonymous_session",key:"1234567890123456"})});for(let index=0;index<20;index++)assert.equal((await shard.fetch(request())).status,200);const blocked=await shard.fetch(request());assert.equal(blocked.status,429);assert.equal((await blocked.json()).allowed,false);});
  it("rejects the 21st chat message in ten seconds without storing message text",async()=>{const a=socket("a"),b=socket("b"),values=new Map([["session",{sessionId:"rate-room",participants:{a:{lastActivityAt:0},b:{lastActivityAt:0}},disconnects:{},startedAt:Date.now(),ended:false}]]),state={getWebSockets:()=>[a,b],storage:{get:key=>values.get(key),put:(key,value)=>values.set(key,structuredClone(value)),setAlarm:()=>{}}},room=new ChatSession(state,{});for(let index=0;index<21;index++)await room.webSocketMessage(a,JSON.stringify({v:1,type:"CHAT_MESSAGE",eventId:`event-${index}`,payload:{text:"hello"}}));assert.equal(a.sent.at(-1).type,"RATE_LIMITED");assert.equal(b.sent.filter(event=>event.type==="MESSAGE_RECEIVED").length,20);assert.equal(JSON.stringify(values.get("session")).includes("hello"),false);});
});

describe("privacy operations",()=>{
  it("exports business data but never a server chat transcript",async()=>{const service=new AccountPrivacyService({SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"service"},async url=>Response.json(url.includes("/profiles?")?[{public_id:"RC-1"}]:[])),data=await service.export("user-id");assert.equal(data.profile.public_id,"RC-1");assert.equal("messages" in data,false);assert.match(data.chatHistory,/browser/i);});
  it("uses an audited RPC for grievance transitions",async()=>{let call;const service=new AdminService({SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"service"},async(url,options)=>{call={url,body:JSON.parse(options.body)};return Response.json({status:"resolved"});});await service.updateGrievance({adminId:"admin",id:"grievance",status:"resolved"});assert.match(call.url,/rpc\/admin_update_grievance$/);assert.deepEqual(call.body,{admin_id:"admin",target_id:"grievance",new_status:"resolved"});});
  it("defines RLS, deletion, grievances and retention without a messages table",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608250010_phase23_hardening.sql",import.meta.url),"utf8");assert.match(sql,/account_deletion_requests/i);assert.match(sql,/admin_update_grievance/i);assert.match(sql,/cleanup_operational_retention/i);assert.match(sql,/enable row level security/i);assert.match(sql,/service_role/i);assert.doesNotMatch(sql,/create table[^;]*messages/i);});
});
