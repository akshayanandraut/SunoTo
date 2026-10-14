import { GRASANY_REQUESTED_SCOPES } from "../services/grasanyOidcTokenContract.js";

// Central packet schemaVersion 2, commit 8d6f18a9000eb736a11ecc789a097cab7bc0f7d9.
// Keep these values fail-closed until a regenerated packet provisions each item.
export const GRASANY_OIDC_PACKET=Object.freeze({
  enabled:false,
  issuer:"https://grtjbgksspckvtrvwwbm.supabase.co/auth/v1",
  discoveryUrl:"https://grtjbgksspckvtrvwwbm.supabase.co/auth/v1/.well-known/openid-configuration",
  authorizationEndpoint:"https://grtjbgksspckvtrvwwbm.supabase.co/auth/v1/oauth/authorize",
  clientId:null,
  callbacks:Object.freeze([]),
  proposedOrigin:"https://sunoto.grasany.com",
  proposedCallback:"https://sunoto.grasany.com/auth/callback",
  acceptance:Object.freeze({login:false,callback:false,sessionReload:false,refresh:false,logout:false,revocation:false}),
  revocationEndpoint:null,
  centralAdminClaim:null,
  scopes:GRASANY_REQUESTED_SCOPES
});

const OIDC_VARS=Object.freeze(["GRASANY_OIDC_ISSUER","GRASANY_OIDC_CLIENT_ID","GRASANY_OIDC_REDIRECT_URI","GRASANY_OIDC_TOKEN_ENCRYPTION_KEY"]);
const REQUIRED_ACCEPTANCE=Object.freeze(["login","callback","sessionReload","refresh","logout"]);
const toBase64Url=bytes=>{const value=new Uint8Array(bytes);let binary="";for(let offset=0;offset<value.length;offset+=0x8000)binary+=String.fromCharCode(...value.subarray(offset,offset+0x8000));return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");};
const fromBase64Url=value=>{if(typeof value!=="string"||!/^[-_A-Za-z0-9]+$/.test(value))throw new Error("invalid_base64url");const binary=atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4));return Uint8Array.from(binary,char=>char.charCodeAt(0));};
const encodeJson=value=>toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
const decodeJson=value=>JSON.parse(new TextDecoder().decode(fromBase64Url(value)));
const randomToken=(cryptoApi=globalThis.crypto)=>{const bytes=new Uint8Array(32);cryptoApi.getRandomValues(bytes);return toBase64Url(bytes);};

export function safeIdentityReturnTo(value,origin="https://sunoto.grasany.com"){
  if(typeof value!=="string"||!value.startsWith("/")||value.startsWith("//")||/[\\\u0000-\u001f\u007f]/.test(value)||/%(?:5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value))return "/";
  try{const target=new URL(value,origin);if(target.origin!==origin||target.username||target.password||/[\\\u0000-\u001f\u007f]/.test(target.pathname))return "/";return`${target.pathname}${target.search}${target.hash}`;}catch{return "/";}
}

function decodeEncryptionKey(value){
  if(!value)return null;
  try{const bytes=fromBase64Url(value);return bytes.byteLength===32?bytes:null;}catch{return null;}
}

