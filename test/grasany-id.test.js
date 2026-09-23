import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAuthorizationRequest, normalizeIdentityConfig, portfolioWelcomeUrl, safeReturnPath, validateIdentityClaims } from "../web/js/grasany-id.js";
const config={issuerUrl:"https://id.grasany.example",clientId:"sunoto-web",redirectUri:"https://sunoto.example/auth/callback"};
describe("Grasany ID OAuth boundary",()=>{
  it("builds an exact PKCE authorization request with app attribution",()=>{const url=new URL(createAuthorizationRequest(config,{state:"state_1",nonce:"nonce_1",codeChallenge:"challenge_1",returnPath:"/account",firstConsent:true}));assert.equal(url.origin,"https://id.grasany.example");assert.equal(url.searchParams.get("client_id"),"sunoto-web");assert.equal(url.searchParams.get("app_id"),"sunoto-web");assert.equal(url.searchParams.get("code_challenge_method"),"S256");assert.equal(url.searchParams.get("welcome"),"1");});
  it("rejects arbitrary redirects and preserves only safe in-app routes",()=>{assert.equal(safeReturnPath("https://evil.example"),"/");assert.equal(safeReturnPath("//evil.example"),"/");assert.equal(safeReturnPath("/account"),"/account");});
  it("requires issuer, audience, subject, and nonce agreement",()=>{const claims={iss:config.issuerUrl,aud:config.clientId,sub:"central-subject",nonce:"nonce_1"};assert.equal(validateIdentityClaims(claims,{issuer:config.issuerUrl,audience:config.clientId,nonce:"nonce_1"}),true);assert.equal(validateIdentityClaims({...claims,nonce:"wrong"},{issuer:config.issuerUrl,audience:config.clientId,nonce:"nonce_1"}),false);});
  it("attributes first-consent portfolio handoff without changing the current app route",()=>{assert.equal(portfolioWelcomeUrl("https://grasany.example","sunoto-web"),"https://grasany.example/portfolio?welcome=&app=sunoto-web");});
  it("rejects non-HTTPS issuer and callback configuration",()=>{assert.throws(()=>normalizeIdentityConfig({...config,issuerUrl:"http://id.example"}),/invalid_identity_issuer/);assert.throws(()=>normalizeIdentityConfig({...config,redirectUri:"javascript:alert(1)"}),/invalid_identity_redirect/);});
});
