import { ChatSession } from "./durable/ChatSession.js";
import { PartyRoomShard } from "./durable/PartyRoomShard.js";
import { ListenerRegistryShard } from "./durable/ListenerRegistryShard.js";
import { validRoomTypeId, validPriceTierId, HOST_INACTIVITY_TIMEOUT_SECONDS } from "./policies/partyRoomPolicy.js";
import { MatchmakingShard } from "./durable/MatchmakingShard.js";
import { PresenceShard } from "./durable/PresenceShard.js";
import { AnonymousIdentityShard } from "./durable/AnonymousIdentityShard.js";
import { ipPrefix,keyedFingerprint,verifyAnonymousToken } from "./auth/anonymousToken.js";
import { verifySupabaseUser,supabaseRest } from "./auth/supabaseUser.js";
import { DeviceOwnershipShard } from "./durable/DeviceOwnershipShard.js";
import { validUsername } from "./policies/usernamePolicy.js";
import { validPatternId, validPaletteId } from "./policies/themePolicy.js";
import { PaymentService } from "./services/PaymentService.js";
import { hasPaidPreferences,normalizePaidPreferences } from "./policies/preferencePolicy.js";
import { VIDEO_FREE_SESSION_LIMIT,hasUnlimitedVideoSessions } from "./policies/videoPolicy.js";
import { ConfigService } from "./services/ConfigService.js";
import { DEFAULT_AD_CONFIG } from "./policies/adPolicy.js";
import { DEFAULT_FLAGS } from "./policies/flagPolicy.js";
import { DEFAULT_MEMBERSHIP_CONFIG } from "./policies/membershipPolicy.js";
import { DEFAULT_AD_EARNING_CONFIG } from "./policies/adEarningPolicy.js";
import { AdminService } from "./services/AdminService.js";
import { RestrictionService } from "./services/RestrictionService.js";
import { AnalyticsService,CLIENT_ANALYTICS_EVENTS,approximatePublicCount } from "./services/AnalyticsService.js";
import { AccountPrivacyService } from "./services/AccountPrivacyService.js";
import { FeedbackService } from "./services/FeedbackService.js";
import { RateLimitShard } from "./durable/RateLimitShard.js";
import { DailyAccessService } from "./services/DailyAccessService.js";
import { RadioService } from "./services/RadioService.js";
import { StreamingMembershipService } from "./services/StreamingMembershipService.js";
import { VerificationService } from "./services/VerificationService.js";
import { GamesService } from "./services/GamesService.js";
import { ForumRoomShard } from "./durable/ForumRoomShard.js";
import { FORUM_TOPICS, validForumTopicId } from "./policies/forumPolicy.js";
import { SportsService } from "./services/SportsService.js";

