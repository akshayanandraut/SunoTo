import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { approximateDistanceBand,distanceKm,preferenceFee,preferenceTimeoutSeconds,satisfiesPreference } from "../worker/src/policies/preferencePolicy.js";
import { MatchmakingService } from "../worker/src/services/MatchmakingService.js";
import { locationForRadius } from "../web/js/geolocation.js";
import { startMatchSearch } from "../web/js/match-api.js";

const memoryStorage=()=>{const values=new Map();return{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
const located=(identityId,latitude,longitude,preferences={})=>({identityId,blockedPeerIds:[],available:true,profile:{age:25,gender:"Female",languages:["English"],interests:[],location:{latitude,longitude,capturedAt:Date.now()}},preferences});

describe("radius policy",()=>{
  it("uses the 100-Credit gender+age+radius base and a 45-second timeout",()=>{const preferences={gender:"Female",ageMin:20,ageMax:30,radiusKm:10};assert.equal(preferenceFee(preferences),100);assert.equal(preferenceTimeoutSeconds(preferences),45);});
  it("requires gender and a complete age range for radius",()=>{assert.throws(()=>preferenceFee({radiusKm:10}),/requires_gender_age/);assert.throws(()=>preferenceFee({gender:"Female",ageMin:20,radiusKm:10}),/requires_gender_age/);});
  it("accepts the documented 10% tolerance and rejects beyond it",()=>{const seeker=located("seeker",0,0,{gender:"Female",ageMin:20,ageMax:30,radiusKm:10});assert.equal(satisfiesPreference(seeker,located("inside",0,0.098)),true);assert.equal(satisfiesPreference(seeker,located("outside",0,0.102)),false);assert.ok(distanceKm(seeker.profile.location,located("peer",0,0.05).profile.location)>5);});
  it("returns only a coarse distance band",()=>{const left=located("left",0,0).profile,right=located("right",0,0.06).profile;assert.equal(approximateDistanceBand(left,right),"5–10 km");});
  it("waits 45 seconds before a zero-fee geo fallback",()=>{const service=new MatchmakingService(),random=located("random",0,1);random.profile.gender="Male";service.search(random,()=>0);const seeker=located("seeker",0,0,{gender:"Female",ageMin:20,ageMax:30,radiusKm:10});assert.equal(service.search(seeker,()=>1000).preferenceTimeoutAt,46000);assert.equal(service.result("seeker",()=>45_999).status,"searching");const result=service.result("seeker",()=>46_000,()=>"geo-fallback");assert.equal(result.preferenceFee,0);assert.equal(result.matchMode,"random_fallback");assert.equal(Object.hasOwn(result,"approximateDistance"),false);});
});

describe("browser location privacy",()=>{
  it("asks for location only when called and reuses it for ten minutes",async()=>{const storage=memoryStorage();let calls=0,clock=1000;const geolocation={getCurrentPosition:resolve=>{calls++;resolve({coords:{latitude:19.076,longitude:72.8777}});}};const first=await locationForRadius({storage,geolocation,now:()=>clock});clock+=9*60*1000;const second=await locationForRadius({storage,geolocation,now:()=>clock});assert.deepEqual(second,first);assert.equal(calls,1);});
  it("refreshes an expired location",async()=>{const storage=memoryStorage();let calls=0,clock=1000;const geolocation={getCurrentPosition:resolve=>{calls++;resolve({coords:{latitude:calls,longitude:70}});}};await locationForRadius({storage,geolocation,now:()=>clock});clock+=10*60*1000+1;const refreshed=await locationForRadius({storage,geolocation,now:()=>clock});assert.equal(calls,2);assert.equal(refreshed.latitude,2);});
  it("does not touch geolocation for a non-radius search",async()=>{let locationCalls=0,request;await startMatchSearch({anonymousToken:"anon",accountSession:{access_token:"account"},profile:{age:25},preferences:{gender:"Female"},locationOptions:{storage:memoryStorage(),geolocation:{getCurrentPosition:()=>locationCalls++}},fetcher:async(_url,options)=>{request=JSON.parse(options.body);return Response.json({status:"searching"});}});assert.equal(locationCalls,0);assert.equal(Object.hasOwn(request.profile,"location"),false);});
  it("keeps non-geo filters when permission is denied",async()=>{let request;const result=await startMatchSearch({anonymousToken:"anon",accountSession:{access_token:"account"},profile:{age:25},preferences:{gender:"Female",ageMin:20,ageMax:30,radiusKm:10},locationOptions:{storage:memoryStorage(),geolocation:{getCurrentPosition:(_resolve,reject)=>reject(new Error("denied"))}},fetcher:async(_url,options)=>{request=JSON.parse(options.body);return Response.json({status:"searching"});}});assert.equal(result.locationDenied,true);assert.equal(request.preferences.gender,"Female");assert.equal(Object.hasOwn(request.preferences,"radiusKm"),false);});
});
