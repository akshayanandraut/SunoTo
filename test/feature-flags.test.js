import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeFlags,DEFAULT_FLAGS,FLAG_KEYS } from "../worker/src/policies/flagPolicy.js";
import { ConfigService,clearConfigCache } from "../worker/src/services/ConfigService.js";
import { requireFlags } from "../worker/src/index.js";
import { ChatSession } from "../worker/src/durable/ChatSession.js";

describe("feature flag normalization",()=>{
  it("defaults every documented flag to enabled",()=>{assert.deepEqual(normalizeFlags({}),DEFAULT_FLAGS);});
  it("only a false value disables a flag; anything else stays enabled",()=>{const flags=normalizeFlags({payments_enabled:false,signup_enabled:"no"});assert.equal(flags.payments_enabled,false);assert.equal(flags.signup_enabled,true);});
  it("drops unknown keys",()=>{assert.deepEqual(Object.keys(normalizeFlags({unknown_flag:false})),FLAG_KEYS);});
});

describe("versioned feature flag configuration",()=>{
  it("caches public reads and uses the audited RPC for updates",async()=>{clearConfigCache();let reads=0,updateBody;const stored={...DEFAULT_FLAGS,payments_enabled:false};const fetcher=async(url,options={})=>{if(url.includes("update_feature_flags")){updateBody=JSON.parse(options.body);return Response.json([{value:DEFAULT_FLAGS,version:2,updated_at:"now"}]);}reads+=1;return Response.json([{value:stored,version:1,updated_at:"before"}]);},service=new ConfigService({SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"secret"},fetcher);const first=await service.flags(100);assert.equal(first.config.payments_enabled,false);assert.equal((await service.flags(101)).version,1);assert.equal(reads,1);const updated=await service.updateFlags({adminId:"admin-id",expectedVersion:1,config:DEFAULT_FLAGS});assert.equal(updated.version,2);assert.equal(updateBody.admin_id,"admin-id");assert.equal(updateBody.expected_version,1);});
  it("locks config versions and audits updates in the database",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608260001_feature_flags.sql",import.meta.url),"utf8");assert.match(sql,/for update/i);assert.match(sql,/config_version_conflict/i);assert.match(sql,/insert into public\.admin_audit/i);});
});

describe("worker-side kill switches",()=>{
  it("blocks only the disabled feature and lets others through",async()=>{clearConfigCache();const env={SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"secret",FETCHER:async()=>Response.json([{value:{...DEFAULT_FLAGS,new_matches_enabled:false},version:1,updated_at:"now"}])};const blocked=await requireFlags(env,["new_matches_enabled"]);assert.equal(blocked.status,503);const allowed=await requireFlags(env,["payments_enabled"]);assert.equal(allowed,null);});
  it("fails open when the flags row cannot be read, matching the enabled-by-default policy",async()=>{clearConfigCache();const env={SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"secret",FETCHER:async()=>{throw new Error("network_down")}};assert.equal(await requireFlags(env,["payments_enabled"]),null);});
});

describe("chat-session kill switches",()=>{
  it("rejects paid continuation accept and contact-unlock requests once disabled, but still allows decline", async()=>{
    clearConfigCache();
    const env={SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"secret",FETCHER:async()=>Response.json([{value:{...DEFAULT_FLAGS,paid_continuation_enabled:false,contact_unlock_enabled:false},version:1,updated_at:"now"}])};
    const session=new ChatSession({},env);
    assert.equal(await session.flagEnabled("paid_continuation_enabled"),false);
    assert.equal(await session.flagEnabled("contact_unlock_enabled"),false);
    assert.equal(await session.flagEnabled("payments_enabled"),true);
  });
});