const MAX_API_BODY_BYTES=64*1024,MAX_WEBHOOK_BODY_BYTES=256*1024;
function bytesStartWith(bytes,pattern,offset=0){return pattern.every((byte,index)=>bytes[offset+index]===byte);}
function looksLikeAudio(bytes){
  if(bytesStartWith(bytes,[0x49,0x44,0x33]))return"mp3";
  if(bytesStartWith(bytes,[0xFF,0xFB])||bytesStartWith(bytes,[0xFF,0xF3])||bytesStartWith(bytes,[0xFF,0xF2]))return"mp3";
  if(bytesStartWith(bytes,[0x52,0x49,0x46,0x46])&&bytesStartWith(bytes,[0x57,0x41,0x56,0x45],8))return"wav";
  if(bytesStartWith(bytes,[0x4F,0x67,0x67,0x53]))return"ogg";
  if(bytesStartWith(bytes,[0x66,0x74,0x79,0x70],4))return"m4a";
  return null;
}
function looksLikeImage(bytes){
  if(bytesStartWith(bytes,[0xFF,0xD8,0xFF]))return"jpg";
  if(bytesStartWith(bytes,[0x89,0x50,0x4E,0x47]))return"png";
  if(bytesStartWith(bytes,[0x52,0x49,0x46,0x46])&&bytesStartWith(bytes,[0x57,0x45,0x42,0x50],8))return"webp";
  return null;
}
function shard(env,binding,name="global"){const namespace=env[binding];return namespace.get(namespace.idFromName(name));}
function bearer(request){const value=request.headers.get("authorization")||"";return value.startsWith("Bearer ")?value.slice(7):null}
function webSocketToken(request){return(request.headers.get("sec-websocket-protocol")||"").split(",").map(value=>value.trim()).find(value=>value.startsWith("rc-auth."))?.slice(8)||null}
export async function readTextBody(request,maxBytes,errorCode="payload_too_large"){const declared=request.headers.get("content-length");if(declared&&Number(declared)>maxBytes)throw new Error(errorCode);if(!request.body)return"";const reader=request.body.getReader(),decoder=new TextDecoder();let size=0,result="";try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error(errorCode);}result+=decoder.decode(value,{stream:true});}return result+decoder.decode();}finally{reader.releaseLock();}}
async function anonymousClaims(request,env,token=bearer(request)){return env.ANON_SESSION_SECRET?verifyAnonymousToken(token,env.ANON_SESSION_SECRET):null}
async function anonymousStub(env){return shard(env,"ANONYMOUS")}
async function enforceRateLimit(request,env,bucket,key){if(!env?.RATE_LIMIT||!env?.ANON_SESSION_SECRET)return null;const prefix=ipPrefix(request.headers.get("CF-Connecting-IP")||"unknown"),fingerprint=await keyedFingerprint(`${bucket}:${key||prefix}`,env.ANON_SESSION_SECRET),namespace=env.RATE_LIMIT,stub=namespace.get(namespace.idFromName(`${bucket}:${fingerprint.slice(0,4)}`)),response=await stub.fetch("https://rate.internal/check",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bucket,key:fingerprint})});if(response.ok)return null;const result=await response.json();return Response.json({error:"rate_limited",retryAt:result.retryAt},{status:429,headers:{"retry-after":String(Math.max(1,Math.ceil((result.retryAt-Date.now())/1000)))}});}
async function endMatches(env,targetRef){if(!env?.MATCHMAKING)return null;const response=await shard(env,"MATCHMAKING").fetch("https://match.internal/admin/restrict",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetRef})}),result=await response.json();if(env.CHAT_SESSION)await Promise.all((result.sessionIds||[]).map(sessionId=>{const namespace=env.CHAT_SESSION;return namespace.get(namespace.idFromName(sessionId)).fetch("https://chat.internal/admin/end",{method:"POST"});}));return result;}
export async function activateRequiredDailyAccess({eligibility,user,env,fetcher=env.FETCHER||fetch}){if(!eligibility?.accountRequired)return null;if(!user?.emailVerified)throw new Error("verified_account_required");return new DailyAccessService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher}).activate({userId:user.id});}
async function proxyJson(request,env,path,{authorizeSearch=false,activity}={}){
  const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});if(authorizeSearch){const limited=await enforceRateLimit(request,env,"search",claims.sub);if(limited)return limited;}const anon=await anonymousStub(env),body=await request.json();
  if(authorizeSearch){const flagsBlocked=await requireFlags(env,["new_matches_enabled"]);if(flagsBlocked)return flagsBlocked;body.mode=body.mode==="video"?"video":"text";try{const preferences=normalizePaidPreferences(body.preferences||{});body.preferences=preferences;if(hasPaidPreferences(preferences)){const preferenceBlocked=await requireFlags(env,preferences.radiusKm!==null?["preference_matching_enabled","geo_matching_enabled"]:["preference_matching_enabled"]);if(preferenceBlocked)return preferenceBlocked;}const accountToken=request.headers.get("x-account-authorization"),accountRequest=new Request(request.url,{headers:{authorization:accountToken||""}}),user=accountToken?await verifySupabaseUser(accountRequest,env):null;if(hasPaidPreferences(preferences)&&!user?.emailVerified)return Response.json({error:"verified_account_required_for_preferences"},{status:403});if(body.mode==="video"&&env.VIDEO_BETA_OPEN!=="1"){if(!user?.emailVerified)return Response.json({error:"video_beta_not_available"},{status:403});let video;try{video=(await new ConfigService(env,env.FETCHER||fetch).video()).config;}catch{video=null;}if(!video?.enabled)return Response.json({error:"video_beta_not_available"},{status:403});if(!hasUnlimitedVideoSessions(video,user.id)){const profileResponse=await supabaseRest(env,user,`/profiles?select=video_sessions_used&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);const [videoProfile]=profileResponse.ok?await profileResponse.json():[];if((videoProfile?.video_sessions_used||0)>=VIDEO_FREE_SESSION_LIMIT)return Response.json({error:"video_capacity_reached"},{status:503});}}if(user){const deletions=await new AccountPrivacyService(env,env.FETCHER||fetch).deletionRequested(user.id);if(deletions.length)return Response.json({error:"account_deletion_pending"},{status:403});if(user.emailVerified){body.accountUserId=user.id;const [blocks,profiles]=await Promise.all([supabaseRest(env,user,"/blocks?select=blocked_ref"),supabaseRest(env,user,`/profiles?select=public_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`)]);if(blocks.ok)body.blockedRefs=(await blocks.json()).map(item=>item.blocked_ref);if(profiles.ok)body.accountPublicId=(await profiles.json())[0]?.public_id||null;}}const restrictions=await new RestrictionService(env,env.FETCHER||fetch).find([claims.sub,user?.id,body.accountPublicId]);if(restrictions.length)return Response.json({error:"account_restricted",status:restrictions[0].status},{status:403});const allowed=await anon.fetch("https://anonymous.internal/authorize-search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identityId:claims.sub,registered:Boolean(user?.emailVerified)})});if(!allowed.ok)return allowed;await activateRequiredDailyAccess({eligibility:await allowed.json(),user,env});}catch(error){return Response.json({error:error.message},{status:error.message.includes("insufficient")?402:400});}}
  body.identityId=claims.sub;if(activity){await anon.fetch("https://anonymous.internal/activity",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:activity})});await recordAnalytics(env,{eventId:`${activity}:${crypto.randomUUID()}`,eventName:activity,dimension:body.accountUserId?"registered":"anonymous"});if(hasPaidPreferences(body.preferences||{}))await recordAnalytics(env,{eventId:`preference-search:${crypto.randomUUID()}`,eventName:"preference_search_started",dimension:"paid"});}return shard(env,"MATCHMAKING").fetch(`https://match.internal${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
}
export async function adminUser(request,env,verify=verifySupabaseUser){const user=await verify(request,env);if(!user)return{error:Response.json({error:"invalid_admin_session"},{status:401})};if(!user.emailVerified||!env.ADMIN_USER_ID||user.id!==env.ADMIN_USER_ID)return{error:Response.json({error:"admin_forbidden"},{status:403})};if(env.ADMIN_REQUIRE_AAL2!=="false"&&user.aal!=="aal2")return{error:Response.json({error:"admin_mfa_required"},{status:403})};return{user};}
export async function requireBettingOptIn(env,user){const profileResponse=await supabaseRest(env,user,`/profiles?select=betting_opted_in_at&user_id=eq.${encodeURIComponent(user.id)}&limit=1`),[profile]=profileResponse.ok?await profileResponse.json():[null];return profile?.betting_opted_in_at?null:Response.json({error:"betting_opt_in_required"},{status:403});}
export async function requireFlags(env,keys){let flags;try{flags=(await new ConfigService(env,env.FETCHER||fetch).flags()).config;}catch{flags=DEFAULT_FLAGS;}const blocked=keys.find(key=>flags[key]===false);return blocked?Response.json({error:`feature_disabled:${blocked}`},{status:503}):null;}
async function recordAnalytics(env,event){if(!env?.SUPABASE_URL||!env?.SUPABASE_SERVICE_ROLE_KEY||(env.FETCHER&&!env.ANALYTICS_FETCHER))return;try{return await new AnalyticsService(env,env.ANALYTICS_FETCHER||fetch).record(event)}catch{return null}}
export function allowedOrigin(request,env){const origin=request.headers.get("origin");if(!origin)return null;const configured=String(env.ALLOWED_ORIGINS||env.ALLOWED_ORIGIN||"").split(",").map(value=>value.trim()).filter(Boolean),sameOrigin=new URL(request.url).origin;return new Set([...configured,sameOrigin]).has(origin)?origin:false;}
export function secureResponse(response,request,env){if(response.status===101)return response;const headers=new Headers(response.headers),origin=allowedOrigin(request,env);headers.set("x-content-type-options","nosniff");headers.set("referrer-policy","no-referrer");headers.set("permissions-policy","camera=(), microphone=(), geolocation=()");headers.set("cross-origin-opener-policy","same-origin");headers.set("cross-origin-resource-policy","same-site");headers.set("strict-transport-security","max-age=31536000; includeSubDomains");headers.set("x-frame-options","DENY");headers.set("vary","Origin");headers.set("cache-control",request.method==="GET"&&["/api/v1/config/public","/api/v1/stats/public","/api/v1/compliance/public"].includes(new URL(request.url).pathname)?"public, max-age=30":"no-store");if(origin){headers.set("access-control-allow-origin",origin);headers.set("access-control-allow-credentials","true");}return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}

let isolateStartedAt = null;
async function timedCheck(fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    return { status: "ok", latencyMs: Date.now() - startedAt, ...detail };
  } catch (error) {
    return { status: "outage", latencyMs: Date.now() - startedAt, message: error.message || "unreachable" };
  }
}
async function buildHealthReport(env, fetcher = fetch) {
  if (isolateStartedAt === null) isolateStartedAt = Date.now();
  const checks = {};
  checks.supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? await timedCheck(async () => {
        const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY } });
        if (!response.ok && response.status !== 404) throw new Error(`unexpected_status_${response.status}`);
        return {};
      })
    : { status: "unreachable", message: "not_configured" };
  checks.storageR2 = env.RADIO_BUCKET
    ? await timedCheck(async () => { await env.RADIO_BUCKET.head("__healthcheck__"); return {}; })
    : { status: "unreachable", message: "not_configured" };
  checks.durableObjects = {
    status: env.MATCHMAKING && env.CHAT_SESSION && env.PARTY_ROOM ? "ok" : "outage",
    message: "bindings_present_only; individual shards are not pinged to avoid unnecessary wake-ups",
  };
  checks.razorpay = env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
    ? { status: "ok", message: "credentials_configured; not actively pinged" }
    : { status: "unreachable", message: "not_configured" };
  checks.logs = { status: "unknown", message: "no centralized log aggregation configured for this service" };
  const statuses = Object.values(checks).map(check => check.status);
  const overall = statuses.includes("outage") ? "outage" : statuses.includes("unreachable") || statuses.includes("unknown") ? "degraded" : "ok";
  return {
    status: overall,
    service: "sunoto-worker",
    version: /^[0-9a-f]{40}$/i.test(env.RELEASE_REVISION || "") ? env.RELEASE_REVISION.toLowerCase() : null,
    environment: env.ENVIRONMENT || "production",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - isolateStartedAt) / 1000),
    uptimeNote: "Cloudflare Workers are stateless/ephemeral at the edge; this is time-since-isolate-start, not deployment uptime.",
    checks,
    errors: { fatalCount: null, unknownCount: null, recent: [], note: "log-based error counts are not wired up yet — see ROADMAP" },
  };
}
async function handleRequest(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/health") {
      const report = await buildHealthReport(env, env.FETCHER || fetch);
      return Response.json(report, { status: report.status === "outage" ? 503 : 200 });
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/config/public"){const configService=new ConfigService(env);let ads;try{ads=await configService.ads();}catch{ads={config:DEFAULT_AD_CONFIG,version:0};}let flags;try{flags=await configService.flags();}catch{flags={config:DEFAULT_FLAGS,version:0};}let membership;try{membership=await configService.membership();}catch{membership={config:DEFAULT_MEMBERSHIP_CONFIG,version:0};}let adEarning;try{adEarning=await configService.adEarning();}catch{adEarning={config:DEFAULT_AD_EARNING_CONFIG,version:0};}return Response.json({ads:ads.config,version:ads.version,flags:flags.config,membership:membership.config,adEarning:adEarning.config});}
    if(request.method==="POST"&&url.pathname==="/api/v1/analytics/event"){const limited=await enforceRateLimit(request,env,"analytics");if(limited)return limited;const body=await request.json().catch(()=>({}));if(!CLIENT_ANALYTICS_EVENTS.has(body.eventName)||!/^[a-zA-Z0-9_-]{8,160}$/.test(body.eventId||""))return Response.json({error:"invalid_analytics_event"},{status:400});const result=await recordAnalytics(env,{eventId:`client:${body.eventId}`,eventName:body.eventName,dimension:"anonymous"});return result?Response.json(result):Response.json({recorded:false},{status:503});}
    if(request.method==="GET"&&url.pathname==="/api/v1/stats/public"){try{const [snapshot,presenceResponse]=await Promise.all([new AnalyticsService(env,env.ANALYTICS_FETCHER||fetch).publicSnapshot(),shard(env,"PRESENCE").fetch("https://presence.internal/stats")]),presence=await presenceResponse.json();return Response.json({realConnectionsToday:approximatePublicCount(snapshot.realConnectionsToday),virtualConnectionsToday:approximatePublicCount(snapshot.virtualConnectionsToday),messagesToday:approximatePublicCount(snapshot.messagesToday),registeredUsers:Number(snapshot.registeredUsers)||0,realActiveSessions:(presence.anonymousOnline||0)+(presence.registeredOnline||0),asOf:snapshot.asOf,approximate:true});}catch{return Response.json({error:"stats_temporarily_unavailable"},{status:503});}}
    if(request.method==="GET"&&url.pathname==="/api/v1/weather"){
      const configService=new ConfigService(env);let flags;try{flags=await configService.flags();}catch{flags={config:DEFAULT_FLAGS};}
      if(!flags.config?.weather_enabled)return Response.json({error:"weather_disabled"},{status:503});
      const hasCoords=url.searchParams.has("lat")||url.searchParams.has("lon");
      const lat=hasCoords?Number(url.searchParams.get("lat")):Number(request.cf?.latitude),lon=hasCoords?Number(url.searchParams.get("lon")):Number(request.cf?.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return Response.json({error:hasCoords?"invalid_coordinates":"location_unavailable"},{status:hasCoords?400:503});
      const limited=await enforceRateLimit(request,env,"weather");if(limited)return limited;
      try{
        const roundedLat=Math.round(lat*10)/10,roundedLon=Math.round(lon*10)/10;
        const response=await (env.FETCHER||fetch)(`https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLon}&current=temperature_2m,weather_code&timezone=auto`);
        if(!response.ok)return Response.json({error:"weather_unavailable"},{status:502});
        const data=await response.json();
        return Response.json({temperatureC:data.current?.temperature_2m??null,weatherCode:data.current?.weather_code??null,asOf:data.current?.time||null});
      }catch{return Response.json({error:"weather_unavailable"},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/ads/private"){const slot=url.searchParams.get("slot")||"";if(!slot)return Response.json({error:"invalid_slot"},{status:400});try{const ads=await new AdminService(env,env.FETCHER||fetch).privateAds(slot);const active=ads.find(item=>item.active);return Response.json({ad:active?{id:active.id,slot:active.slot,title:active.title,imageUrl:active.image_url,targetUrl:active.target_url}:null});}catch{return Response.json({ad:null});}}
    if(request.method==="POST"&&url.pathname==="/api/v1/ads/private/event"){const limited=await enforceRateLimit(request,env,"ad_event");if(limited)return limited;const body=await request.json().catch(()=>({}));if(typeof body.adId!=="string"||!["load","click"].includes(body.type))return Response.json({error:"invalid_ad_event"},{status:400});try{await shard(env,"PRESENCE").fetch("https://presence.internal/ad-event",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({adId:body.adId,type:body.type})});}catch{}return Response.json({ok:true});}
    if(url.pathname.startsWith("/api/v1/admin/")){
      const authorization=await adminUser(request,env);if(authorization.error)return authorization.error;const user=authorization.user,config=new ConfigService(env,env.FETCHER||fetch),admin=new AdminService(env,env.FETCHER||fetch);try{
        if(url.pathname==="/api/v1/admin/ads"&&(request.method==="GET"||request.method==="PUT")){if(request.method==="GET")return Response.json(await config.ads());const body=await request.json();if(!Number.isSafeInteger(body.expectedVersion))return Response.json({error:"invalid_config_version"},{status:400});return Response.json(await config.updateAds({adminId:user.id,expectedVersion:body.expectedVersion,config:body.config}));}
        if(url.pathname==="/api/v1/admin/virtual"&&(request.method==="GET"||request.method==="PUT")){if(request.method==="GET")return Response.json(await config.virtual());const body=await request.json();if(!Number.isSafeInteger(body.expectedVersion))return Response.json({error:"invalid_config_version"},{status:400});return Response.json(await config.updateVirtual({adminId:user.id,expectedVersion:body.expectedVersion,config:body.config}));}
        if(url.pathname==="/api/v1/admin/flags"&&(request.method==="GET"||request.method==="PUT")){if(request.method==="GET")return Response.json(await config.flags());const body=await request.json();if(!Number.isSafeInteger(body.expectedVersion))return Response.json({error:"invalid_config_version"},{status:400});return Response.json(await config.updateFlags({adminId:user.id,expectedVersion:body.expectedVersion,config:body.config}));}
        if(url.pathname==="/api/v1/admin/video"&&(request.method==="GET"||request.method==="PUT")){if(request.method==="GET")return Response.json(await config.video());const body=await request.json();if(!Number.isSafeInteger(body.expectedVersion))return Response.json({error:"invalid_config_version"},{status:400});return Response.json(await config.updateVideo({adminId:user.id,expectedVersion:body.expectedVersion,config:body.config}));}
        if(url.pathname==="/api/v1/admin/membership"&&(request.method==="GET"||request.method==="PUT")){if(request.method==="GET")return Response.json(await config.membership());const body=await request.json();if(!Number.isSafeInteger(body.expectedVersion))return Response.json({error:"invalid_config_version"},{status:400});return Response.json(await config.updateMembership({adminId:user.id,expectedVersion:body.expectedVersion,config:body.config}));}
        if(url.pathname==="/api/v1/admin/guest-win"&&(request.method==="GET"||request.method==="PUT")){if(request.method==="GET")return Response.json(await config.guestWin());const body=await request.json();if(!Number.isSafeInteger(body.expectedVersion))return Response.json({error:"invalid_config_version"},{status:400});return Response.json(await config.updateGuestWin({adminId:user.id,expectedVersion:body.expectedVersion,config:body.config}));}
        if(url.pathname==="/api/v1/admin/ad-earning"&&(request.method==="GET"||request.method==="PUT")){if(request.method==="GET")return Response.json(await config.adEarning());const body=await request.json();if(!Number.isSafeInteger(body.expectedVersion))return Response.json({error:"invalid_config_version"},{status:400});return Response.json(await config.updateAdEarning({adminId:user.id,expectedVersion:body.expectedVersion,config:body.config}));}
        if(url.pathname==="/api/v1/admin/daily-streak"&&(request.method==="GET"||request.method==="PUT")){if(request.method==="GET")return Response.json(await config.dailyStreak());const body=await request.json();if(!Number.isSafeInteger(body.expectedVersion))return Response.json({error:"invalid_config_version"},{status:400});return Response.json(await config.updateDailyStreak({adminId:user.id,expectedVersion:body.expectedVersion,config:body.config}));}
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/dashboard"){const [persistent,presenceResponse,matchResponse,analytics]=await Promise.all([admin.dashboard(),shard(env,"PRESENCE").fetch("https://presence.internal/stats"),shard(env,"MATCHMAKING").fetch("https://match.internal/admin/stats"),new AnalyticsService(env,env.ANALYTICS_FETCHER||fetch).adminSnapshot(30)]);return Response.json({persistent:Array.isArray(persistent)?persistent[0]:persistent,presence:await presenceResponse.json(),matchmaking:await matchResponse.json(),analytics});}
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/users")return Response.json({users:await admin.users(Number(url.searchParams.get("limit")||50),Number(url.searchParams.get("offset")||0))});
        const ledgerMatch=url.pathname.match(/^\/api\/v1\/admin\/users\/([0-9a-f-]{36})\/ledger$/i);if(request.method==="GET"&&ledgerMatch)return Response.json({entries:await admin.ledger(ledgerMatch[1])});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/reports")return Response.json({reports:await admin.reports()});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/grievances")return Response.json({grievances:await admin.grievances()});
        const grievanceMatch=url.pathname.match(/^\/api\/v1\/admin\/grievances\/([0-9a-f-]{36})$/i);if(request.method==="POST"&&grievanceMatch){const body=await request.json();if(!["acknowledged","in_review","resolved","rejected"].includes(body.status))return Response.json({error:"invalid_grievance_status"},{status:400});return Response.json({grievance:await admin.updateGrievance({adminId:user.id,id:grievanceMatch[1],status:body.status})});}
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/feedback")return Response.json({feedback:await admin.feedback()});
        const feedbackMatch=url.pathname.match(/^\/api\/v1\/admin\/feedback\/([0-9a-f-]{36})$/i);if(request.method==="POST"&&feedbackMatch){const body=await request.json();if(!["received","reviewed","planned","declined"].includes(body.status))return Response.json({error:"invalid_feedback_status"},{status:400});return Response.json({feedback:await admin.updateFeedback({adminId:user.id,id:feedbackMatch[1],status:body.status})});}
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/deletions")return Response.json({deletions:await admin.deletions()});
        const deletionMatch=url.pathname.match(/^\/api\/v1\/admin\/deletions\/([0-9a-f-]{36})$/i);if(request.method==="POST"&&deletionMatch){const body=await request.json(),note=String(body.note||"").trim();if(!["processing","completed","rejected"].includes(body.status)||note.length<10)return Response.json({error:"invalid_deletion_transition"},{status:400});return Response.json({deletion:await admin.updateDeletion({adminId:user.id,id:deletionMatch[1],status:body.status,note})});}
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/restrictions")return Response.json({restrictions:await admin.restrictions()});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/offers")return Response.json({offers:await admin.promotions("offer")});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/coupons")return Response.json({coupons:await admin.promotions("coupon")});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/audit")return Response.json({audit:await admin.audit()});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/games/revenue")return Response.json({entries:await admin.gamesRevenue(Number(url.searchParams.get("limit")||100))});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/games/rounds")return Response.json({rounds:await admin.gamesRounds(url.searchParams.get("gameType")||"",Number(url.searchParams.get("limit")||100))});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/sports/matches")return Response.json({matches:await admin.sportMatches(Number(url.searchParams.get("limit")||100))});
        if(request.method==="POST"&&url.pathname==="/api/v1/admin/sports/matches"){const body=await request.json();if(!["cricket","football"].includes(body.sport)||!body.homeTeam||!body.awayTeam)return Response.json({error:"invalid_match"},{status:400});return Response.json({match:await admin.createSportMatch({sport:body.sport,homeTeam:body.homeTeam,awayTeam:body.awayTeam,startsAt:body.startsAt})});}
        const sportMatchStatusMatch=url.pathname.match(/^\/api\/v1\/admin\/sports\/matches\/([0-9a-f-]{36})$/i);if(request.method==="PATCH"&&sportMatchStatusMatch){const body=await request.json();if(!["scheduled","live","completed","abandoned"].includes(body.status))return Response.json({error:"invalid_match_status"},{status:400});return Response.json({match:await admin.updateSportMatch({id:sportMatchStatusMatch[1],status:body.status})});}
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/sports/markets"){const matchId=url.searchParams.get("matchId")||"";if(!matchId)return Response.json({error:"invalid_match"},{status:400});return Response.json({markets:await admin.sportMarkets(matchId)});}
        if(request.method==="POST"&&url.pathname==="/api/v1/admin/sports/markets"){const body=await request.json();if(!body.matchId||!body.marketType||!Array.isArray(body.outcomeLabels)||body.outcomeLabels.length<2)return Response.json({error:"invalid_market"},{status:400});try{return Response.json({market:await admin.createSportMarket({matchId:body.matchId,marketType:body.marketType,description:body.description,closesAt:body.closesAt,outcomeLabels:body.outcomeLabels})});}catch(error){return Response.json({error:error.message},{status:400});}}
        const sportMarketCloseMatch=url.pathname.match(/^\/api\/v1\/admin\/sports\/markets\/([0-9a-f-]{36})\/close$/i);if(request.method==="POST"&&sportMarketCloseMatch){await admin.closeSportMarket(sportMarketCloseMatch[1]);return Response.json({ok:true});}
        const sportMarketVoidMatch=url.pathname.match(/^\/api\/v1\/admin\/sports\/markets\/([0-9a-f-]{36})\/void$/i);if(request.method==="POST"&&sportMarketVoidMatch){try{await admin.voidSportMarket(sportMarketVoidMatch[1]);return Response.json({ok:true});}catch(error){return Response.json({error:error.message},{status:400});}}
        const sportMarketSettleMatch=url.pathname.match(/^\/api\/v1\/admin\/sports\/markets\/([0-9a-f-]{36})\/settle$/i);if(request.method==="POST"&&sportMarketSettleMatch){const body=await request.json();if(!body.winningOutcomeId)return Response.json({error:"invalid_outcome"},{status:400});try{return Response.json({result:await admin.settleSportMarket({id:sportMarketSettleMatch[1],winningOutcomeId:body.winningOutcomeId})});}catch(error){return Response.json({error:error.message},{status:400});}}
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/games/jackpot-rounds")return Response.json({rounds:await admin.jackpotRounds(Number(url.searchParams.get("limit")||50))});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/games/trivia-rounds")return Response.json({rounds:await admin.triviaRounds(Number(url.searchParams.get("limit")||50))});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/games/wheel-segments")return Response.json({segments:await admin.wheelSegments()});
        if(request.method==="PUT"&&url.pathname==="/api/v1/admin/games/wheel-segments"){const body=await request.json();if(!Array.isArray(body.segments)||!body.segments.length)return Response.json({error:"invalid_wheel_segments"},{status:400});return Response.json({segments:await admin.updateWheelSegments({adminId:user.id,segments:body.segments})});}
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/games/trivia-schedule")return Response.json({schedule:await admin.scheduledTriviaQuestions(Number(url.searchParams.get("limit")||20))});
        if(request.method==="POST"&&url.pathname==="/api/v1/admin/games/trivia-schedule"){const body=await request.json();if(!/^\d{4}-\d{2}-\d{2}$/.test(body.triviaDate||"")||!Array.isArray(body.questions)||body.questions.length!==5)return Response.json({error:"invalid_trivia_schedule"},{status:400});return Response.json({schedule:await admin.scheduleTriviaQuestions({adminId:user.id,triviaDate:body.triviaDate,questions:body.questions})});}
        if(request.method==="POST"&&url.pathname==="/api/v1/admin/radio/channels"){const body=await request.json();if(typeof body.name!=="string"||!body.name.trim())return Response.json({error:"invalid_channel_name"},{status:400});const [channel]=await admin.createRadioChannel({name:body.name.trim()});return Response.json({channel:{publicId:channel.public_id,name:channel.name,roomType:channel.room_type,curatedOnly:channel.curated_only}});}
        if(request.method==="PUT"&&url.pathname==="/api/v1/admin/radio/artist-links"){const body=await request.json();if(!/^[0-9a-fA-F-]{36}$/.test(body.roomPublicId||""))return Response.json({error:"invalid_room"},{status:400});await admin.setRadioArtistLinks({adminId:user.id,roomPublicId:body.roomPublicId,spotifyUrl:body.spotifyUrl||"",appleMusicUrl:body.appleMusicUrl||""});return Response.json({ok:true});}
        if(request.method==="POST"&&url.pathname==="/api/v1/admin/wallet"){const body=await request.json(),delta=Number(body.delta);if(!/^[0-9a-f-]{36}$/i.test(body.userId||"")||!Number.isSafeInteger(delta)||delta===0||typeof body.reason!=="string"||!/^[0-9a-f-]{36}$/i.test(body.operationId||""))return Response.json({error:"invalid_wallet_adjustment"},{status:400});return Response.json({result:(await admin.wallet({adminId:user.id,userId:body.userId,delta,reason:body.reason,operationId:body.operationId}))[0]});}
        if(request.method==="POST"&&url.pathname==="/api/v1/admin/restrictions"){const body=await request.json();if(typeof body.targetRef!=="string"||!["restricted","banned","clear"].includes(body.status)||typeof body.reason!=="string")return Response.json({error:"invalid_restriction"},{status:400});const result=await admin.restrict({adminId:user.id,targetRef:body.targetRef,status:body.status,reason:body.reason}),enforcement=body.status!=="clear"?await endMatches(env,body.targetRef):null;return Response.json({restriction:result,enforcement});}
        if(request.method==="POST"&&url.pathname==="/api/v1/admin/premium"){const body=await request.json();if(!/^[0-9a-f-]{36}$/i.test(body.userId||"")||typeof body.premium!=="boolean")return Response.json({error:"invalid_premium_update"},{status:400});return Response.json({profile:await admin.setPremium({adminId:user.id,userId:body.userId,premium:body.premium})});}
        if(request.method==="POST"&&url.pathname==="/api/v1/admin/premium/days"){const body=await request.json();if(!/^[0-9a-f-]{36}$/i.test(body.userId||"")||!Number.isSafeInteger(body.days)||body.days<=0)return Response.json({error:"invalid_premium_days"},{status:400});try{return Response.json({profile:await admin.grantPremiumDays({adminId:user.id,userId:body.userId,days:body.days})});}catch(error){return Response.json({error:error.message},{status:400});}}
        if(request.method==="POST"&&url.pathname==="/api/v1/admin/promotions"){const body=await request.json();if(!["offer","coupon"].includes(body.type)||!body.payload||typeof body.payload!=="object")return Response.json({error:"invalid_promotion"},{status:400});return Response.json({promotion:await admin.savePromotion({adminId:user.id,type:body.type,payload:body.payload})});}
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/stats/live"){const presenceResponse=await shard(env,"PRESENCE").fetch("https://presence.internal/stats");return Response.json(await presenceResponse.json());}
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/stats/history")return Response.json({snapshots:await admin.statsSnapshots(Number(url.searchParams.get("limit")||48))});
        if(request.method==="GET"&&url.pathname==="/api/v1/admin/ads/private")return Response.json({ads:await admin.privateAds(url.searchParams.get("slot")||"")});
        if(request.method==="POST"&&url.pathname==="/api/v1/admin/ads/private"){const body=await request.json();if(typeof body.slot!=="string"||!body.slot||typeof body.imageUrl!=="string"||!body.imageUrl||typeof body.targetUrl!=="string"||!body.targetUrl)return Response.json({error:"invalid_private_ad"},{status:400});return Response.json({ad:(await admin.createPrivateAd(body))[0]});}
        const privateAdMatch=url.pathname.match(/^\/api\/v1\/admin\/ads\/private\/([0-9a-fA-F-]{36})$/);
        if(privateAdMatch&&request.method==="PATCH"){const body=await request.json();return Response.json({ad:(await admin.updatePrivateAd({id:privateAdMatch[1],...body}))[0]});}
        if(privateAdMatch&&request.method==="DELETE"){await admin.deletePrivateAd(privateAdMatch[1]);return Response.json({ok:true});}
        return Response.json({error:"admin_route_not_found"},{status:404});
      }catch(error){return Response.json({error:error.message},{status:error.message.includes("version_conflict")||error.message.includes("insufficient")?409:400});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/anonymous/session"){
      if(!env.ANON_SESSION_SECRET)return Response.json({error:"anonymous_sessions_not_configured"},{status:503});const limited=await enforceRateLimit(request,env,"anonymous_session");if(limited)return limited;const body=await request.json(),prefix=ipPrefix(request.headers.get("CF-Connecting-IP")||"unknown"),ipHash=await keyedFingerprint(prefix,env.ANON_SESSION_SECRET);return (await anonymousStub(env)).fetch("https://anonymous.internal/issue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,ipHash})});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/grievances"){const limited=await enforceRateLimit(request,env,"grievance");if(limited)return limited;const body=await request.json().catch(()=>({})),email=String(body.email||"").trim().toLowerCase(),category=String(body.category||""),description=String(body.description||"").trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["privacy","safety","account","payment","content","other"].includes(category)||description.length<20||description.length>2000)return Response.json({error:"invalid_grievance"},{status:400});const grievance=await new AccountPrivacyService(env,env.FETCHER||fetch).grievance({email,category,description});return Response.json({received:true,reference:grievance.id,receivedAt:grievance.received_at},{status:201});}
    if(request.method==="POST"&&url.pathname==="/api/v1/feedback"){const limited=await enforceRateLimit(request,env,"feedback");if(limited)return limited;const body=await request.json().catch(()=>({})),message=String(body.message||"").trim();if(message.length<10||message.length>2000)return Response.json({error:"invalid_feedback"},{status:400});const user=await verifySupabaseUser(request,env).catch(()=>null);const feedback=await new FeedbackService(env,env.FETCHER||fetch).submit({accountUserId:user?.id||null,message});return Response.json({received:true,reference:feedback.id,createdAt:feedback.created_at},{status:201});}
    if(request.method==="GET"&&url.pathname==="/api/v1/compliance/public")return Response.json({grievanceOfficer:{name:env.GRIEVANCE_OFFICER_NAME||null,email:env.GRIEVANCE_EMAIL||null,configured:Boolean(env.GRIEVANCE_OFFICER_NAME&&env.GRIEVANCE_EMAIL)},responseTargets:{acknowledgeHours:24,resolveDays:15},legalReviewRequired:true});
    if(request.method==="GET"&&url.pathname==="/api/v1/me/export"){const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});return Response.json(await new AccountPrivacyService(env,env.FETCHER||fetch).export(user.id),{headers:{"content-disposition":"attachment; filename=random-chat-data.json"}});}
    if(request.method==="DELETE"&&url.pathname==="/api/v1/me/account"){const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const body=await request.json().catch(()=>({}));if(body.confirm!=="DELETE")return Response.json({error:"deletion_confirmation_required"},{status:400});const result=await new AccountPrivacyService(env,env.FETCHER||fetch).requestDeletion(user.id,String(body.reason||""));await endMatches(env,user.id);return Response.json({requested:true,request:Array.isArray(result)?result[0]:result},{status:202});}
    if(request.method==="GET"&&url.pathname==="/api/v1/me/profile"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const response=await supabaseRest(env,user,`/profiles?select=public_id,username,username_change_count,username_changed_at,is_premium,premium_expires_at,theme_pattern,theme_palette,verified_at,avatar_url,betting_opted_in_at,auto_debit_premium_enabled&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);if(!response.ok)return Response.json({error:"profile_lookup_failed"},{status:502});const [profile]=await response.json();return Response.json({user:{id:user.id,email:user.email,emailVerified:user.emailVerified},profile:profile||null});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/avatar"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});
      const contentType=request.headers.get("content-type")||"";if(!contentType.includes("multipart/form-data"))return Response.json({error:"invalid_upload"},{status:400});
      const form=await request.formData();
      const avatarFile=form.get("avatar");
      if(!(avatarFile instanceof File)||avatarFile.size<100||avatarFile.size>5*1024*1024)return Response.json({error:"invalid_avatar_file"},{status:400});
      const avatarBytes=new Uint8Array(await avatarFile.arrayBuffer());
      const avatarExt=looksLikeImage(avatarBytes);
      if(!avatarExt)return Response.json({error:"invalid_avatar_file"},{status:400});
      const storageKey=`avatars/${user.id}/${crypto.randomUUID()}.${avatarExt}`;
      await env.RADIO_BUCKET.put(storageKey,avatarBytes,{httpMetadata:{contentType:avatarFile.type||"image/jpeg"}});
      const response=await supabaseRest(env,user,"/rpc/set_avatar_url",{method:"POST",body:JSON.stringify({desired_avatar_url:`/api/v1/radio-media/${storageKey}`})});
      if(!response.ok){await env.RADIO_BUCKET.delete(storageKey).catch(()=>{});const error=await response.json().catch(()=>({}));const message=error.message||"avatar_update_failed";return Response.json({error:message},{status:message==="verification_required"?403:400});}
      return Response.json((await response.json())[0]||null);
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/username"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});const body=await request.json(),username=String(body.username||"").trim();if(!validUsername(username))return Response.json({error:"invalid_username"},{status:400});const response=await supabaseRest(env,user,"/rpc/claim_username",{method:"POST",body:JSON.stringify({desired_username:username})});if(!response.ok){const error=await response.json().catch(()=>({}));const message=error.message||"username_update_failed";return Response.json({error:message},{status:message==="premium_required"?403:response.status===409?409:400});}return Response.json({profile:(await response.json())[0]||null});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/theme"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const body=await request.json(),patternId=String(body.patternId||""),paletteId=String(body.paletteId||"");if(!validPatternId(patternId)||!validPaletteId(paletteId))return Response.json({error:"invalid_theme"},{status:400});const response=await supabaseRest(env,user,"/rpc/set_theme",{method:"POST",body:JSON.stringify({desired_pattern:patternId,desired_palette:paletteId})});if(!response.ok){const error=await response.json().catch(()=>({}));const message=error.message||"theme_update_failed";return Response.json({error:message},{status:message==="premium_required"?403:400});}const [row]=await response.json();return Response.json({patternId:row?.theme_pattern||null,paletteId:row?.theme_palette||null});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/account/device/claim"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const body=await request.json(),stub=shard(env,"DEVICE_OWNERSHIP",user.id);return stub.fetch("https://device.internal/claim",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:body.deviceId})});
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/wallet"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const response=await supabaseRest(env,user,`/wallets?select=balance,version,updated_at&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);if(!response.ok)return Response.json({error:"wallet_lookup_failed"},{status:502});const [wallet]=await response.json();return Response.json({wallet:wallet||{balance:0,version:0}});
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/wallet/ledger"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const response=await supabaseRest(env,user,"/wallet_ledger?select=id,delta,balance_after,entry_type,reason,created_at&order=created_at.desc&limit=50");if(!response.ok)return Response.json({error:"ledger_lookup_failed"},{status:502});return Response.json({entries:await response.json()});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/payments/orders"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});const flagsBlocked=await requireFlags(env,["payments_enabled"]);if(flagsBlocked)return flagsBlocked;const limited=await enforceRateLimit(request,env,"payment",user.id);if(limited)return limited;try{const body=await request.json(),order=await new PaymentService(env).createOrder(user,Number(body.amountPaise),body.couponCode?String(body.couponCode):null);await recordAnalytics(env,{eventId:`recharge-started:${order.orderId}`,eventName:"recharge_started",dimension:"registered",value:order.amountPaise});return Response.json(order);}catch(error){await recordAnalytics(env,{eventId:`recharge-failed:${crypto.randomUUID()}`,eventName:"recharge_failed",dimension:"registered"});return Response.json({error:error.message},{status:error.message.includes("coupon")||error.message==="minimum_recharge_50"?400:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/payments/verify"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const limited=await enforceRateLimit(request,env,"payment",user.id);if(limited)return limited;try{const body=await request.json(),paymentId=String(body.razorpay_payment_id||""),result=await new PaymentService(env).verifyCheckout({user,orderId:String(body.razorpay_order_id||""),paymentId,signature:String(body.razorpay_signature||"")});await recordAnalytics(env,{eventId:`recharge-success:${paymentId}`,eventName:"recharge_success",dimension:"registered"});return Response.json({verified:true,result:result[0]});}catch(error){await recordAnalytics(env,{eventId:`recharge-failed:${crypto.randomUUID()}`,eventName:"recharge_failed",dimension:"registered"});return Response.json({error:error.message},{status:error.message==="invalid_payment_signature"?400:409});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/membership/order"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});const flagsBlocked=await requireFlags(env,["payments_enabled"]);if(flagsBlocked)return flagsBlocked;const limited=await enforceRateLimit(request,env,"payment",user.id);if(limited)return limited;
      try{const body=await request.json(),membership=await new ConfigService(env).membership(),plan=membership.config.plans.find(item=>item.id===String(body.planId||""));if(!plan)return Response.json({error:"invalid_membership_plan"},{status:400});const order=await new PaymentService(env).createMembershipOrder(user,plan);return Response.json(order);}catch(error){return Response.json({error:error.message},{status:error.message==="invalid_membership_plan"?400:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/membership/verify"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const limited=await enforceRateLimit(request,env,"payment",user.id);if(limited)return limited;
      try{const body=await request.json(),paymentId=String(body.razorpay_payment_id||""),result=await new PaymentService(env).verifyMembershipCheckout({user,orderId:String(body.razorpay_order_id||""),paymentId,signature:String(body.razorpay_signature||"")});return Response.json({verified:true,result:result[0]});}catch(error){return Response.json({error:error.message},{status:error.message==="invalid_payment_signature"?400:409});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/membership/redeem-sparks"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});const limited=await enforceRateLimit(request,env,"payment",user.id);if(limited)return limited;
      const body=await request.json(),days=Number(body.days),idempotencyKey=`premium-redeem:${user.id}:${crypto.randomUUID()}`;
      const response=await supabaseRest(env,user,"/rpc/redeem_sparks_for_premium_days",{method:"POST",body:JSON.stringify({target_days:days,target_idempotency_key:idempotencyKey})});
      const data=await response.json().catch(()=>({}));if(!response.ok)return Response.json({error:data.message||"redeem_failed"},{status:["invalid_days","insufficient_credits"].includes(data.message)?400:502});
      return Response.json(Array.isArray(data)?data[0]:data);
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/membership/auto-debit"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});
      const body=await request.json(),response=await supabaseRest(env,user,"/rpc/set_auto_debit_premium",{method:"POST",body:JSON.stringify({enabled:Boolean(body.enabled)})});
      const data=await response.json().catch(()=>({}));if(!response.ok)return Response.json({error:data.message||"auto_debit_update_failed"},{status:502});
      return Response.json(Array.isArray(data)?data[0]:data);
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/payments/webhook"){
      try{const rawBody=await readTextBody(request,MAX_WEBHOOK_BODY_BYTES,"webhook_payload_too_large"),result=await new PaymentService(env).webhook(rawBody,request.headers.get("x-razorpay-signature")||"",request.headers.get("x-razorpay-event-id")||"",{onSubscriptionEvent:(eventType,entity)=>new StreamingMembershipService(env,env.FETCHER||fetch).onWebhookEvent(eventType,entity)});if(result.paymentId&&["payment.captured","order.paid"].includes(result.eventType))await recordAnalytics(env,{eventId:`recharge-success:${result.paymentId}`,eventName:"recharge_success",dimension:"registered"});return Response.json(result);}catch(error){return Response.json({error:error.message},{status:error.message.includes("signature")?401:error.message==="webhook_payload_too_large"?413:400});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/streaming-membership/subscribe"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled"]);if(flagsBlocked)return flagsBlocked;const limited=await enforceRateLimit(request,env,"payment",user.id);if(limited)return limited;try{return Response.json(await new StreamingMembershipService(env,env.FETCHER||fetch).createSubscription(user));}catch(error){return Response.json({error:error.message},{status:error.message==="email_verification_required"?403:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/streaming-membership/verify"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const limited=await enforceRateLimit(request,env,"payment",user.id);if(limited)return limited;try{const body=await request.json(),result=await new StreamingMembershipService(env,env.FETCHER||fetch).verifyCheckout({user,subscriptionId:String(body.razorpay_subscription_id||""),paymentId:String(body.razorpay_payment_id||""),signature:String(body.razorpay_signature||"")});return Response.json({verified:true,result});}catch(error){return Response.json({error:error.message},{status:error.message.includes("signature")?400:409});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/streaming-membership/status"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const active=await new StreamingMembershipService(env,env.FETCHER||fetch).status(user.id);return Response.json({active});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/verification/request"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});const limited=await enforceRateLimit(request,env,"payment",user.id);if(limited)return limited;try{return Response.json(await new VerificationService(env,env.FETCHER||fetch).request(user.id));}catch(error){return Response.json({error:error.message},{status:error.message==="verification_requires_consistent_activity"?403:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/wheel/odds"){
      try{const odds=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).wheelOdds();return Response.json({segments:odds});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/wheel/spin"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled"]);if(flagsBlocked)return flagsBlocked;const optInBlocked=await requireBettingOptIn(env,user);if(optInBlocked)return optInBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`wheel-spin:${user.id}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).playWheel(user.id,Number(body.stakeCredits),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["minimum_100_sparks_required","insufficient_credits","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/roulette/spin"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled","game_staking_enabled"]);if(flagsBlocked)return flagsBlocked;const optInBlocked=await requireBettingOptIn(env,user);if(optInBlocked)return optInBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`roulette-spin:${user.id}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).playRoulette(user.id,Number(body.stakeCredits),String(body.betType||""),body.betValue,idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["invalid_stake","invalid_bet","minimum_100_sparks_required","insufficient_credits","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/coin-flip/odds"){
      try{const tiers=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).coinFlipOdds();return Response.json({tiers});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/coin-flip/play"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled","game_staking_enabled"]);if(flagsBlocked)return flagsBlocked;const optInBlocked=await requireBettingOptIn(env,user);if(optInBlocked)return optInBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`coin-flip:${user.id}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).playCoinFlip(user.id,Number(body.stakeCredits),String(body.call||""),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["invalid_stake","invalid_call","minimum_100_sparks_required","insufficient_credits","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/wheel/leaderboard"){
      try{const rows=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).leaderboard("wheel",20);return Response.json({rounds:rows});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/coin-flip/leaderboard"){
      try{const rows=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).leaderboard("coin_flip",20);return Response.json({rounds:rows});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/coin-tower/odds"){
      try{const tiers=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).coinTowerOdds();return Response.json({tiers});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/coin-tower/play"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled","game_staking_enabled"]);if(flagsBlocked)return flagsBlocked;const optInBlocked=await requireBettingOptIn(env,user);if(optInBlocked)return optInBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`coin-tower:${user.id}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).playCoinTower(user.id,Number(body.stakeCredits),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["invalid_stake","minimum_100_sparks_required","insufficient_credits","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/coin-tower/leaderboard"){
      try{const rows=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).leaderboard("coin_tower",20);return Response.json({rounds:rows});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/slots-777/symbols"){
      try{const symbols=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).slots777Symbols();return Response.json({symbols});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/slots-777/play"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled","game_staking_enabled"]);if(flagsBlocked)return flagsBlocked;const optInBlocked=await requireBettingOptIn(env,user);if(optInBlocked)return optInBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`slots-777:${user.id}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).playSlots777(user.id,Number(body.stakeCredits),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["invalid_stake","minimum_100_sparks_required","insufficient_credits","insufficient_balance","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/slots-777/leaderboard"){
      try{const rows=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).leaderboard("slots_777",20);return Response.json({rounds:rows});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/scratch-card/odds"){
      try{const tiers=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).scratchCardOdds();return Response.json({tiers});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/scratch-card/play"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled","game_staking_enabled"]);if(flagsBlocked)return flagsBlocked;const optInBlocked=await requireBettingOptIn(env,user);if(optInBlocked)return optInBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`scratch-card:${user.id}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).playScratchCard(user.id,Number(body.stakeCredits),Number(body.tileIndex),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["invalid_stake","invalid_tile","minimum_100_sparks_required","insufficient_credits","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/scratch-card/leaderboard"){
      try{const rows=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).leaderboard("scratch_card",20);return Response.json({rounds:rows});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/streak-ladder/odds"){
      try{const rungs=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).streakLadderOdds();return Response.json({rungs});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/streak-ladder/start"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled","game_staking_enabled"]);if(flagsBlocked)return flagsBlocked;const optInBlocked=await requireBettingOptIn(env,user);if(optInBlocked)return optInBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`streak-ladder:${user.id}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).startStreakLadder(user.id,Number(body.stakeCredits),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["invalid_stake","insufficient_credits","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/streak-ladder/climb"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled","game_staking_enabled"]);if(flagsBlocked)return flagsBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`streak-ladder-climb:${user.id}:${body.roundId}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).climbStreakLadder(user.id,Number(body.roundId),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["round_not_found","round_not_active","already_maxed"].includes(error.message)?404:400});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/streak-ladder/cashout"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled","game_staking_enabled"]);if(flagsBlocked)return flagsBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`streak-ladder-cashout:${user.id}:${body.roundId}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).cashoutStreakLadder(user.id,Number(body.roundId),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["round_not_found","round_not_active","nothing_to_cash_out"].includes(error.message)?404:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/streak-ladder/leaderboard"){
      try{const rows=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).leaderboard("streak_ladder",20);return Response.json({rounds:rows});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/jackpot/current"){
      try{const round=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).currentJackpotRound();return Response.json({round});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/jackpot/buy"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled"]);if(flagsBlocked)return flagsBlocked;const optInBlocked=await requireBettingOptIn(env,user);if(optInBlocked)return optInBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`jackpot-buy:${user.id}:${crypto.randomUUID()}`;try{const walletResponse=await supabaseRest(env,user,`/wallets?select=balance&user_id=eq.${encodeURIComponent(user.id)}&limit=1`),[wallet]=walletResponse.ok?await walletResponse.json():[null];if(!wallet||wallet.balance<10000)return Response.json({error:"minimum_100_sparks_required"},{status:403});const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).buyJackpotTickets(user.id,Number(body.ticketCount),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["insufficient_credits","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/jackpot/leaderboard"){
      try{const rows=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).leaderboard("jackpot",20);return Response.json({rounds:rows});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/trivia/current"){
      try{const round=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).currentTriviaRound();return Response.json({round});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/trivia/submit"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled"]);if(flagsBlocked)return flagsBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`trivia-submit:${user.id}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).submitTriviaEntry(user.id,body.answers,Number(body.responseMs),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["already_submitted","round_closed","insufficient_credits","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/guest-win/play"){
      const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});const limited=await enforceRateLimit(request,env,"guest-win",claims.sub);if(limited)return limited;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).playGuestWin(claims.sub);return Response.json({won:result.won,sparks_reward:result.sparks_reward,claim_deadline:result.claim_deadline});}catch(error){return Response.json({error:error.message},{status:["guest_win_cooldown","guest_win_disabled"].includes(error.message)?403:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/guest-win/status"){
      const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).guestWinStatus(claims.sub);return Response.json(result?{sparks_reward:result.sparks_reward,claim_deadline:result.claim_deadline}:{sparks_reward:null,claim_deadline:null});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/guest-win/claim"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const body=await request.json();if(typeof body.anonId!=="string"||!body.anonId)return Response.json({error:"invalid_anonymous_session"},{status:400});try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).claimGuestWin(body.anonId,user.id);return Response.json({balance:result.balance,sparks_reward:result.sparks_reward});}catch(error){return Response.json({error:error.message},{status:error.message==="guest_win_not_found_or_expired"?410:400});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/ad-earning/claim"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const limited=await enforceRateLimit(request,env,"ad_reward",user.id);if(limited)return limited;const body=await request.json().catch(()=>({}));if(typeof body.requestId!=="string"||!/^[a-zA-Z0-9-]{8,100}$/.test(body.requestId))return Response.json({error:"invalid_request_id"},{status:400});try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).claimAdReward(user.id,body.requestId);return Response.json({balance:result.balance,creditsAwarded:result.credits_awarded,idempotent:result.idempotent});}catch(error){return Response.json({error:error.message},{status:["ad_earning_disabled","ad_earning_not_eligible"].includes(error.message)?403:["ad_reward_cooldown","ad_reward_daily_cap_reached"].includes(error.message)?429:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/daily-streak/status"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});try{const status=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).dailyStreakStatus(user.id);return Response.json(status);}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/daily-streak/claim"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const limited=await enforceRateLimit(request,env,"daily_streak",user.id);if(limited)return limited;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).claimDailyStreakBonus(user.id);return Response.json({balance:result.balance,streakCount:result.streak_count,creditsAwarded:result.credits_awarded,idempotent:result.idempotent});}catch(error){return Response.json({error:error.message},{status:error.message==="daily_streak_disabled"?403:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/daily-usage"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});try{const usage=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).dailyStakeUsage(user.id);return Response.json(usage);}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/trivia/leaderboard"){
      try{const rows=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).leaderboard("trivia",20);return Response.json({rounds:rows});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/reflex/tiers"){
      try{const tiers=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).reflexTapTiers();return Response.json({tiers});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/games/reflex/play"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled"]);if(flagsBlocked)return flagsBlocked;const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`reflex-play:${user.id}:${crypto.randomUUID()}`;try{const result=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).playReflexTap(user.id,Number(body.stakeCredits),Number(body.responseMs),Boolean(body.falseStart),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["minimum_100_sparks_required","insufficient_credits","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/games/reflex/leaderboard"){
      try{const rows=await new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).leaderboard("reflex_tap",20);return Response.json({rounds:rows});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/sports/matches"){
      const flagsBlocked=await requireFlags(env,["games_enabled"]);if(flagsBlocked)return flagsBlocked;
      try{const matches=await new SportsService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).liveMatches();return Response.json({matches});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/sports/markets"){
      const flagsBlocked=await requireFlags(env,["games_enabled"]);if(flagsBlocked)return flagsBlocked;
      const matchId=url.searchParams.get("matchId")||"";
      try{const markets=await new SportsService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).marketsForMatch(matchId);return Response.json({markets});}catch(error){return Response.json({error:error.message},{status:error.message==="invalid_match"?400:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/sports/bet"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});const flagsBlocked=await requireFlags(env,["payments_enabled","games_enabled","game_staking_enabled"]);if(flagsBlocked)return flagsBlocked;
      const optInBlocked=await requireBettingOptIn(env,user);if(optInBlocked)return optInBlocked;
      const limited=await enforceRateLimit(request,env,"games",user.id);if(limited)return limited;const body=await request.json(),idempotencyKey=`sport-bet:${user.id}:${crypto.randomUUID()}`;
      try{const result=await new SportsService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).placeBet(user.id,body.marketId,body.outcomeId,Number(body.stakeCredits),idempotencyKey);return Response.json(result);}catch(error){return Response.json({error:error.message},{status:["invalid_stake","market_closed","invalid_outcome","insufficient_credits","daily_stake_cap_reached"].includes(error.message)?403:400});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/sports/opt-in"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});
      const response=await supabaseRest(env,user,"/rpc/opt_in_to_betting",{method:"POST",body:JSON.stringify({})});const data=await response.json().catch(()=>({}));
      if(!response.ok)return Response.json({error:data.message||"opt_in_failed"},{status:400});
      return Response.json(Array.isArray(data)?data[0]:data);
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/sports/my-bets"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});
      try{const bets=await new SportsService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch}).myBets(user.id,50);return Response.json({bets});}catch(error){return Response.json({error:error.message},{status:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/reconnect/request"){
      const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});const flagsBlocked=await requireFlags(env,["favourite_reconnect_enabled"]);if(flagsBlocked)return flagsBlocked;const accountToken=request.headers.get("x-account-authorization"),accountRequest=new Request(request.url,{headers:{authorization:accountToken||""}}),user=await verifySupabaseUser(accountRequest,env);if(!user?.emailVerified)return Response.json({error:"verified_account_required"},{status:403});const profileResponse=await supabaseRest(env,user,`/profiles?select=public_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`),profile=profileResponse.ok?(await profileResponse.json())[0]:null,restrictions=await new RestrictionService(env,env.FETCHER||fetch).find([claims.sub,user.id,profile?.public_id]);if(restrictions.length)return Response.json({error:"account_restricted",status:restrictions[0].status},{status:403});const body=await request.json();return shard(env,"MATCHMAKING").fetch("https://match.internal/reconnect/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initiatorId:claims.sub,initiatorUserId:user.id,initiatorPublicId:profile?.public_id||null,targetId:String(body.targetPeerId||"")})});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/reconnect/cancel"){const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});return shard(env,"MATCHMAKING").fetch("https://match.internal/reconnect/cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initiatorId:claims.sub})});}
    if(request.method==="GET"&&url.pathname==="/api/v1/reconnect/request"){
      const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});return shard(env,"MATCHMAKING").fetch(`https://match.internal/reconnect/poll/${claims.sub}`);
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/reconnect/respond"){
      const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});const body=await request.json();return shard(env,"MATCHMAKING").fetch("https://match.internal/reconnect/respond",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetId:claims.sub,requestId:String(body.requestId||""),accepted:body.accepted===true})});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/match/search")return proxyJson(request,env,"/search",{authorizeSearch:true,activity:"search_started"});
    if(request.method==="POST"&&url.pathname==="/api/v1/match/cancel")return proxyJson(request,env,"/cancel");
    if(request.method==="POST"&&url.pathname==="/api/v1/match/end")return proxyJson(request,env,"/end");
    if(request.method==="GET"&&url.pathname==="/api/v1/match/result"){const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});const forcePersonaId=env.ALLOW_FORCE_PERSONA==="1"?url.searchParams.get("forcePersonaId"):null;return shard(env,"MATCHMAKING").fetch(`https://match.internal/result/${claims.sub}${forcePersonaId?`?forcePersonaId=${encodeURIComponent(forcePersonaId)}`:""}`);}
    if(request.method==="POST"&&url.pathname==="/api/v1/presence/heartbeat"){const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});const body=await request.json(),accountToken=request.headers.get("x-account-authorization"),accountRequest=new Request(request.url,{headers:{authorization:accountToken||""}}),account=accountToken?await verifySupabaseUser(accountRequest,env):null;let publicRef=null;if(account?.emailVerified){const response=await supabaseRest(env,account,`/profiles?select=public_id&user_id=eq.${encodeURIComponent(account.id)}&limit=1`);if(response.ok)publicRef=(await response.json())[0]?.public_id||null;}return shard(env,"PRESENCE").fetch("https://presence.internal/status",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,identityId:claims.sub,anonymous:!account?.emailVerified,accountUserId:account?.emailVerified?account.id:null,publicRef})});}
    if(request.method==="POST"&&url.pathname==="/api/v1/party-rooms"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});
      const body=await request.json(),roomType=String(body.roomType||""),priceTier=String(body.priceTier||""),name=String(body.name||"").trim(),months=Number(body.months)||1;
      if(!validRoomTypeId(roomType)||!validPriceTierId(priceTier))return Response.json({error:"invalid_room_config"},{status:400});
      const response=await supabaseRest(env,user,"/rpc/create_party_room",{method:"POST",body:JSON.stringify({desired_room_type:roomType,desired_price_tier:priceTier,desired_name:name,desired_months:months})});
      if(!response.ok){const error=await response.json().catch(()=>({}));return Response.json({error:error.message||"party_room_create_failed"},{status:error.message==="insufficient_credits"?402:400});}
      const row=(await response.json())[0]||null;
      return Response.json(row?{publicId:row.public_id,joinCode:row.join_code,endsAt:row.ends_at,balance:row.balance,idempotent:row.idempotent,roomType,name}:null);
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/party-rooms/public"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});
      const response=await supabaseRest(env,user,"/rpc/list_public_radio_rooms",{method:"POST",body:"{}"});
      if(!response.ok)return Response.json({error:"public_rooms_failed"},{status:400});
      const rows=await response.json();
      const listenerCounts=await Promise.all(rows.map(row=>shard(env,"PARTY_ROOM",row.public_id).fetch("https://party-room.internal/listeners").then(r=>r.json()).then(d=>d.count||0).catch(()=>0)));
      return Response.json({rooms:rows.map((row,index)=>({publicId:row.public_id,name:row.name,joinCode:row.join_code,roomType:row.room_type,nowPlaying:row.now_playing_title?{title:row.now_playing_title,artistName:row.now_playing_artist}:null,realListeners:listenerCounts[index],artistSpotifyUrl:row.artist_spotify_url,artistAppleMusicUrl:row.artist_apple_music_url,curatedOnly:row.curated_only}))});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/party-rooms/join"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});
      const body=await request.json(),joinCode=String(body.joinCode||"").trim();if(!joinCode)return Response.json({error:"invalid_join_code"},{status:400});
      const response=await supabaseRest(env,user,"/rpc/join_party_room_by_code",{method:"POST",body:JSON.stringify({desired_join_code:joinCode})});
      if(!response.ok){const error=await response.json().catch(()=>({}));return Response.json({error:error.message||"join_failed"},{status:404});}
      const row=(await response.json())[0]||null;
      return Response.json(row?{publicId:row.public_id,roomType:row.room_type,name:row.name,joinCode}:null);
    }
    const inviteMatch=url.pathname.match(/^\/api\/v1\/party-rooms\/([0-9a-fA-F-]{36})\/invite$/);
    if(request.method==="POST"&&inviteMatch){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});
      const body=await request.json(),inviteeUserId=body.inviteeUserId?String(body.inviteeUserId):null,inviteeUsername=body.inviteeUsername?String(body.inviteeUsername):null;
      const response=await supabaseRest(env,user,"/rpc/invite_to_party_room",{method:"POST",body:JSON.stringify({target_public_id:inviteMatch[1],invitee_user_id:inviteeUserId,invitee_username:inviteeUsername})});
      if(!response.ok){const error=await response.json().catch(()=>({}));return Response.json({error:error.message||"invite_failed"},{status:error.message==="not_authorized"?403:400});}
      return Response.json((await response.json())[0]||null);
    }
    const claimMatch=url.pathname.match(/^\/api\/v1\/party-rooms\/([0-9a-fA-F-]{36})\/claim-host$/);
    if(request.method==="POST"&&claimMatch){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});
      const response=await supabaseRest(env,user,"/rpc/claim_party_room_host",{method:"POST",body:JSON.stringify({target_public_id:claimMatch[1],inactivity_timeout_seconds:HOST_INACTIVITY_TIMEOUT_SECONDS})});
      if(!response.ok){const error=await response.json().catch(()=>({}));return Response.json({error:error.message||"claim_failed"},{status:error.message==="host_slot_active"?409:400});}
      const [row]=await response.json();
      const namespace=env.PARTY_ROOM,stub=namespace.get(namespace.idFromName(claimMatch[1]));
      await stub.fetch("https://party-room.internal/admin/set-host",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({hostUserId:user.id})}).catch(()=>{});
      return Response.json(row||null);
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/radio/channels"){
      const user=await verifySupabaseUser(request,env)||{accessToken:env.SUPABASE_SERVICE_ROLE_KEY};
      const response=await supabaseRest(env,user,"/rpc/list_radio_channels",{method:"POST",body:JSON.stringify({})});
      if(!response.ok)return Response.json({error:"radio_channels_failed"},{status:400});
      const rows=await response.json();
      const listenerCounts=await Promise.all(rows.map(row=>shard(env,"PARTY_ROOM",row.public_id).fetch("https://party-room.internal/listeners").then(r=>r.json()).then(d=>d.count||0).catch(()=>0)));
      return Response.json({channels:rows.map((row,index)=>({publicId:row.public_id,name:row.name,roomType:row.room_type,curatedOnly:row.curated_only,realListeners:listenerCounts[index],artistSpotifyUrl:row.artist_spotify_url,artistAppleMusicUrl:row.artist_apple_music_url}))});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/admin/radio/tracks"){
      const authorization=await adminUser(request,env);if(authorization.error)return authorization.error;
      const contentType=request.headers.get("content-type")||"";if(!contentType.includes("multipart/form-data"))return Response.json({error:"invalid_upload"},{status:400});
      const form=await request.formData();
      const roomPublicId=String(form.get("roomPublicId")||"");
      const title=String(form.get("title")||"").trim().slice(0,120);
      const artistName=String(form.get("artistName")||"").trim().slice(0,120);
      const durationSeconds=Math.round(Number(form.get("durationSeconds"))||0);
      const audioFile=form.get("audio"),artworkFile=form.get("artwork");
      if(!/^[0-9a-fA-F-]{36}$/.test(roomPublicId))return Response.json({error:"invalid_room"},{status:400});
      if(!title)return Response.json({error:"invalid_track_title"},{status:400});
      if(!Number.isFinite(durationSeconds)||durationSeconds<30||durationSeconds>900)return Response.json({error:"invalid_track_duration"},{status:400});
      if(!(audioFile instanceof File)||audioFile.size<1000||audioFile.size>25*1024*1024)return Response.json({error:"invalid_audio_file"},{status:400});
      const audioBytes=new Uint8Array(await audioFile.arrayBuffer());
      const audioExt=looksLikeAudio(audioBytes);
      if(!audioExt)return Response.json({error:"not_a_valid_audio_track"},{status:400});
      let artworkKey=null;
      if(artworkFile instanceof File&&artworkFile.size>0){
        if(artworkFile.size>5*1024*1024)return Response.json({error:"invalid_artwork_file"},{status:400});
        const artworkBytes=new Uint8Array(await artworkFile.arrayBuffer());
        const artworkExt=looksLikeImage(artworkBytes);
        if(!artworkExt)return Response.json({error:"invalid_artwork_file"},{status:400});
        artworkKey=`radio/${roomPublicId}/${crypto.randomUUID()}.${artworkExt}`;
        await env.RADIO_BUCKET.put(artworkKey,artworkBytes,{httpMetadata:{contentType:artworkFile.type||"image/jpeg"}});
      }
      const storageKey=`radio/${roomPublicId}/${crypto.randomUUID()}.${audioExt}`;
      await env.RADIO_BUCKET.put(storageKey,audioBytes,{httpMetadata:{contentType:audioFile.type||"audio/mpeg"}});
      const service=new RadioService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch});
      try{
        const result=await service.rpc("admin_submit_radio_track",{target_room_public_id:roomPublicId,target_title:title,target_artist_name:artistName||null,target_storage_key:storageKey,target_artwork_key:artworkKey,target_duration_seconds:durationSeconds});
        return Response.json(result?.[0]||null);
      }catch(error){
        await env.RADIO_BUCKET.delete(storageKey).catch(()=>{});if(artworkKey)await env.RADIO_BUCKET.delete(artworkKey).catch(()=>{});
        return Response.json({error:error.message||"radio_submit_failed"},{status:400});
      }
    }
    const radioQueueMatch=url.pathname.match(/^\/api\/v1\/party-rooms\/([0-9a-fA-F-]{36})\/radio\/tracks$/);
    if(request.method==="GET"&&radioQueueMatch){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});
      const response=await supabaseRest(env,user,"/rpc/list_radio_queue",{method:"POST",body:JSON.stringify({target_room_public_id:radioQueueMatch[1]})});
      if(!response.ok)return Response.json({error:"radio_queue_failed"},{status:400});
      const rows=await response.json();
      return Response.json({tracks:rows.map(row=>({id:row.id,title:row.title,artistName:row.artist_name,artworkUrl:row.artwork_key?`/api/v1/radio-media/${row.artwork_key}`:null,durationSeconds:row.duration_seconds,status:row.status,listenerMessage:row.listener_message}))});
    }
    if(request.method==="POST"&&radioQueueMatch){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});
      const contentType=request.headers.get("content-type")||"";if(!contentType.includes("multipart/form-data"))return Response.json({error:"invalid_upload"},{status:400});
      const form=await request.formData();
      const rightsAttested=form.get("rightsAttested")==="true";
      const title=String(form.get("title")||"").trim().slice(0,120);
      const artistName=String(form.get("artistName")||"").trim().slice(0,120);
      const listenerMessage=String(form.get("message")||"").trim().slice(0,200);
      const durationSeconds=Math.round(Number(form.get("durationSeconds"))||0);
      const audioFile=form.get("audio"),artworkFile=form.get("artwork");
      if(!rightsAttested)return Response.json({error:"rights_attestation_required"},{status:400});
      if(!title)return Response.json({error:"invalid_track_title"},{status:400});
      if(!Number.isFinite(durationSeconds)||durationSeconds<30||durationSeconds>900)return Response.json({error:"invalid_track_duration"},{status:400});
      if(!(audioFile instanceof File)||audioFile.size<1000||audioFile.size>25*1024*1024)return Response.json({error:"invalid_audio_file"},{status:400});
      const audioBytes=new Uint8Array(await audioFile.arrayBuffer());
      if(!looksLikeAudio(audioBytes))return Response.json({error:"not_a_valid_audio_track"},{status:400});
      let artworkKey=null;
      if(artworkFile instanceof File&&artworkFile.size>0){
        if(artworkFile.size>5*1024*1024)return Response.json({error:"invalid_artwork_file"},{status:400});
        const artworkBytes=new Uint8Array(await artworkFile.arrayBuffer());
        const artworkExt=looksLikeImage(artworkBytes);
        if(!artworkExt)return Response.json({error:"invalid_artwork_file"},{status:400});
        artworkKey=`radio/${radioQueueMatch[1]}/${crypto.randomUUID()}.${artworkExt}`;
        await env.RADIO_BUCKET.put(artworkKey,artworkBytes,{httpMetadata:{contentType:artworkFile.type||"image/jpeg"}});
      }
      const audioExt=looksLikeAudio(audioBytes);
      const storageKey=`radio/${radioQueueMatch[1]}/${crypto.randomUUID()}.${audioExt}`;
      await env.RADIO_BUCKET.put(storageKey,audioBytes,{httpMetadata:{contentType:audioFile.type||"audio/mpeg"}});
      const response=await supabaseRest(env,user,"/rpc/submit_radio_track",{method:"POST",body:JSON.stringify({target_room_public_id:radioQueueMatch[1],target_title:title,target_artist_name:artistName||null,target_storage_key:storageKey,target_artwork_key:artworkKey,target_duration_seconds:durationSeconds,target_rights_attested:true,target_listener_message:listenerMessage||null})});
      if(!response.ok){await env.RADIO_BUCKET.delete(storageKey).catch(()=>{});if(artworkKey)await env.RADIO_BUCKET.delete(artworkKey).catch(()=>{});const error=await response.json().catch(()=>({}));return Response.json({error:error.message||"radio_submit_failed"},{status:400});}
      return Response.json((await response.json())[0]||null);
    }
    const radioMediaMatch=url.pathname.match(/^\/api\/v1\/radio-media\/((?:radio\/[0-9a-fA-F-]{36}|avatars\/[0-9a-fA-F-]{36})\/[a-zA-Z0-9-]+\.[a-z0-9]{2,5})$/);
    if(request.method==="GET"&&radioMediaMatch){
      const key=radioMediaMatch[1];
      if(key.startsWith("radio/")&&env.ANON_SESSION_SECRET){
        const claims=await verifyAnonymousToken(url.searchParams.get("t"),env.ANON_SESSION_SECRET);
        if(!claims||claims.kind!=="radio-media"||claims.sub!==key)return Response.json({error:"expired_or_invalid_media_link"},{status:403});
      }
      const rangeHeader=request.headers.get("range"),rangeMatch=rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);
      const r2Range=rangeMatch?{offset:Number(rangeMatch[1]),length:rangeMatch[2]?Number(rangeMatch[2])-Number(rangeMatch[1])+1:undefined}:undefined;
      const object=await env.RADIO_BUCKET.get(key,r2Range?{range:r2Range}:{});
      if(!object)return Response.json({error:"not_found"},{status:404});
      const headers={"content-type":object.httpMetadata?.contentType||"application/octet-stream","cache-control":"private, max-age=60","content-disposition":"inline","accept-ranges":"bytes"};
      if(r2Range&&object.range){headers["content-range"]=`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`;return new Response(object.body,{status:206,headers});}
      return new Response(object.body,{headers});
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/forums"){
      const flagsBlocked=await requireFlags(env,["forums_enabled"]);if(flagsBlocked)return flagsBlocked;
      const counts=await Promise.all(FORUM_TOPICS.map(topic=>shard(env,"FORUM_ROOM",topic.id).fetch("https://forum-room.internal/listeners").then(r=>r.json()).then(d=>d.count||0).catch(()=>0)));
      return Response.json({topics:FORUM_TOPICS.map((topic,index)=>({...topic,online:counts[index]}))});
    }
    const forumSocketMatch=url.pathname.match(/^\/api\/v1\/forums\/([a-z]+)\/socket$/);
    if(forumSocketMatch){
      if(!validForumTopicId(forumSocketMatch[1]))return Response.json({error:"invalid_forum_topic"},{status:404});
      if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return Response.json({error:"websocket_upgrade_required"},{status:426});
      const flagsBlocked=await requireFlags(env,["forums_enabled"]);if(flagsBlocked)return flagsBlocked;
      const token=url.searchParams.get("token"),authRequest=token?new Request(request.url,{headers:{authorization:`Bearer ${token}`}}):null,user=authRequest?await verifySupabaseUser(authRequest,env):null;
      if(!user)return Response.json({error:"invalid_account_session"},{status:401});
      const id=env.FORUM_ROOM.idFromName(forumSocketMatch[1]);
      const internal=new URL("https://forum-room.internal/socket"),headers=new Headers(request.headers);internal.searchParams.set("accountUserId",user.id);internal.searchParams.set("handle",user.email?.split("@")[0]||"Anonymous");headers.delete("authorization");
      return env.FORUM_ROOM.get(id).fetch(new Request(internal,{method:"GET",headers}));
    }
    const partySocketMatch=url.pathname.match(/^\/api\/v1\/party-rooms\/([0-9a-fA-F-]{36})\/socket$/);
    if(partySocketMatch){
      if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return Response.json({error:"websocket_upgrade_required"},{status:426});
      const claims=await anonymousClaims(request,env,webSocketToken(request));if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});
      const accountToken=url.searchParams.get("accountToken"),accountRequest=accountToken?new Request(request.url,{headers:{authorization:`Bearer ${accountToken}`}}):null,account=accountRequest?await verifySupabaseUser(accountRequest,env):null;
      const id=env.PARTY_ROOM.idFromName(partySocketMatch[1]);
      const internal=new URL(`https://party-room.internal${url.pathname}`),headers=new Headers(request.headers);internal.searchParams.set("participantId",claims.sub);if(account)internal.searchParams.set("accountUserId",account.id);if(url.searchParams.get("isHost")==="1")internal.searchParams.set("isHost","1");if(url.searchParams.get("roomType"))internal.searchParams.set("roomType",url.searchParams.get("roomType"));headers.delete("authorization");return env.PARTY_ROOM.get(id).fetch(new Request(internal,{method:"GET",headers}));
    }
    const match = url.pathname.match(/^\/api\/v1\/chat\/([a-zA-Z0-9_-]{8,80})\/socket$/);
    if (match) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return Response.json({ error: "websocket_upgrade_required" }, { status: 426 });
      const claims=await anonymousClaims(request,env,webSocketToken(request));if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});
      const authorized=await shard(env,"MATCHMAKING").fetch("https://match.internal/authorize-session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identityId:claims.sub,sessionId:match[1]})});if(!authorized.ok)return Response.json({error:"session_not_authorized"},{status:403});const authorization=await authorized.json();
      const id = env.CHAT_SESSION.idFromName(match[1]);
      const internal=new URL(`https://chat.internal${url.pathname}`),headers=new Headers(request.headers);internal.searchParams.set("identityId",claims.sub);if(authorization.accountUserId)internal.searchParams.set("accountUserId",authorization.accountUserId);if(authorization.accountPublicId)internal.searchParams.set("accountPublicId",authorization.accountPublicId);if(authorization.virtual)internal.searchParams.set("virtual","1");if(authorization.virtualPeer)internal.searchParams.set("virtualPeer",JSON.stringify(authorization.virtualPeer));if(authorization.mode)internal.searchParams.set("mode",authorization.mode);if(url.searchParams.get("resumeToken"))internal.searchParams.set("resumeToken",url.searchParams.get("resumeToken"));headers.delete("authorization");headers.set("sec-websocket-protocol","random-chat.v1");return env.CHAT_SESSION.get(id).fetch(new Request(internal,{method:"GET",headers}));
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  }
export default {async scheduled(event,env,ctx){const games=new GamesService({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,fetcher:env.FETCHER||fetch});ctx.waitUntil(games.drawDueJackpotRounds().catch(error=>console.error("jackpot_draw_failed",error.message)));ctx.waitUntil(games.settleDueTriviaRounds().catch(error=>console.error("trivia_settle_failed",error.message)));ctx.waitUntil(new AdminService(env,env.FETCHER||fetch).expirePremiumMemberships().catch(error=>console.error("premium_expiry_sweep_failed",error.message)));ctx.waitUntil(new AdminService(env,env.FETCHER||fetch).runAutoDebitPremiumSweep().catch(error=>console.error("premium_auto_debit_sweep_failed",error.message)));},async fetch(request,env){const origin=allowedOrigin(request,env);if(origin===false)return secureResponse(Response.json({error:"origin_not_allowed"},{status:403}),request,env);if(request.method==="OPTIONS"){const response=new Response(null,{status:204,headers:{"access-control-allow-methods":"GET, POST, PUT, DELETE, OPTIONS","access-control-allow-headers":"authorization, x-account-authorization, content-type, x-event-id","access-control-max-age":"86400"}});return secureResponse(response,request,env);}try{const url=new URL(request.url),hasApiBody=["POST","PUT","DELETE"].includes(request.method)&&request.body&&url.pathname!=="/api/v1/payments/webhook"&&!/\/radio\/tracks$/.test(url.pathname)&&url.pathname!=="/api/v1/admin/radio/tracks";if(hasApiBody){const body=await readTextBody(request,MAX_API_BODY_BYTES);request=new Request(request.url,{method:request.method,headers:request.headers,body});}return secureResponse(await handleRequest(request,env),request,env);}catch(error){if(error.message==="payload_too_large")return secureResponse(Response.json({error:error.message},{status:413}),request,env);const requestId=crypto.randomUUID();console.error("Unhandled request error",{requestId,name:error?.name});return secureResponse(Response.json({error:"internal_error",requestId},{status:500}),request,env);}}};
export { AnonymousIdentityShard,ChatSession,DeviceOwnershipShard,MatchmakingShard,PartyRoomShard,PresenceShard,RateLimitShard,ListenerRegistryShard,ForumRoomShard };
