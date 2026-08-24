import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { percentile,probeOptions,summarizeRealtimeResults } from "../load/staging-realtime.mjs";

describe("staging realtime probe",()=>{
  it("requires HTTPS staging endpoints and bounds load",()=>{assert.throws(()=>probeOptions({STAGING_API_URL:"http://api.test/api/v1",STAGING_WEB_ORIGIN:"https://web.test"}),/HTTPS/);assert.throws(()=>probeOptions({STAGING_API_URL:"https://api.test/api/v1",STAGING_WEB_ORIGIN:"https://web.test",REALTIME_PAIRS:"51"}),/1 to 50/);assert.deepEqual(probeOptions({STAGING_API_URL:"https://api.test/api/v1/",STAGING_WEB_ORIGIN:"https://web.test/path"}),{apiUrl:"https://api.test/api/v1",webOrigin:"https://web.test",pairs:1,concurrency:1,timeoutMs:15000});});
  it("calculates truthful aggregate latency and failure metrics",()=>{assert.equal(percentile([40,10,30,20],.95),40);assert.deepEqual(summarizeRealtimeResults([{ok:true,matchMilliseconds:100,upgradeMilliseconds:[20,30],relayMilliseconds:12,reconnected:true},{ok:false,error:"rate limited"}]),{pairsAttempted:2,pairsPassed:1,failures:1,failureRate:.5,matchP95Milliseconds:100,upgradeP95Milliseconds:30,relayP95Milliseconds:12,relayP99Milliseconds:12,reconnectsPassed:1,errors:["rate limited"]});});
  it("exercises signed matching, relay, resume, end and cleanup paths",async()=>{const source=await readFile(new URL("../load/staging-realtime.mjs",import.meta.url),"utf8");for(const value of ["/anonymous/session","/match/search","MESSAGE_RECEIVED","resumeToken","SESSION_END","/match/end","Promise.allSettled"])assert.match(source,new RegExp(value.replace("/","\\/")));});
});
