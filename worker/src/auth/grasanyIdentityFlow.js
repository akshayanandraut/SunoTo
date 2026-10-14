import { GRASANY_OIDC_PACKET, createOidcTransaction, createPkceChallenge, decryptIdentityTokens, encryptIdentityTokens, fetchOidcMetadata, getGrasanyIdentityReadiness, identityUnavailableResponse, safeIdentityReturnTo, validateOidcInitialTokenResponse, verifyGrasanyIdToken } from "./grasanyOidc.js";
import { identityStore } from "./identityStore.js";

const SESSION_COOKIE="__Host-sunoto_session";
const SESSION_TTL_MS=8*60*60*1000;
const REFRESH_SKEW_MS=60_000;
const encoder=new TextEncoder();
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{"cache-control":"no-store",...headers}});
function randomOpaqueId(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function cookieValue(request,name=SESSION_COOKIE){const header=request.headers.get("cookie")||"";let value=null;for(const part of header.split(";")){const index=part.indexOf("=");if(index<0||part.slice(0,index).trim()!==name)continue;if(value!==null)return null;try{value=decodeURIComponent(part.slice(index+1).trim());}catch{return null;}if(!value||value.length>256||/[\s\u0000-\u001f\u007f]/.test(value))return null;}return value;}
function setSessionCookie(value,maxAge=Math.floor(SESSION_TTL_MS/1000)){return`${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;}
function clearSessionCookie(){return`${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;}
function isSameOriginMutation(request){const origin=request.headers.get("origin");return Boolean(origin&&origin!=="null"&&origin===new URL(request.url).origin);}
function sameSecret(a,b){if(typeof a!=="string"||typeof b!=="string")return false;const max=Math.max(a.length,b.length);let diff=a.length^b.length;for(let i=0;i<max;i++)diff|=(a.charCodeAt(i%Math.max(1,a.length))||0)^(b.charCodeAt(i%Math.max(1,b.length))||0);return diff===0;}
function rowRecord(result){if(!result?.payload)return null;try{return JSON.parse(result.payload);}catch{return null;}}
function tokenRequestHeaders(){return{"content-type":"application/x-www-form-urlencoded","accept":"application/json"};}
function runtimeConfig(env){return{issuer:env.GRASANY_OIDC_ISSUER,clientId:env.GRASANY_OIDC_CLIENT_ID,redirectUri:env.GRASANY_OIDC_REDIRECT_URI,encryptionKey:env.GRASANY_OIDC_TOKEN_ENCRYPTION_KEY};}

export function grasanyAuthHealth(env={}){return getGrasanyIdentityReadiness(env);}

export async function beginGrasanyLogin(request,env,{fetcher=env.IDENTITY_FETCHER||env.FETCHER||fetch}={}){
  const readiness=getGrasanyIdentityReadiness(env);if(!readiness.enabled)return identityUnavailableResponse();
  const config=runtimeConfig(env),url=new URL(request.url),transaction=createOidcTransaction({returnTo:url.searchParams.get("return_to")||"/"});
  let metadata,challenge;
  try{[metadata,challenge]=await Promise.all([fetchOidcMetadata(fetcher),createPkceChallenge(transaction.verifier)]);}catch{return json({error:"identity_provider_unavailable"},503);}
  const expiresAt=transaction.createdAt+10*60*1000;
  const sealed=await encryptIdentityTokens(transaction,config.encryptionKey);
  const stored=await identityStore.createPending(env,transaction.state,{encrypted:sealed,expiresAt});
  if(stored.status>=400)return identityUnavailableResponse();
  const authorize=new URL(metadata.authorizationEndpoint);
  for(const [key,value] of Object.entries({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:"code",scope:GRASANY_OIDC_PACKET.scopes.join(" "),state:transaction.state,nonce:transaction.nonce,code_challenge:challenge,code_challenge_method:"S256"}))authorize.searchParams.set(key,value);
  return Response.redirect(authorize.toString(),302);
}

export async function completeGrasanyCallback(request,env,{fetcher=env.IDENTITY_FETCHER||env.FETCHER||fetch,now=Date.now()}={}){
  const readiness=getGrasanyIdentityReadiness(env);if(!readiness.enabled)return identityUnavailableResponse();
  const url=new URL(request.url),codes=url.searchParams.getAll("code"),states=url.searchParams.getAll("state"),errors=url.searchParams.getAll("error");
  if(codes.length!==1||states.length!==1||errors.length>1||errors.length)return json({error:"identity_callback_invalid"},400,{"set-cookie":clearSessionCookie()});
  const [code]=codes,[state]=states;if(!code||code.length>4096||!state||state.length>128)return json({error:"identity_callback_invalid"},400,{"set-cookie":clearSessionCookie()});
  const pendingResult=await identityStore.consumePending(env,state),pendingEnvelope=rowRecord(pendingResult);
  if(!pendingEnvelope?.encrypted||pendingEnvelope.expiresAt<=now)return json({error:"identity_transaction_expired"},400,{"set-cookie":clearSessionCookie()});
  let transaction;
  try{transaction=await decryptIdentityTokens(pendingEnvelope.encrypted,env.GRASANY_OIDC_TOKEN_ENCRYPTION_KEY);}catch{return json({error:"identity_transaction_invalid"},400,{"set-cookie":clearSessionCookie()});}
  if(transaction.state!==state||now-transaction.createdAt>10*60*1000)return json({error:"identity_transaction_expired"},400,{"set-cookie":clearSessionCookie()});
  const config=runtimeConfig(env);let metadata;
  try{metadata=await fetchOidcMetadata(fetcher);}catch{return json({error:"identity_provider_unavailable"},503,{"set-cookie":clearSessionCookie()});}
  const body=new URLSearchParams({grant_type:"authorization_code",code,client_id:config.clientId,redirect_uri:config.redirectUri,code_verifier:transaction.verifier});let tokenResponse;
  try{tokenResponse=await fetcher(metadata.tokenEndpoint,{method:"POST",headers:tokenRequestHeaders(),body});}catch{return json({error:"identity_provider_unavailable"},503,{"set-cookie":clearSessionCookie()});}
  if(!tokenResponse.ok)return json({error:"identity_code_exchange_failed"},401,{"set-cookie":clearSessionCookie()});
  const tokenPayload=await tokenResponse.json().catch(()=>null);let tokens;
  try{tokens=validateOidcInitialTokenResponse(tokenPayload);}catch{return json({error:"identity_token_response_invalid"},401,{"set-cookie":clearSessionCookie()});}
  let jwksResponse;try{jwksResponse=await fetcher(metadata.jwksUri,{headers:{accept:"application/json"}});}catch{return json({error:"identity_provider_unavailable"},503,{"set-cookie":clearSessionCookie()});}
  if(!jwksResponse.ok)return json({error:"identity_signing_keys_unavailable"},503,{"set-cookie":clearSessionCookie()});
  let verified;try{verified=await verifyGrasanyIdToken(tokens.idToken,{jwks:await jwksResponse.json().catch(()=>null),issuer:metadata.issuer,audience:config.clientId,nonce:transaction.nonce});}catch{return json({error:"identity_token_validation_failed"},401,{"set-cookie":clearSessionCookie()});}
  const sessionId=randomOpaqueId(),csrfToken=randomOpaqueId(),record={
    version:1,subject:verified.subject,email:typeof verified.claims.email==="string"?verified.claims.email:null,
    emailVerified:verified.claims.email_verified===true,centralAdmin:false,csrfToken,tokenEnvelope:await encryptIdentityTokens(tokens,config.encryptionKey),
    createdAt:now,accessExpiresAt:tokens.expiresAt,expiresAt:now+SESSION_TTL_MS
  };
  const saved=await identityStore.createSession(env,sessionId,record);
  if(saved.status>=400)return identityUnavailableResponse();
  const destination=new URL(safeIdentityReturnTo(transaction.returnTo),url.origin);
  return new Response(null,{status:303,headers:{location:destination.toString(),"set-cookie":setSessionCookie(sessionId),"cache-control":"no-store"}});
}

async function refreshSessionTokens(request,env,sessionId,row,record,{fetcher=env.IDENTITY_FETCHER||env.FETCHER||fetch,now=Date.now()}={}){
  const refreshId=randomOpaqueId(),claim=await identityStore.claimRefresh(env,sessionId,refreshId,now);
  if(!claim.claimed){if(claim.status===409)return{response:json({error:"identity_refresh_in_progress"},503,{"retry-after":"2"})};return{response:json({error:"identity_session_expired"},401,{"set-cookie":clearSessionCookie()})};}
  const claimed=rowRecord(claim);if(!claimed)return{response:json({error:"identity_session_invalid"},401,{"set-cookie":clearSessionCookie()})};
  try{
    const tokens=await decryptIdentityTokens(claimed.tokenEnvelope,env.GRASANY_OIDC_TOKEN_ENCRYPTION_KEY);
    if(!tokens.refreshToken)throw new Error("refresh_token_missing");
    const metadata=await fetchOidcMetadata(fetcher),config=runtimeConfig(env),body=new URLSearchParams({grant_type:"refresh_token",refresh_token:tokens.refreshToken,client_id:config.clientId});
    const response=await fetcher(metadata.tokenEndpoint,{method:"POST",headers:tokenRequestHeaders(),body});
    if(!response.ok)throw new Error("identity_refresh_rejected");
    const next=await response.json().catch(()=>null);
    if(!next||typeof next.access_token!=="string"||!next.access_token||String(next.token_type).toLowerCase()!=="bearer"||!Number.isFinite(next.expires_in)||next.expires_in<=0)throw new Error("identity_refresh_response_invalid");
    const replacement=typeof next.refresh_token==="string"&&next.refresh_token.trim()?next.refresh_token:tokens.refreshToken;
    const rotated={...tokens,accessToken:next.access_token,refreshToken:replacement,tokenType:"Bearer",expiresAt:now+next.expires_in*1000,scope:typeof next.scope==="string"?next.scope:tokens.scope};
    const updated={...claimed,tokenEnvelope:await encryptIdentityTokens(rotated,env.GRASANY_OIDC_TOKEN_ENCRYPTION_KEY),accessExpiresAt:rotated.expiresAt};
    const saved=await identityStore.completeRefresh(env,sessionId,refreshId,updated);
    if(!saved.stored)throw new Error("identity_refresh_state_conflict");
    return{record:updated};
  }catch{
    await identityStore.deleteSession(env,sessionId);
    return{response:json({error:"identity_reauthentication_required"},401,{"set-cookie":clearSessionCookie()})};
  }
}

export async function readGrasanySession(request,env,options={}){
  if(!getGrasanyIdentityReadiness(env).enabled)return identityUnavailableResponse();
  const now=options.now??Date.now(),sessionId=cookieValue(request);if(!sessionId)return json({authenticated:false});
  const row=await identityStore.getSession(env,sessionId),record=rowRecord(row);
  if(!record||record.expiresAt<=now)return json({authenticated:false},401,{"set-cookie":clearSessionCookie()});
  let active=record;
  if(record.accessExpiresAt<=now+REFRESH_SKEW_MS){
    const refreshed=await refreshSessionTokens(request,env,sessionId,row,record,{...options,now});if(refreshed.response)return refreshed.response;active=refreshed.record;
  }
  return json({authenticated:true,provider:"grasany_id",user:{id:active.subject,email:active.email,emailVerified:active.emailVerified},csrfToken:active.csrfToken,productAccount:{status:"service_not_configured"},authorization:{roles:[],entitlements:[]}});
}

export async function getGrasanyPrincipal(request,env,options={}){
  if(!getGrasanyIdentityReadiness(env).enabled)return{error:"identity_service_not_configured"};
  const now=options.now??Date.now(),sessionId=cookieValue(request);if(!sessionId)return null;
  const row=await identityStore.getSession(env,sessionId),record=rowRecord(row);
  if(!record||record.expiresAt<=now)return null;
  let active=record;
  if(record.accessExpiresAt<=now+REFRESH_SKEW_MS){
    const refreshed=await refreshSessionTokens(request,env,sessionId,row,record,{...options,now});if(refreshed.response)return{error:"identity_session_unavailable",response:refreshed.response};active=refreshed.record;
  }
  return{subject:active.subject,claims:{sub:active.subject,email:active.email,email_verified:active.emailVerified},csrfToken:active.csrfToken,sessionId};
}

export async function verifyIdentityCsrf(request,env){
  if(!isSameOriginMutation(request))return false;
  const principal=await getGrasanyPrincipal(request,env);if(!principal)return false;
  return sameSecret(request.headers.get("x-csrf-token"),principal.csrfToken);
}

export async function logoutGrasanySession(request,env){
  if(!isSameOriginMutation(request))return json({error:"origin_not_allowed"},403,{"set-cookie":clearSessionCookie()});
  const sessionId=cookieValue(request);
  if(sessionId){
    if(getGrasanyIdentityReadiness(env).enabled&&!await verifyIdentityCsrf(request,env))return json({error:"csrf_validation_failed"},403);
    try{await identityStore.deleteSession(env,sessionId);}catch{}
  }
  // The central packet has no revocation endpoint. Destroy local session state
  // and clear the cookie; do not guess an upstream revocation URL.
  return new Response(null,{status:204,headers:{"set-cookie":clearSessionCookie(),"cache-control":"no-store"}});
}

export const identityCookieName=SESSION_COOKIE;
