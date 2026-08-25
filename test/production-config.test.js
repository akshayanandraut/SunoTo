import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { validateProductionConfig } from "../scripts/validate-production-config.mjs";

const valid={VITE_API_BASE_URL:"https://api.random.in/api/v1",VITE_SUPABASE_URL:"https://project.supabase.co",VITE_SUPABASE_ANON_KEY:"public-anon-value",SUPABASE_URL:"https://project.supabase.co",SUPABASE_PUBLISHABLE_KEY:"publishable-value",SUPABASE_SERVICE_ROLE_KEY:"service-value",RAZORPAY_KEY_ID:"rzp_live_value",RAZORPAY_KEY_SECRET:"razorpay-secret",RAZORPAY_WEBHOOK_SECRET:"webhook-secret",ANON_SESSION_SECRET:"a".repeat(32),ADMIN_USER_ID:"123e4567-e89b-42d3-a456-426614174000",ADMIN_REQUIRE_AAL2:"true",ALLOWED_ORIGIN:"https://chat.random.in",GRIEVANCE_OFFICER_NAME:"Named Officer",GRIEVANCE_EMAIL:"grievance@random.in",SMTP_VERIFIED_AT:"2026-08-25T10:00:00Z",LEGAL_APPROVAL_REFERENCE:"LEGAL-2026-001",RELEASE_REVISION:"a".repeat(40)};
describe("production configuration gate",()=>{
  it("accepts a complete non-placeholder configuration",()=>assert.deepEqual(validateProductionConfig(valid),{ok:true,errors:[]}));
  it("fails closed on placeholders, HTTP origins and disabled admin MFA",()=>{const result=validateProductionConfig({...valid,SUPABASE_SERVICE_ROLE_KEY:"replace-me",ALLOWED_ORIGIN:"http://example.in",ADMIN_REQUIRE_AAL2:"false",SMTP_VERIFIED_AT:"not-yet"});assert.equal(result.ok,false);assert.match(result.errors.join("\n"),/placeholder/);assert.match(result.errors.join("\n"),/HTTPS/);assert.match(result.errors.join("\n"),/AAL2/);assert.match(result.errors.join("\n"),/ISO date/);});
  it("rejects a local frontend API or mismatched Supabase project",()=>{const result=validateProductionConfig({...valid,VITE_API_BASE_URL:"http://127.0.0.1:8787/api/v1",VITE_SUPABASE_URL:"https://other.supabase.co"});assert.equal(result.ok,false);assert.match(result.errors.join("\n"),/VITE_API_BASE_URL/);assert.match(result.errors.join("\n"),/must match/);});
});
