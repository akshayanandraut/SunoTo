import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DailyAccessService } from "../worker/src/services/DailyAccessService.js";

describe("daily access service",()=>{
  it("uses only the privileged transactional RPC",async()=>{let request;const service=new DailyAccessService({url:"https://project.supabase.co",serviceKey:"service",fetcher:async(url,options)=>{request={url,options};return Response.json([{balance:9800,idempotent:false,ends_at:"2026-08-26T18:30:00Z"}]);}});const result=await service.activate({userId:"user-1",activationTime:"2026-08-25T12:00:00Z"});assert.equal(result.balance,9800);assert.match(request.url,/rpc\/activate_daily_access$/);assert.equal(request.options.headers.authorization,"Bearer service");assert.equal(JSON.parse(request.options.body).target_user_id,"user-1");});
});

describe("phase 11 database safeguards",()=>{
  it("charges once under a lock and encodes midnight IST plus 10 PM grace",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608250002_phase11_daily_access.sql",import.meta.url),"utf8");assert.match(sql,/pg_advisory_xact_lock/i);assert.match(sql,/Asia\/Kolkata/i);assert.match(sql,/time '22:00'/i);assert.match(sql,/local_day\+2/i);assert.match(sql,/-200,'daily_access'/i);assert.match(sql,/unique\(user_id,access_day\)/i);assert.match(sql,/entry_type='payment_credit'/i);assert.match(sql,/email_confirmed_at is not null/i);assert.match(sql,/grant execute on function public\.activate_daily_access[\s\S]*service_role/i);assert.doesNotMatch(sql,/create table(?: if not exists)? public\.messages/i);});
});