export function getGrasanyIdentityReadiness(env={}){
  const errors=[],blockers=[];
  const issuer=env.GRASANY_OIDC_ISSUER;
  const clientId=env.GRASANY_OIDC_CLIENT_ID;
  const redirectUri=env.GRASANY_OIDC_REDIRECT_URI;
  const encryptionKey=decodeEncryptionKey(env.GRASANY_OIDC_TOKEN_ENCRYPTION_KEY);
  for(const name of OIDC_VARS.slice(0,3))if(typeof env[name]!=="string"||!env[name].trim())blockers.push(`runtime_${name.toLowerCase()}_missing`);
  if(issuer&&issuer!==GRASANY_OIDC_PACKET.issuer)errors.push("issuer_not_in_central_packet");
  if(clientId&&(!GRASANY_OIDC_PACKET.clientId||clientId!==GRASANY_OIDC_PACKET.clientId))errors.push("client_not_registered");
  if(redirectUri&&!GRASANY_OIDC_PACKET.callbacks.includes(redirectUri))errors.push("callback_not_registered");
  if(env.GRASANY_OIDC_TOKEN_ENCRYPTION_KEY&&!encryptionKey)errors.push("token_encryption_key_invalid");
  if(!GRASANY_OIDC_PACKET.enabled)blockers.push("central_oidc_disabled");
  if(!GRASANY_OIDC_PACKET.clientId)blockers.push("client_registration_missing");
  if(!GRASANY_OIDC_PACKET.callbacks.length)blockers.push("callback_not_registered");
  for(const acceptance of REQUIRED_ACCEPTANCE)if(GRASANY_OIDC_PACKET.acceptance[acceptance]!==true)blockers.push(`acceptance_${acceptance}_pending`);
  if(!env.IDENTITY_SESSIONS)blockers.push("identity_session_store_missing");
  if(!encryptionKey)blockers.push("token_encryption_key_missing");
  return Object.freeze({
    enabled:errors.length===0&&blockers.length===0,
    status:errors.length?"misconfigured":blockers.length?"not_configured":"ready",
    provider:"grasany_oidc",
    packetSchemaVersion:2,
    packetCommit:"8d6f18a9000eb736a11ecc789a097cab7bc0f7d9",
    issuer:GRASANY_OIDC_PACKET.issuer,
    scopes:GRASANY_OIDC_PACKET.scopes,
    errors:Object.freeze(errors),
    blockers:Object.freeze(blockers),
    productSupabaseAdapter:"disabled",
    productAccountApiEnabled:false,
    productAccountStatus:"service_not_configured",
    centralAdmin:"unprovisioned",
    administrativeBlockers:Object.freeze([...(GRASANY_OIDC_PACKET.centralAdminClaim?[]:["central_admin_claim_unprovisioned"])]),
    revocation:GRASANY_OIDC_PACKET.revocationEndpoint?"configured":"local_logout_only"
  });
}

export function identityUnavailableResponse(){return Response.json({error:"identity_service_not_configured",message:"Grasany ID is not configured for this product."},{status:503,headers:{"retry-after":"300"}});}

export function isIdentityProtectedApiPath(method,path){
  if(path.startsWith("/api/v1/admin/")||path.startsWith("/api/v1/me/"))return true;
  const exact=new Set([
    "/api/v1/feedback","/api/v1/avatar","/api/v1/username","/api/v1/theme","/api/v1/account/device/claim",
    "/api/v1/wallet","/api/v1/wallet/ledger","/api/v1/payments/orders","/api/v1/payments/verify",
    "/api/v1/membership/order","/api/v1/membership/verify","/api/v1/membership/redeem-sparks","/api/v1/membership/auto-debit",
    "/api/v1/streaming-membership/subscribe","/api/v1/streaming-membership/verify","/api/v1/streaming-membership/status",
    "/api/v1/verification/request","/api/v1/recording/start","/api/v1/sports/bet","/api/v1/sports/my-bets","/api/v1/sports/opt-in",
    "/api/v1/store/catalog","/api/v1/store/equip","/api/v1/store/inventory","/api/v1/store/purchase","/api/v1/ad-earning/claim",
    "/api/v1/guest-win/claim","/api/v1/games/daily-usage","/api/v1/games/daily-streak/status",
    "/api/v1/games/wheel/odds","/api/v1/games/wheel/leaderboard","/api/v1/games/jackpot/current",
    "/api/v1/games/jackpot/leaderboard","/api/v1/games/trivia/leaderboard","/api/v1/games/reflex/tiers",
    "/api/v1/games/coin-flip/odds","/api/v1/games/coin-flip/leaderboard","/api/v1/games/coin-tower/odds",
    "/api/v1/games/coin-tower/leaderboard","/api/v1/games/scratch-card/odds","/api/v1/games/scratch-card/leaderboard",
    "/api/v1/games/slots-777/symbols","/api/v1/games/streak-ladder/odds","/api/v1/games/streak-ladder/leaderboard",
    "/api/v1/games/wheel/spin","/api/v1/games/jackpot/buy","/api/v1/games/trivia/submit","/api/v1/games/roulette/spin",
    "/api/v1/games/coin-flip/play","/api/v1/games/coin-tower/play","/api/v1/games/daily-streak/claim","/api/v1/games/reflex/play",
    "/api/v1/games/scratch-card/play","/api/v1/games/slots-777/play","/api/v1/games/streak-ladder/start",
    "/api/v1/games/streak-ladder/climb","/api/v1/games/streak-ladder/cashout","/api/v1/party-rooms","/api/v1/party-rooms/join",
    "/api/v1/live-world/place","/api/v1/live-world/nearby","/api/v1/live-world/chat-requests","/api/v1/live-world/claim-session",
    "/api/v1/live-world/opt-in","/api/v1/live-world/opt-out"
  ]);
  if(exact.has(path))return true;
  if(method==="POST"&&/^\/api\/v1\/party-rooms\/[0-9a-fA-F-]{36}\/(?:invite|claim-host|radio\/tracks)$/.test(path))return true;
  if(/^\/api\/v1\/live-world\/chat-requests\/[0-9a-fA-F-]{36}\/respond$/.test(path))return true;
  return false;
}

