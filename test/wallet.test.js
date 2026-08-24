import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WalletService } from "../worker/src/services/WalletService.js";

describe("wallet service boundary",()=>{
  it("sends integer entries only through the privileged atomic RPC",async()=>{let request;const service=new WalletService({url:"https://project.supabase.co",serviceKey:"secret-key",fetcher:async(url,options)=>{request={url,options};return Response.json([{ledger_id:1,balance:900,idempotent:false}]);}});const result=await service.apply({userId:"user-1",delta:-100,type:"test_debit",reason:"test",idempotencyKey:"test-key-123"});assert.equal(result.balance,900);assert.equal(request.url,"https://project.supabase.co/rest/v1/rpc/apply_wallet_entry");assert.equal(request.options.headers.authorization,"Bearer secret-key");assert.equal(JSON.parse(request.options.body).credit_delta,-100);});
  it("rejects zero, floating-point and unsafe deltas before the database",async()=>{const service=new WalletService({});await assert.rejects(()=>service.apply({delta:0,idempotencyKey:"valid-key"}),/invalid_wallet_delta/);await assert.rejects(()=>service.apply({delta:1.5,idempotencyKey:"valid-key"}),/invalid_wallet_delta/);await assert.rejects(()=>service.apply({delta:Number.MAX_SAFE_INTEGER+1,idempotencyKey:"valid-key"}),/invalid_wallet_delta/);});
  it("returns an idempotent replay without changing semantics",async()=>{const service=new WalletService({url:"https://project",serviceKey:"secret",fetcher:async()=>Response.json([{ledger_id:5,balance:1000,idempotent:true}])});assert.equal((await service.apply({userId:"u",delta:1000,type:"credit",reason:"test",idempotencyKey:"replay-key"})).idempotent,true);});
});

describe("wallet migration safeguards",()=>{
  it("uses row locks, non-negative balances and a unique idempotency key",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608240002_phase8_wallet.sql",import.meta.url),"utf8");assert.match(sql,/balance bigint not null default 0 check \(balance >= 0\)/i);assert.match(sql,/idempotency_key text not null unique/i);assert.match(sql,/for update/i);assert.match(sql,/grant execute on function public\.apply_wallet_entry[\s\S]*to service_role/i);assert.match(sql,/revoke all on function public\.apply_wallet_entry[\s\S]*authenticated/i);assert.doesNotMatch(sql,/create table(?: if not exists)? public\.messages/i);});
});
