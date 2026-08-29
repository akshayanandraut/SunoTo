import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeVideoConfig,videoEligible,DEFAULT_VIDEO_CONFIG } from "../worker/src/policies/videoPolicy.js";
import { ConfigService,clearConfigCache } from "../worker/src/services/ConfigService.js";

describe("video beta configuration",()=>{
  it("defaults to disabled with no beta users",()=>{assert.deepEqual(normalizeVideoConfig({}),DEFAULT_VIDEO_CONFIG);});
  it("keeps only well-formed unique UUIDs in the beta allowlist",()=>{const config=normalizeVideoConfig({enabled:true,betaUserIds:["11111111-1111-1111-1111-111111111111","11111111-1111-1111-1111-111111111111","not-a-uuid"]});assert.deepEqual(config.betaUserIds,["11111111-1111-1111-1111-111111111111"]);});
});

describe("video eligibility",()=>{
  const enabled=normalizeVideoConfig({enabled:true,betaUserIds:["11111111-1111-1111-1111-111111111111","22222222-2222-2222-2222-222222222222"]});
  it("allows any two real verified accounts once enabled, beta allowlist no longer required",()=>{assert.equal(videoEligible(enabled,"11111111-1111-1111-1111-111111111111","22222222-2222-2222-2222-222222222222",false,false),true);assert.equal(videoEligible(enabled,"11111111-1111-1111-1111-111111111111","33333333-3333-3333-3333-333333333333",false,false),true);});
  it("still requires both participants to have an account",()=>{assert.equal(videoEligible(enabled,"11111111-1111-1111-1111-111111111111",null,false,false),false);});
  it("never allows video for a virtual participant even if beta-listed",()=>{assert.equal(videoEligible(enabled,"11111111-1111-1111-1111-111111111111","22222222-2222-2222-2222-222222222222",true,false),false);});
  it("stays off entirely while the feature is disabled",()=>{const disabled=normalizeVideoConfig({enabled:false,betaUserIds:enabled.betaUserIds});assert.equal(videoEligible(disabled,"11111111-1111-1111-1111-111111111111","22222222-2222-2222-2222-222222222222",false,false),false);});
});

describe("versioned video beta configuration",()=>{
  it("caches public reads and uses the audited RPC for updates",async()=>{clearConfigCache();let reads=0,updateBody;const stored={enabled:true,betaUserIds:["11111111-1111-1111-1111-111111111111"]};const fetcher=async(url,options={})=>{if(url.includes("update_video_config")){updateBody=JSON.parse(options.body);return Response.json([{value:stored,version:2,updated_at:"now"}]);}reads+=1;return Response.json([{value:DEFAULT_VIDEO_CONFIG,version:1,updated_at:"before"}]);},service=new ConfigService({SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"secret"},fetcher);await service.video(100);await service.video(101);assert.equal(reads,1);const updated=await service.updateVideo({adminId:"admin-id",expectedVersion:1,config:stored});assert.equal(updated.version,2);assert.equal(updateBody.admin_id,"admin-id");assert.equal(updateBody.expected_version,1);});
  it("locks config versions and audits updates in the database",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608260003_video_beta.sql",import.meta.url),"utf8");assert.match(sql,/for update/i);assert.match(sql,/config_version_conflict/i);assert.match(sql,/insert into public\.admin_audit/i);assert.match(sql,/"enabled":false/);});
});
