const SAFE_ROUTE=/^\/(?:#\/)?(?:[a-z0-9-]+(?:\/[a-z0-9-]+)?)?$/i;
const BASE64=/^[A-Za-z0-9_-]+$/;
export const IDENTITY_BRAND_NAME="Grasany ID";
export function normalizeIdentityConfig(config={}){
  const issuer=String(config.issuerUrl||"").replace(/\/$/,"");
  const clientId=String(config.clientId||"").trim();
  const redirectUri=String(config.redirectUri||"").trim();
  if(!/^https:\/\//i.test(issuer)&&!/^http:\/\/localhost(?::\d+)?$/i.test(issuer))throw new Error("invalid_identity_issuer");
  if(!clientId||clientId.length>160)throw new Error("invalid_identity_client");
  if(!/^https:\/\//i.test(redirectUri)&&!/^http:\/\/localhost(?::\d+)?\//i.test(redirectUri))throw new Error("invalid_identity_redirect");
  return{issuer,clientId,redirectUri};
}
export function safeReturnPath(value="/"){const candidate=String(value||"/");return SAFE_ROUTE.test(candidate)&&!candidate.includes("//")?candidate:"/";}
export function createPkceVerifier(randomBytes=crypto.getRandomValues.bind(crypto)){const bytes=randomBytes(new Uint8Array(32));return [...bytes].map(byte=>byte.toString(16).padStart(2,"0")).join("");}
export async function pkceChallenge(verifier){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));let binary="";for(const byte of new Uint8Array(digest))binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
export function createAuthorizationRequest(config,{state,nonce,codeChallenge,returnPath="/",firstConsent=false}={}){const normalized=normalizeIdentityConfig(config);if(!BASE64.test(String(state||""))||!BASE64.test(String(nonce||""))||!BASE64.test(String(codeChallenge||"")))throw new Error("invalid_identity_request_nonce");const url=new URL(`${normalized.issuer}/authorize`);url.searchParams.set("client_id",normalized.clientId);url.searchParams.set("redirect_uri",normalized.redirectUri);url.searchParams.set("response_type","code");url.searchParams.set("scope","openid profile email");url.searchParams.set("state",state);url.searchParams.set("nonce",nonce);url.searchParams.set("code_challenge",codeChallenge);url.searchParams.set("code_challenge_method","S256");url.searchParams.set("app_id",normalized.clientId);url.searchParams.set("return_to",safeReturnPath(returnPath));if(firstConsent)url.searchParams.set("welcome","1");return url.toString();}
export function validateIdentityClaims(claims,{issuer,audience,nonce}={}){if(!claims||claims.iss!==issuer||claims.aud!==audience||claims.nonce!==nonce||typeof claims.sub!=="string"||!claims.sub)return false;return true;}
export function portfolioWelcomeUrl(portfolioOrigin,appId){const url=new URL("/portfolio",portfolioOrigin);url.searchParams.set("welcome","");url.searchParams.set("app",appId);return url.toString();}
