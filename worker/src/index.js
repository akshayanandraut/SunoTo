import { ChatSession } from "./durable/ChatSession.js";
import { MatchmakingShard } from "./durable/MatchmakingShard.js";
import { PresenceShard } from "./durable/PresenceShard.js";
import { AnonymousIdentityShard } from "./durable/AnonymousIdentityShard.js";
import { ipPrefix,keyedFingerprint,verifyAnonymousToken } from "./auth/anonymousToken.js";
import { verifySupabaseUser,supabaseRest } from "./auth/supabaseUser.js";
import { DeviceOwnershipShard } from "./durable/DeviceOwnershipShard.js";
import { validUsername } from "./policies/usernamePolicy.js";
import { PaymentService } from "./services/PaymentService.js";
import { hasPaidPreferences,normalizePaidPreferences } from "./policies/preferencePolicy.js";
import { ConfigService } from "./services/ConfigService.js";
import { DEFAULT_AD_CONFIG } from "./policies/adPolicy.js";

function shard(env,binding,name="global"){const namespace=env[binding];return namespace.get(namespace.idFromName(name));}
function bearer(request){const value=request.headers.get("authorization")||"";return value.startsWith("Bearer ")?value.slice(7):null}
function webSocketToken(request){return(request.headers.get("sec-websocket-protocol")||"").split(",").map(value=>value.trim()).find(value=>value.startsWith("rc-auth."))?.slice(8)||null}
async function anonymousClaims(request,env,token=bearer(request)){return env.ANON_SESSION_SECRET?verifyAnonymousToken(token,env.ANON_SESSION_SECRET):null}
async function anonymousStub(env){return shard(env,"ANONYMOUS")}
async function proxyJson(request,env,path,{authorizeSearch=false,activity}={}){const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});const anon=await anonymousStub(env),body=await request.json();if(authorizeSearch){try{const preferences=normalizePaidPreferences(body.preferences||{});body.preferences=preferences;const accountToken=request.headers.get("x-account-authorization"),accountRequest=new Request(request.url,{headers:{authorization:accountToken||""}}),user=accountToken?await verifySupabaseUser(accountRequest,env):null;if(hasPaidPreferences(preferences)&&!user?.emailVerified)return Response.json({error:"verified_account_required_for_preferences"},{status:403});if(user){body.accountUserId=user.id;const blocks=await supabaseRest(env,user,"/blocks?select=blocked_ref");if(blocks.ok)body.blockedRefs=(await blocks.json()).map(item=>item.blocked_ref);}const allowed=await anon.fetch("https://anonymous.internal/authorize-search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identityId:claims.sub,registered:Boolean(user?.emailVerified)})});if(!allowed.ok)return allowed;}catch(error){return Response.json({error:error.message},{status:400});}}body.identityId=claims.sub;if(activity)await anon.fetch("https://anonymous.internal/activity",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:activity})});return shard(env,"MATCHMAKING").fetch(`https://match.internal${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
export async function adminUser(request,env,verify=verifySupabaseUser){const user=await verify(request,env);if(!user)return{error:Response.json({error:"invalid_admin_session"},{status:401})};if(!user.emailVerified||!env.ADMIN_USER_ID||user.id!==env.ADMIN_USER_ID)return{error:Response.json({error:"admin_forbidden"},{status:403})};return{user};}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/health") return Response.json({ ok: true, service: "random-chat-worker", phase: 19 });
    if(request.method==="GET"&&url.pathname==="/api/v1/config/public"){try{const ads=await new ConfigService(env).ads();return Response.json({ads:ads.config,version:ads.version});}catch{return Response.json({ads:DEFAULT_AD_CONFIG,version:0});}}
    if(url.pathname==="/api/v1/admin/ads"&&(request.method==="GET"||request.method==="PUT")){
      const authorization=await adminUser(request,env);if(authorization.error)return authorization.error;const config=new ConfigService(env);try{if(request.method==="GET")return Response.json(await config.ads());const body=await request.json();if(!Number.isSafeInteger(body.expectedVersion))return Response.json({error:"invalid_config_version"},{status:400});return Response.json(await config.updateAds({adminId:authorization.user.id,expectedVersion:body.expectedVersion,config:body.config}));}catch(error){return Response.json({error:error.message},{status:error.message.includes("version_conflict")?409:400});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/anonymous/session"){
      if(!env.ANON_SESSION_SECRET)return Response.json({error:"anonymous_sessions_not_configured"},{status:503});const body=await request.json(),prefix=ipPrefix(request.headers.get("CF-Connecting-IP")||"unknown"),ipHash=await keyedFingerprint(prefix,env.ANON_SESSION_SECRET);return (await anonymousStub(env)).fetch("https://anonymous.internal/issue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,ipHash})});
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/me/profile"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});const response=await supabaseRest(env,user,`/profiles?select=public_id,username,username_change_count,username_changed_at&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);if(!response.ok)return Response.json({error:"profile_lookup_failed"},{status:502});const [profile]=await response.json();return Response.json({user:{id:user.id,email:user.email,emailVerified:user.emailVerified},profile:profile||null});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/username"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});const body=await request.json(),username=String(body.username||"").trim();if(!validUsername(username))return Response.json({error:"invalid_username"},{status:400});const response=await supabaseRest(env,user,"/rpc/claim_username",{method:"POST",body:JSON.stringify({desired_username:username})});if(!response.ok){const error=await response.json().catch(()=>({}));return Response.json({error:error.message||"username_update_failed"},{status:response.status===409?409:400});}return Response.json({profile:(await response.json())[0]||null});
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
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});if(!user.emailVerified)return Response.json({error:"email_verification_required"},{status:403});try{const body=await request.json();return Response.json(await new PaymentService(env).createOrder(user,Number(body.amountPaise),body.couponCode?String(body.couponCode):null));}catch(error){return Response.json({error:error.message},{status:error.message.includes("coupon")||error.message==="minimum_recharge_50"?400:502});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/payments/verify"){
      const user=await verifySupabaseUser(request,env);if(!user)return Response.json({error:"invalid_account_session"},{status:401});try{const body=await request.json();const result=await new PaymentService(env).verifyCheckout({user,orderId:String(body.razorpay_order_id||""),paymentId:String(body.razorpay_payment_id||""),signature:String(body.razorpay_signature||"")});return Response.json({verified:true,result:result[0]});}catch(error){return Response.json({error:error.message},{status:error.message==="invalid_payment_signature"?400:409});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/payments/webhook"){
      const rawBody=await request.text();try{const result=await new PaymentService(env).webhook(rawBody,request.headers.get("x-razorpay-signature")||"",request.headers.get("x-razorpay-event-id")||"");return Response.json(result);}catch(error){return Response.json({error:error.message},{status:error.message.includes("signature")?401:400});}
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/reconnect/request"){
      const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});const accountToken=request.headers.get("x-account-authorization"),accountRequest=new Request(request.url,{headers:{authorization:accountToken||""}}),user=await verifySupabaseUser(accountRequest,env);if(!user?.emailVerified)return Response.json({error:"verified_account_required"},{status:403});const body=await request.json();return shard(env,"MATCHMAKING").fetch("https://match.internal/reconnect/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initiatorId:claims.sub,initiatorUserId:user.id,targetId:String(body.targetPeerId||"")})});
    }
    if(request.method==="GET"&&url.pathname==="/api/v1/reconnect/request"){
      const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});return shard(env,"MATCHMAKING").fetch(`https://match.internal/reconnect/poll/${claims.sub}`);
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/reconnect/respond"){
      const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});const body=await request.json();return shard(env,"MATCHMAKING").fetch("https://match.internal/reconnect/respond",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetId:claims.sub,requestId:String(body.requestId||""),accepted:body.accepted===true})});
    }
    if(request.method==="POST"&&url.pathname==="/api/v1/match/search")return proxyJson(request,env,"/search",{authorizeSearch:true,activity:"search_started"});
    if(request.method==="POST"&&url.pathname==="/api/v1/match/cancel")return proxyJson(request,env,"/cancel");
    if(request.method==="POST"&&url.pathname==="/api/v1/match/end")return proxyJson(request,env,"/end");
    if(request.method==="GET"&&url.pathname==="/api/v1/match/result"){const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});return shard(env,"MATCHMAKING").fetch(`https://match.internal/result/${claims.sub}`);}
    if(request.method==="POST"&&url.pathname==="/api/v1/presence/heartbeat"){const claims=await anonymousClaims(request,env);if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});const body=await request.json();return shard(env,"PRESENCE").fetch("https://presence.internal/status",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,identityId:claims.sub,anonymous:true})});}
    const match = url.pathname.match(/^\/api\/v1\/chat\/([a-zA-Z0-9_-]{8,80})\/socket$/);
    if (match) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return Response.json({ error: "websocket_upgrade_required" }, { status: 426 });
      const claims=await anonymousClaims(request,env,webSocketToken(request));if(!claims)return Response.json({error:"invalid_anonymous_session"},{status:401});
      const authorized=await shard(env,"MATCHMAKING").fetch("https://match.internal/authorize-session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identityId:claims.sub,sessionId:match[1]})});if(!authorized.ok)return Response.json({error:"session_not_authorized"},{status:403});const authorization=await authorized.json();
      const id = env.CHAT_SESSION.idFromName(match[1]);
      const internal=new URL(`https://chat.internal${url.pathname}`),headers=new Headers(request.headers);internal.searchParams.set("identityId",claims.sub);if(authorization.accountUserId)internal.searchParams.set("accountUserId",authorization.accountUserId);if(authorization.virtual)internal.searchParams.set("virtual","1");if(url.searchParams.get("resumeToken"))internal.searchParams.set("resumeToken",url.searchParams.get("resumeToken"));headers.delete("authorization");headers.set("sec-websocket-protocol","random-chat.v1");return env.CHAT_SESSION.get(id).fetch(new Request(internal,{method:"GET",headers}));
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  }
};
export { AnonymousIdentityShard,ChatSession,DeviceOwnershipShard,MatchmakingShard,PresenceShard };
