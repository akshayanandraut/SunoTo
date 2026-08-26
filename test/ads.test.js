import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adDecision,normalizeAdConfig } from "../worker/src/policies/adPolicy.js";
import { ConfigService,clearConfigCache } from "../worker/src/services/ConfigService.js";
import { adminUser } from "../worker/src/index.js";
import { adProviderFor,loadPublicAdConfig,loadPublicAdSnapshot,registerAdProvider } from "../web/js/ads.js";

const enabled={enabled:true,provider:"house",adFreeBalanceThreshold:1000,interstitialEveryScans:5,placements:{top:true,bottom:true,desktopSide:true,interstitial:true}};

describe("three-tier ad policy",()=>{
  it("shows all free placements and interstitials every fifth scan",()=>{assert.deepEqual(adDecision({scanCount:4,config:enabled}).placements,["top","bottom","desktopSide"]);assert.deepEqual(adDecision({scanCount:5,config:enabled}).placements,["top","bottom","desktopSide","interstitial"]);assert.equal(adDecision({registered:true,balance:0,scanCount:5,config:enabled}).tier,"free_or_zero");});
  it("removes interstitials from balances 1 through 1000",()=>{for(const balance of [1,500,1000]){const result=adDecision({registered:true,balance,scanCount:5,config:enabled});assert.equal(result.tier,"registered_low_balance");assert.equal(result.placements.includes("interstitial"),false);}});
  it("is ad-free only above 1000 Credits and respects the kill switch",()=>{assert.deepEqual(adDecision({registered:true,balance:1001,config:enabled}).placements,[]);assert.equal(adDecision({registered:true,balance:1001,config:enabled}).tier,"ad_free");assert.equal(adDecision({config:{...enabled,enabled:false}}).tier,"disabled");});
  it("rejects malformed provider and numeric configuration",()=>{assert.throws(()=>normalizeAdConfig({...enabled,provider:"<script>"}),/invalid_ad_provider/);assert.throws(()=>normalizeAdConfig({...enabled,interstitialEveryScans:0}),/invalid_interstitial_frequency/);});
});

describe("replaceable browser ad provider",()=>{
  it("registers a reviewed adapter and can remove it with a kill-safe fallback",()=>{const unregister=registerAdProvider("reviewed-network",()=>({mount(){}}));assert.equal(typeof adProviderFor("reviewed-network").mount,"function");unregister();const slot={remove(){this.removed=true;}};adProviderFor("reviewed-network").mount(slot);assert.equal(slot.removed,true);});
  it("rejects reserved, malformed and mount-less adapters",()=>{assert.throws(()=>registerAdProvider("house",()=>({mount(){}})),/invalid_ad_provider_registration/);assert.throws(()=>registerAdProvider("<bad>",()=>({mount(){}})),/invalid_ad_provider_registration/);assert.throws(()=>registerAdProvider("network",()=>({})),/invalid_ad_provider_registration/);});
  it("loads a versioned public snapshot and rejects an unversioned response",async()=>{const snapshot=await loadPublicAdSnapshot(async()=>Response.json({ads:enabled,version:4,flags:{signup_enabled:true}}));assert.deepEqual(snapshot,{config:enabled,version:4,flags:{signup_enabled:true}});assert.deepEqual(await loadPublicAdConfig(async()=>Response.json({ads:enabled,version:4})),enabled);await assert.rejects(()=>loadPublicAdSnapshot(async()=>Response.json({ads:enabled})),/invalid_public_config/);});
});

describe("versioned ad configuration",()=>{
  it("caches public reads and uses the audited RPC for updates",async()=>{clearConfigCache();let reads=0,updateBody;const fetcher=async(url,options={})=>{if(url.includes("update_ad_config")){updateBody=JSON.parse(options.body);return Response.json([{value:enabled,version:2,updated_at:"now"}]);}reads+=1;return Response.json([{value:enabled,version:1,updated_at:"before"}]);},service=new ConfigService({SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"secret"},fetcher);assert.equal((await service.ads(100)).version,1);assert.equal((await service.ads(101)).version,1);assert.equal(reads,1);const updated=await service.updateAds({adminId:"admin-id",expectedVersion:1,config:enabled});assert.equal(updated.version,2);assert.equal(updateBody.admin_id,"admin-id");assert.equal(updateBody.expected_version,1);});
  it("requires a separately configured, verified MFA super-admin",async()=>{const request=new Request("https://api/admin",{headers:{authorization:"Bearer token"}}),env={ADMIN_USER_ID:"admin-id"};assert.equal((await adminUser(request,env,async()=>null)).error.status,401);assert.equal((await adminUser(request,env,async()=>({id:"other",emailVerified:true,aal:"aal2"}))).error.status,403);assert.equal((await adminUser(request,env,async()=>({id:"admin-id",emailVerified:false,aal:"aal2"}))).error.status,403);assert.equal((await adminUser(request,env,async()=>({id:"admin-id",emailVerified:true,aal:"aal1"}))).error.status,403);assert.equal((await adminUser(request,env,async()=>({id:"admin-id",emailVerified:true,aal:"aal2"}))).user.id,"admin-id");});
  it("locks config versions and audits updates in the database",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608250006_phase19_ads.sql",import.meta.url),"utf8");assert.match(sql,/for update/i);assert.match(sql,/config_version_conflict/i);assert.match(sql,/insert into public\.admin_audit/i);assert.match(sql,/enable row level security/i);assert.doesNotMatch(sql,/create table[^;]*messages/i);});
});
