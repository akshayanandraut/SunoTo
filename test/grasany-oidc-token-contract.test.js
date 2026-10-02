import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyRefreshTokenResponse,createRefreshTokenForm,GRASANY_REQUESTED_SCOPES,validateInitialTokenResponse } from "../worker/src/services/grasanyOidcTokenContract.js";

const fixture=async name=>JSON.parse(await readFile(new URL(`./fixtures/identity/${name}.json`,import.meta.url),"utf8"));

test("central OIDC initial exchange requires persistent-session tokens and all approved scopes",async()=>{
  const payload=await fixture("initial-token-valid");
  assert.equal(validateInitialTokenResponse(payload).refreshToken,"refresh");
  assert.throws(()=>validateInitialTokenResponse({...payload,refresh_token:undefined}),/identity_initial_token_response_incomplete/);
  assert.throws(()=>validateInitialTokenResponse({...payload,scope:"openid email profile"}),/identity_initial_token_response_incomplete/);
});

test("refresh uses refresh_token grant and client id without offline_access",()=>{
  const form=createRefreshTokenForm({refreshToken:"existing",clientId:"sunoto-client"});
  assert.equal(form.get("grant_type"),"refresh_token");
  assert.equal(form.get("refresh_token"),"existing");
  assert.equal(form.get("client_id"),"sunoto-client");
  assert.equal(form.has("scope"),false);
  assert.equal(GRASANY_REQUESTED_SCOPES.includes("offline_access"),false);
  assert.equal(GRASANY_REQUESTED_SCOPES.includes("phone"),false);
});

test("successful refresh atomically rotates a replacement token or retains the current token",async()=>{
  const current={accessToken:"old-access",refreshToken:"old-refresh",userId:"user-1"};
  assert.deepEqual(applyRefreshTokenResponse(current,await fixture("refresh-rotated")),{accessToken:"fixture-new-access-token",refreshToken:"fixture-new-refresh-token",tokenType:"Bearer",expiresIn:120,userId:"user-1"});
  assert.equal(applyRefreshTokenResponse(current,await fixture("refresh-retained")).refreshToken,"old-refresh");
});

test("failed or partial refresh fails closed so callers destroy the product session",async()=>{
  const current={accessToken:"old-access",refreshToken:"old-refresh"};
  const failed=await fixture("refresh-failed");
  assert.throws(()=>applyRefreshTokenResponse(current,failed),/identity_refresh_failed_destroy_session/);
  assert.throws(()=>applyRefreshTokenResponse(current,{httpStatus:200,payload:{refresh_token:"replacement"}}),/identity_refresh_failed_destroy_session/);
});
