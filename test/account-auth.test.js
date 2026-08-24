import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifySupabaseUser } from "../worker/src/auth/supabaseUser.js";
import { DeviceOwnershipShard } from "../worker/src/durable/DeviceOwnershipShard.js";
import { usernameChangeDecision,validUsername } from "../worker/src/policies/usernamePolicy.js";

describe("Supabase account verification",()=>{
  it("validates the bearer token with Supabase and exposes verification state",async()=>{const request=new Request("https://api/me",{headers:{authorization:"Bearer account-jwt"}}),fetcher=async(url,options)=>{assert.equal(url,"https://project.supabase.co/auth/v1/user");assert.equal(options.headers.apikey,"publishable");return Response.json({id:"user-1",email:"a@example.com",email_confirmed_at:"2026-08-24T00:00:00Z"});};const user=await verifySupabaseUser(request,{SUPABASE_URL:"https://project.supabase.co",SUPABASE_PUBLISHABLE_KEY:"publishable"},fetcher);assert.equal(user.id,"user-1");assert.equal(user.emailVerified,true);});
  it("rejects missing and invalid sessions",async()=>{assert.equal(await verifySupabaseUser(new Request("https://api/me"),{},async()=>Response.json({})),null);assert.equal(await verifySupabaseUser(new Request("https://api/me",{headers:{authorization:"Bearer bad"}}),{SUPABASE_URL:"https://project.supabase.co",SUPABASE_PUBLISHABLE_KEY:"key"},async()=>new Response(null,{status:401})),null);});
});

describe("username rules",()=>{
  it("accepts only 3–24 letters, numbers, and underscores",()=>{assert.equal(validUsername("QuietRiver_42"),true);assert.equal(validUsername("no spaces"),false);assert.equal(validUsername("ab"),false);});
  it("enforces three changes and a thirty-day cooldown",()=>{const now=Date.parse("2026-08-24T00:00:00Z");assert.equal(usernameChangeDecision({username:null},now).allowed,true);assert.equal(usernameChangeDecision({username:"one",usernameChangeCount:3,usernameChangedAt:"2026-01-01T00:00:00Z"},now).reason,"username_change_limit_reached");assert.equal(usernameChangeDecision({username:"one",usernameChangeCount:1,usernameChangedAt:"2026-08-20T00:00:00Z"},now).reason,"username_change_cooldown");});
});

describe("newest-device ownership",()=>{
  it("replaces the previous owner and reports it",async()=>{const values=new Map(),state={storage:{get:key=>values.get(key),put:(key,value)=>values.set(key,value)}},shard=new DeviceOwnershipShard(state);const claim=deviceId=>shard.fetch(new Request("https://device/claim",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId})}));await claim("device-one-123");const second=await(await claim("device-two-456")).json();assert.equal(second.deviceId,"device-two-456");assert.equal(second.previousDeviceId,"device-one-123");});
});

describe("phase 7 database safeguards",()=>{
  it("enables RLS and contains no messages table",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608240001_phase7_auth.sql",import.meta.url),"utf8");assert.match(sql,/alter table public\.profiles enable row level security/i);assert.match(sql,/email_confirmed_at is not null/i);assert.match(sql,/interval '30 days'/i);assert.doesNotMatch(sql,/create table(?: if not exists)? public\.messages/i);});
});