export function containsLegacyBrowserIdentity(request,url=new URL(request.url)){
  const authorization=request.headers.get("authorization")||"",accountAuthorization=request.headers.get("x-account-authorization")||"",queryToken=url.searchParams.get("accountToken")||"";
  const looksLikeJwt=value=>value.startsWith("Bearer ")&&value.slice(7).split(".").length===3;
  return looksLikeJwt(authorization)||looksLikeJwt(accountAuthorization)||queryToken.split(".").length===3;
}

export function createOidcTransaction({returnTo="/",cryptoApi=globalThis.crypto}={}){
  const verifier=randomToken(cryptoApi),state=randomToken(cryptoApi),nonce=randomToken(cryptoApi);
  return{state,nonce,verifier,returnTo:safeIdentityReturnTo(returnTo),createdAt:Date.now()};
}

export async function createPkceChallenge(verifier,cryptoApi=globalThis.crypto){
  const digest=await cryptoApi.subtle.digest("SHA-256",new TextEncoder().encode(verifier));return toBase64Url(digest);
}

export async function fetchOidcMetadata(fetcher=fetch){
  const response=await fetcher(GRASANY_OIDC_PACKET.discoveryUrl,{headers:{accept:"application/json"}});
  if(!response.ok)throw new Error("identity_discovery_unavailable");
  const metadata=await response.json(),issuer=new URL(GRASANY_OIDC_PACKET.issuer),endpoints=[metadata.authorization_endpoint,metadata.token_endpoint,metadata.jwks_uri];
  if(metadata.issuer!==issuer.toString()||endpoints.some(value=>{try{const url=new URL(value);return url.protocol!=="https:"||url.origin!==issuer.origin||!url.pathname.startsWith(issuer.pathname+"/");}catch{return true;}}))throw new Error("identity_discovery_contract_invalid");
  if(!metadata.response_types_supported?.includes("code")||!metadata.code_challenge_methods_supported?.includes("S256")||!metadata.scopes_supported?.includes("openid")||!metadata.id_token_signing_alg_values_supported?.some(alg=>["RS256","ES256"].includes(alg)))throw new Error("identity_discovery_requirements_missing");
  return{issuer:metadata.issuer,authorizationEndpoint:metadata.authorization_endpoint,tokenEndpoint:metadata.token_endpoint,jwksUri:metadata.jwks_uri,signingAlgorithms:metadata.id_token_signing_alg_values_supported};
}

