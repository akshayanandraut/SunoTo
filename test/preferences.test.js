import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isExactPreferencePair,normalizePaidPreferences,preferenceFee,satisfiesPreference } from "../worker/src/policies/preferencePolicy.js";
import { MatchmakingService } from "../worker/src/services/MatchmakingService.js";
import { PreferenceChargeService } from "../worker/src/services/PreferenceChargeService.js";

const person=(identityId,profile,preferences={})=>({identityId,profile,preferences,blockedPeerIds:[],available:true});
describe("paid preference policy",()=>{
  it("prices the locked combinations",()=>{assert.equal(preferenceFee({gender:"Female"}),50);assert.equal(preferenceFee({gender:"Female",ageMin:25,ageMax:35}),75);assert.equal(preferenceFee({gender:"Female",ageMin:25,ageMax:35,language:"Hindi",commonInterest:true}),125);assert.equal(preferenceFee({language:"Tamil"}),25);});
  it("rejects an age range without gender and inverted bounds",()=>{assert.throws(()=>normalizePaidPreferences({ageMin:20}),/requires_gender/);assert.throws(()=>normalizePaidPreferences({gender:"Male",ageMin:40,ageMax:20}),/invalid_age_range/);});
  it("checks gender, age, language and a genuinely common interest",()=>{const seeker=person("seeker",{age:28,gender:"Male",languages:["English"],interests:["Music"]},{gender:"Female",ageMin:22,ageMax:30,language:"Hindi",commonInterest:true}),candidate=person("candidate",{age:25,gender:"Female",languages:["Hindi"],interests:["Music","Books"]});assert.equal(satisfiesPreference(seeker,candidate),true);assert.equal(isExactPreferencePair(seeker,candidate),true);assert.equal(satisfiesPreference(seeker,{...candidate,profile:{...candidate.profile,interests:["Travel"]}}),false);});
});

describe("preference matchmaking",()=>{
  it("matches exact real profiles immediately and exposes only the server fee",()=>{const service=new MatchmakingService();service.search(person("candidate",{age:25,gender:"Female",languages:["Hindi"],interests:["Music"]}),()=>0);const result=service.search(person("seeker",{age:30,gender:"Male",languages:["English"],interests:["Music"]},{gender:"Female",ageMin:20,ageMax:29,language:"Hindi",commonInterest:true}),()=>1000,()=>"session-pref");assert.deepEqual(result,{status:"matched",sessionId:"session-pref",peerId:"candidate",criteriaSatisfied:true,preferenceFee:125,matchMode:"preference"});});
  it("waits the full 30 seconds, then falls back with zero preference fee",()=>{const service=new MatchmakingService();service.search(person("random-peer",{age:40,gender:"Male",languages:["English"],interests:[]}),()=>0);const first=service.search(person("seeker",{age:25,gender:"Male",languages:["English"],interests:[]},{gender:"Female"}),()=>1000,()=>"unused");assert.equal(first.status,"searching");const result=service.result("seeker",()=>31_000,()=>"session-fallback");assert.deepEqual(result,{status:"matched",sessionId:"session-fallback",peerId:"random-peer",criteriaSatisfied:false,preferenceFee:0,matchMode:"random_fallback"});});
});

describe("preference charge boundary",()=>{
  it("does not debit fallback matches",async()=>{let called=false;const result=await new PreferenceChargeService({fetcher:async()=>{called=true;return Response.json([]);}}).chargePair({sessionId:"session-1",left:{result:{criteriaSatisfied:false,preferenceFee:125}},right:{result:{}}});assert.equal(result.charged,0);assert.equal(called,false);});
  it("uses one transactional RPC for both exact-result debits",async()=>{let body;const service=new PreferenceChargeService({url:"https://project",serviceKey:"service",fetcher:async(_url,options)=>{body=JSON.parse(options.body);return Response.json([{left_balance:875,right_balance:950,idempotent:false}]);}});const result=await service.chargePair({sessionId:"session-1",left:{userId:"user-1",result:{criteriaSatisfied:true,matchMode:"preference",preferenceFee:125}},right:{userId:"user-2",result:{criteriaSatisfied:true,matchMode:"preference",preferenceFee:50}}});assert.equal(result.charged,175);assert.equal(body.left_fee,125);assert.equal(body.right_fee,50);assert.equal(body.target_session_id,"session-1");});
});

describe("phase 12 money safeguards",()=>{
  it("locks two wallets in stable order and commits both preference debits together",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608250003_phase12_preferences.sql",import.meta.url),"utf8");assert.match(sql,/least\(left_user_id::text,right_user_id::text\)/i);assert.match(sql,/greatest\(left_user_id::text,right_user_id::text\)/i);assert.match(sql,/public\.apply_wallet_entry[\s\S]*public\.apply_wallet_entry/i);assert.match(sql,/preference:'\|\|target_session_id/i);assert.match(sql,/grant execute on function public\.charge_preference_match[\s\S]*service_role/i);assert.doesNotMatch(sql,/create table(?: if not exists)? public\.messages/i);});
});
