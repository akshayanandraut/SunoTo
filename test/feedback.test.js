import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FeedbackService } from "../worker/src/services/FeedbackService.js";
import { AdminService } from "../worker/src/services/AdminService.js";
import worker from "../worker/src/index.js";

describe("feedback submissions",()=>{
  it("stores anonymous or account-linked feedback via the REST API",async()=>{let call;const service=new FeedbackService({SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"service"},async(url,options)=>{call={url,body:JSON.parse(options.body)};return Response.json([{id:"feedback-1",account_user_id:null,message:"Add dark mode",created_at:"now"}]);});const result=await service.submit({accountUserId:null,message:"Add dark mode"});assert.match(call.url,/\/feedback$/);assert.deepEqual(call.body,{account_user_id:null,message:"Add dark mode"});assert.equal(result.id,"feedback-1");});
  it("uses an audited RPC for feedback status transitions",async()=>{let call;const service=new AdminService({SUPABASE_URL:"https://project",SUPABASE_SERVICE_ROLE_KEY:"service"},async(url,options)=>{call={url,body:JSON.parse(options.body)};return Response.json({status:"planned"});});await service.updateFeedback({adminId:"admin",id:"feedback-1",status:"planned"});assert.match(call.url,/rpc\/admin_update_feedback$/);assert.deepEqual(call.body,{admin_id:"admin",target_id:"feedback-1",new_status:"planned"});});
  it("defines RLS, an audited status RPC and a service-role insert grant",async()=>{const sql=await readFile(new URL("../supabase/migrations/202608260004_feedback.sql",import.meta.url),"utf8");assert.match(sql,/enable row level security/i);assert.match(sql,/admin_update_feedback/i);assert.match(sql,/insert into public\.admin_audit/i);assert.match(sql,/grant insert on public\.feedback to service_role/i);});
  it("rejects short or missing feedback messages over the public API",async()=>{const response=await worker.fetch(new Request("https://api.example.test/api/v1/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:"short"})}),{});assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:"invalid_feedback"});});
});