export async function verifyGrasanyIdToken(token,{jwks,issuer=GRASANY_OIDC_PACKET.issuer,audience,nonce,nowSeconds=Math.floor(Date.now()/1000),cryptoApi=globalThis.crypto}={}){
  if(typeof token!=="string"||typeof audience!=="string"||!audience||typeof nonce!=="string"||!nonce)throw new Error("identity_id_token_invalid");
  const pieces=token.split(".");if(pieces.length!==3)throw new Error("identity_id_token_invalid");
  let header,claims,signature;
  try{header=decodeJson(pieces[0]);claims=decodeJson(pieces[1]);signature=fromBase64Url(pieces[2]);}catch{throw new Error("identity_id_token_invalid");}
  if(!["RS256","ES256"].includes(header.alg)||typeof header.kid!=="string"||header.crit?.length||header.jku||header.x5u||!Array.isArray(jwks?.keys))throw new Error("identity_id_token_algorithm_not_supported");
  const matches=jwks.keys.filter(item=>item.kid===header.kid&&(!item.alg||item.alg===header.alg)&&(!item.use||item.use==="sig"));
  const key=matches.length===1?matches[0]:null;
  if(!key)throw new Error("identity_signing_key_missing");
  if(header.alg==="RS256"&&key.kty!=="RSA"||header.alg==="ES256"&&(key.kty!=="EC"||key.crv!=="P-256"))throw new Error("identity_signing_key_invalid");
  let imported,algorithm;
  try{
    if(header.alg==="RS256"){algorithm={name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"};imported=await cryptoApi.subtle.importKey("jwk",key,algorithm,false,["verify"]);}
    else{algorithm={name:"ECDSA",namedCurve:"P-256"};imported=await cryptoApi.subtle.importKey("jwk",key,algorithm,false,["verify"]);}
    const valid=await cryptoApi.subtle.verify(header.alg==="RS256"?"RSASSA-PKCS1-v1_5":{name:"ECDSA",hash:"SHA-256"},imported,signature,new TextEncoder().encode(`${pieces[0]}.${pieces[1]}`));
    if(!valid)throw new Error("identity_signature_invalid");
  }catch(error){if(error?.message==="identity_signature_invalid")throw error;throw new Error("identity_signature_invalid");}
  const audiences=Array.isArray(claims.aud)?claims.aud:typeof claims.aud==="string"?[claims.aud]:[];
  if(claims.iss!==issuer||!audiences.includes(audience)||audiences.length>1&&claims.azp!==audience||claims.azp&&claims.azp!==audience)throw new Error("identity_token_issuer_or_audience_invalid");
  if(typeof claims.sub!=="string"||!claims.sub||claims.nonce!==nonce||!Number.isFinite(claims.exp)||claims.exp<=nowSeconds||!Number.isFinite(claims.iat)||claims.iat>nowSeconds+60||Number.isFinite(claims.nbf)&&claims.nbf>nowSeconds+60)throw new Error("identity_token_claims_invalid");
  return{claims,subject:claims.sub,centralAdmin:false};
}

export function validateOidcInitialTokenResponse(payload,scopes=GRASANY_REQUESTED_SCOPES){
  if(!payload||typeof payload.access_token!=="string"||!payload.access_token||typeof payload.id_token!=="string"||!payload.id_token||typeof payload.refresh_token!=="string"||!payload.refresh_token||String(payload.token_type).toLowerCase()!=="bearer"||!Number.isFinite(payload.expires_in)||payload.expires_in<=0)throw new Error("identity_initial_token_response_incomplete");
  const returned=new Set(typeof payload.scope==="string"?payload.scope.split(/\s+/).filter(Boolean):[]);
  if(scopes.some(scope=>!returned.has(scope)))throw new Error("identity_initial_token_scope_incomplete");
  return{accessToken:payload.access_token,idToken:payload.id_token,refreshToken:payload.refresh_token,tokenType:"Bearer",expiresAt:Date.now()+payload.expires_in*1000,scope:payload.scope};
}

export async function encryptIdentityTokens(tokens,keyString,{cryptoApi=globalThis.crypto}={}){
  const keyBytes=decodeEncryptionKey(keyString);if(!keyBytes)throw new Error("identity_token_encryption_key_unavailable");
  const key=await cryptoApi.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["encrypt"]),iv=new Uint8Array(12);cryptoApi.getRandomValues(iv);
  const ciphertext=await cryptoApi.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(tokens)));
  return{iv:toBase64Url(iv),ciphertext:toBase64Url(ciphertext)};
}

export async function decryptIdentityTokens(envelope,keyString,{cryptoApi=globalThis.crypto}={}){
  const keyBytes=decodeEncryptionKey(keyString);if(!keyBytes||!envelope?.iv||!envelope?.ciphertext)throw new Error("identity_token_encryption_key_unavailable");
  try{const key=await cryptoApi.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["decrypt"]),plaintext=await cryptoApi.subtle.decrypt({name:"AES-GCM",iv:fromBase64Url(envelope.iv)},key,fromBase64Url(envelope.ciphertext));return JSON.parse(new TextDecoder().decode(plaintext));}catch{throw new Error("identity_token_decryption_failed");}
}

export function buildAuthorizationUrl(metadata,{clientId,redirectUri,transaction,challenge}={}){
  if(!GRASANY_OIDC_PACKET.enabled||!GRASANY_OIDC_PACKET.callbacks.includes(redirectUri)||clientId!==GRASANY_OIDC_PACKET.clientId)throw new Error("identity_service_not_configured");
  const url=new URL(metadata.authorizationEndpoint);
  for(const [key,value] of Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:GRASANY_REQUESTED_SCOPES.join(" "),state:transaction.state,nonce:transaction.nonce,code_challenge:challenge,code_challenge_method:"S256"}))url.searchParams.set(key,value);
  return url.toString();
}
