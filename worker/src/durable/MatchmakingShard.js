import { MatchmakingService } from "../services/MatchmakingService.js";
import { recordSkip } from "../policies/skipAbusePolicy.js";
import { SESSION_DEFAULTS } from "../config/defaults.js";
import { normalizeMatchProfile,normalizePaidPreferences } from "../policies/preferencePolicy.js";
import { PreferenceChargeService } from "../services/PreferenceChargeService.js";
import { WalletService } from "../services/WalletService.js";
import { ConfigService } from "../services/ConfigService.js";
const STATE_KEY="matchmaking_state";
const ID_PATTERN=/^[a-zA-Z0-9_-]{8,100}$/;
export class MatchmakingShard{
  constructor(state,env){this.state=state;this.env=env}
  async fetch(request){
    const url=new URL(request.url);const saved=(await this.state.storage.get(STATE_KEY))||{};const service=new MatchmakingService(saved);
    if(request.method==="POST"&&url.pathname==="/search"){
      const body=await request.json();if(!ID_PATTERN.test(body.identityId||""))return Response.json({error:"invalid_identity"},{status:400});
      let preferences,profile,result;const accountByIdentity=Object.fromEntries(service.queue.map(item=>[item.identityId,item.accountUserId||null]));accountByIdentity[body.identityId]=body.accountUserId||null;try{preferences=normalizePaidPreferences(body.preferences||{});profile=normalizeMatchProfile(body.profile||{});result=service.search({identityId:body.identityId,accountUserId:body.accountUserId||null,blockedPeerIds:Array.isArray(body.blockedPeerIds)?body.blockedPeerIds.slice(0,500):[],blockedRefs:Array.isArray(body.blockedRefs)?body.blockedRefs.slice(0,500):[],available:true,profile,preferences});if(result.status==="matched"){const peerResult=service.results[result.peerId];if(result.preferenceFee||peerResult?.preferenceFee)await new PreferenceChargeService({url:this.env.SUPABASE_URL,serviceKey:this.env.SUPABASE_SERVICE_ROLE_KEY}).chargePair({sessionId:result.sessionId,left:{userId:body.accountUserId,result},right:{userId:accountByIdentity[result.peerId],result:peerResult}});}}catch(error){if(result?.status==="matched")service.end(body.identityId,result.sessionId);await this.state.storage.put(STATE_KEY,service.snapshot());return Response.json({error:error.message||"preference_match_failed"},{status:error.message?.includes("insufficient")?402:400});}await this.state.storage.put(STATE_KEY,service.snapshot());
      await this.setPresence(body.identityId,result.status==="matched"?"chatting":"waiting");if(result.peerId)await this.setPresence(result.peerId,"chatting");return Response.json(result,{status:result.status==="already_active"?409:200});
    }
    const resultMatch=url.pathname.match(/^\/result\/([a-zA-Z0-9_-]{8,100})$/);
    if(request.method==="GET"&&resultMatch){try{let result=service.result(resultMatch[1]);if(result.status==="searching"){try{const virtual=await new ConfigService(this.env,this.env.FETCHER||fetch).virtual();result=service.virtualFallback(resultMatch[1],virtual.config);}catch{}}await this.state.storage.put(STATE_KEY,service.snapshot());if(result.status==="matched"&&result.virtual)await this.setPresence(resultMatch[1],"chatting");return Response.json(result);}catch(error){return Response.json({error:error.message},{status:400});}}
    if(request.method==="POST"&&url.pathname==="/cancel"){
      const body=await request.json();if(!ID_PATTERN.test(body.identityId||""))return Response.json({error:"invalid_identity"},{status:400});const result=service.cancel(body.identityId);await this.state.storage.put(STATE_KEY,service.snapshot());await this.setPresence(body.identityId,"online");return Response.json(result);
    }
    if(request.method==="POST"&&url.pathname==="/end"){
      const body=await request.json();const result=service.end(body.identityId,body.sessionId);await this.state.storage.put(STATE_KEY,service.snapshot());if(result.status==="ended"){await this.setPresence(body.identityId,"online");await this.setPresence(result.peerId,"online");}return Response.json(result);
    }
    if(request.method==="POST"&&url.pathname==="/skip"){
      const body=await request.json();if(!ID_PATTERN.test(body.identityId||""))return Response.json({error:"invalid_identity"},{status:400});const decision=recordSkip(service.skipHistory[body.identityId],Date.now(),SESSION_DEFAULTS);service.skipHistory[body.identityId]=decision.history;await this.state.storage.put(STATE_KEY,service.snapshot());return Response.json(decision,{status:decision.allowed?200:429});
    }
    if(request.method==="POST"&&url.pathname==="/avoid"){
      const body=await request.json();if(!ID_PATTERN.test(body.identityId||"")||!ID_PATTERN.test(body.peerId||""))return Response.json({error:"invalid_identity"},{status:400});const result=service.avoid(body.identityId,body.peerId);await this.state.storage.put(STATE_KEY,service.snapshot());return Response.json(result);
    }
    if(request.method==="POST"&&url.pathname==="/admin/restrict"){const body=await request.json();if(typeof body.targetRef!=="string")return Response.json({error:"invalid_target"},{status:400});const result=service.restrict(body.targetRef);await this.state.storage.put(STATE_KEY,service.snapshot());return Response.json(result);}
    if(request.method==="GET"&&url.pathname==="/admin/stats"){const sessions=new Map();for(const claim of Object.values(service.active))sessions.set(claim.sessionId,Boolean(claim.virtualPeer)||(sessions.get(claim.sessionId)||false));return Response.json({waiting:service.queue.length,humanChats:[...sessions.values()].filter(value=>!value).length,virtualChats:[...sessions.values()].filter(Boolean).length,activeSessions:sessions.size});}
    if(request.method==="POST"&&url.pathname==="/reconnect/request"){
      const body=await request.json();if(!ID_PATTERN.test(body.initiatorId||"")||!ID_PATTERN.test(body.targetId||"")||!body.initiatorUserId)return Response.json({error:"invalid_reconnect_request"},{status:400});const target=await this.getPresence(body.targetId);if(!target.online)return Response.json({status:"offline"});const result=service.requestReconnect({requestId:crypto.randomUUID(),initiatorId:body.initiatorId,initiatorUserId:body.initiatorUserId,targetId:body.targetId});await this.state.storage.put(STATE_KEY,service.snapshot());return Response.json(result);
    }
    const reconnectPoll=url.pathname.match(/^\/reconnect\/poll\/([a-zA-Z0-9_-]{8,100})$/);if(request.method==="GET"&&reconnectPoll){const pending=service.pendingReconnect(reconnectPoll[1]);await this.state.storage.put(STATE_KEY,service.snapshot());return Response.json({request:pending?{requestId:pending.requestId,initiatorId:pending.initiatorId,expiresAt:pending.expiresAt}:null});}
    if(request.method==="POST"&&url.pathname==="/reconnect/respond"){
      const body=await request.json(),pending=service.reconnectRequests[body.requestId];if(!pending||pending.targetId!==body.targetId)return Response.json({error:"reconnect_request_not_found"},{status:404});if(body.accepted!==true){delete service.reconnectRequests[body.requestId];await this.state.storage.put(STATE_KEY,service.snapshot());return Response.json({status:"declined"});}const [initiatorPresence,targetPresence]=await Promise.all([this.getPresence(pending.initiatorId),this.getPresence(pending.targetId)]);if(!initiatorPresence.online||!targetPresence.online){delete service.reconnectRequests[body.requestId];await this.state.storage.put(STATE_KEY,service.snapshot());return Response.json({status:"offline"});}const result=service.activateReconnect(body.requestId,body.targetId);if(result.status!=="accepted")return Response.json(result,{status:409});try{await new WalletService({url:this.env.SUPABASE_URL,serviceKey:this.env.SUPABASE_SERVICE_ROLE_KEY,fetcher:this.env.FETCHER||fetch}).apply({userId:result.request.initiatorUserId,delta:-50,type:"favourite_reconnect",reason:"Accepted favourite reconnect",idempotencyKey:`reconnect:${body.requestId}:${result.request.initiatorUserId}`,metadata:{sessionId:result.sessionId}});}catch(error){service.end(result.request.initiatorId,result.sessionId);await this.state.storage.put(STATE_KEY,service.snapshot());return Response.json({error:error.message},{status:error.message.includes("insufficient")?402:502});}await this.state.storage.put(STATE_KEY,service.snapshot());await Promise.all([this.setPresence(result.request.initiatorId,"chatting"),this.setPresence(result.request.targetId,"chatting")]);return Response.json({status:"accepted",sessionId:result.sessionId});
    }
    if(request.method==="POST"&&url.pathname==="/authorize-session"){
      const body=await request.json(),claim=service.active[body.identityId],allowed=Boolean(claim&&claim.sessionId===body.sessionId);return Response.json({allowed,...(allowed?{accountUserId:claim.accountUserId||null,virtual:Boolean(claim.virtual),virtualPeer:claim.virtualPeer||null}:{})},{status:allowed?200:403});
    }
    return Response.json({error:"not_found"},{status:404});
  }
  async getPresence(identityId){const id=this.env.PRESENCE.idFromName("global"),response=await this.env.PRESENCE.get(id).fetch(`https://presence.internal/identity/${encodeURIComponent(identityId)}`);return response.json();}
  async setPresence(identityId,status){if(!this.env?.PRESENCE)return;const id=this.env.PRESENCE.idFromName("global");await this.env.PRESENCE.get(id).fetch("https://presence.internal/status",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identityId,status,anonymous:true})});}
}
