import assert from "node:assert/strict";
import test from "node:test";
import { createDeterministicGrasanyProvider } from "./support/deterministicGrasanyProvider.js";
import { createOidcTransaction,createPkceChallenge,fetchOidcMetadata,getGrasanyIdentityReadiness,isIdentityProtectedApiPath,safeIdentityReturnTo,verifyGrasanyIdToken } from "../worker/src/auth/grasanyOidc.js";

test("central packet disables login even when untrusted environment values are supplied",()=>{
  const readiness=getGrasanyIdentityReadiness({GRASANY_OIDC_ISSUER:"https://wrong.example",GRASANY_OIDC_CLIENT_ID:"attacker-client",GRASANY_OIDC_REDIRECT_URI:"https://attacker.example/callback",GRASANY_OIDC_TOKEN_ENCRYPTION_KEY:"private-value",IDENTITY_SESSIONS:{}});
  assert.equal(readiness.enabled,false);
  assert.equal(readiness.packetSchemaVersion,2);
  assert.ok(readiness.errors.includes("issuer_not_in_central_packet"));
  assert.ok(readiness.errors.includes("client_not_registered"));
  assert.ok(readiness.errors.includes("callback_not_registered"));
  assert.doesNotMatch(JSON.stringify(readiness),/private-value|attacker-client/);
});

test("safe return-to accepts same-origin routes only",()=>{
  assert.equal(safeIdentityReturnTo("/account"),"/account");
  assert.equal(safeIdentityReturnTo("//attacker.example/path"),"/");
  assert.equal(safeIdentityReturnTo("https://attacker.example/path"),"/");
  assert.equal(safeIdentityReturnTo("/\\\\attacker.example"),"/");
  assert.equal(safeIdentityReturnTo("/%5c%5cattacker.example"),"/");
  assert.equal(safeIdentityReturnTo("/account%0d%0aLocation:https://attacker.example"),"/");
});

test("identity gate distinguishes account APIs from anonymous matching and public reads",()=>{
  for(const [method,path] of [["GET","/api/v1/wallet"],["POST","/api/v1/payments/orders"],["POST","/api/v1/games/wheel/spin"],["GET","/api/v1/me/profile"],["POST","/api/v1/live-world/claim-session"]])assert.equal(isIdentityProtectedApiPath(method,path),true,`${method} ${path}`);
  for(const [method,path] of [["POST","/api/v1/match/search"],["POST","/api/v1/reconnect/request"],["GET","/api/v1/config/public"],["GET","/api/v1/stats/public"]])assert.equal(isIdentityProtectedApiPath(method,path),false,`${method} ${path}`);
});

test("backend PKCE transactions use high-entropy state, nonce and S256 verifier",async()=>{
  const transaction=createOidcTransaction({returnTo:"/account"}),challenge=await createPkceChallenge(transaction.verifier);
  assert.equal(transaction.state.length,43);
  assert.equal(transaction.nonce.length,43);
  assert.equal(transaction.verifier.length,43);
  assert.equal(challenge.length,43);
  assert.equal(transaction.returnTo,"/account");
});

test("deterministic local provider discovery and signed ID tokens conform to issuer/audience/nonce/time checks",async()=>{
  const provider=await createDeterministicGrasanyProvider(),metadata=await fetchOidcMetadata(provider.fetcher);
  const token=await provider.signIdToken({nonce:"test-nonce"});
  const verified=await verifyGrasanyIdToken(token,{jwks:provider.jwks,audience:provider.clientId,nonce:"test-nonce",nowSeconds:Math.floor(Date.now()/1000)});
  assert.equal(metadata.issuer,provider.issuer);
  assert.equal(verified.subject,"local-test-subject-1");
  assert.equal(verified.centralAdmin,false);
});

test("ID token validation rejects bad signature, issuer, audience, azp, nonce and timestamps",async()=>{
  const provider=await createDeterministicGrasanyProvider(),valid={jwks:provider.jwks,audience:provider.clientId,nonce:"expected-nonce",nowSeconds:Math.floor(Date.now()/1000)};
  const rejected=async options=>assert.rejects(()=>verifyGrasanyIdToken(options.token,{...valid,...options.config}),/identity_/);
  const token=await provider.signIdToken({nonce:"expected-nonce"});
  await rejected({token:`${token.slice(0,-1)}${token.endsWith("A")?"B":"A"}`});
  await rejected({token:await provider.signIdToken({nonce:"expected-nonce",issuer:"https://wrong.example"})});
  await rejected({token:await provider.signIdToken({nonce:"expected-nonce",audience:"wrong-client"})});
  await rejected({token:await provider.signIdToken({nonce:"expected-nonce",audience:[provider.clientId,"other-client"]})});
  await rejected({token:await provider.signIdToken({nonce:"wrong-nonce"})});
  await rejected({token:await provider.signIdToken({nonce:"expected-nonce",exp:1})});
  await rejected({token:await provider.signIdToken({nonce:"expected-nonce",iat:Math.floor(Date.now()/1000)+600})});
});
