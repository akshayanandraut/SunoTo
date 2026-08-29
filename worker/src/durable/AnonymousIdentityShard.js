import { keyedFingerprint,signAnonymousToken } from "../auth/anonymousToken.js";
import { evaluateIpRisk,TRIAL_DEFAULTS,trialEligibility } from "../policies/trialRiskPolicy.js";
const KEY="anonymous_state",ID=/^[a-zA-Z0-9_-]{8,100}$/;
export class AnonymousIdentityShard{
  constructor(state,env){this.state=state;this.env=env}
  async fetch(request){
    const url=new URL(request.url),data=(await this.state.storage.get(KEY))||{identities:{},ipSignals:{},consumptions:{},spamSignals:{},counters:{sessionsIssued:0,searchesStarted:0,connectionsStarted:0,successfulTrials:0}};data.spamSignals??={};
    if(request.method==="POST"&&url.pathname==="/issue"){
      const body=await request.json();if(!ID.test(body.anonymousId||"")||typeof body.localSecret!=="string"||body.localSecret.length<16)return Response.json({error:"invalid_anonymous_identity"},{status:400});
      const secretHash=await keyedFingerprint(body.localSecret,this.env.ANON_SESSION_SECRET),existing=data.identities[body.anonymousId];if(existing&&existing.secretHash!==secretHash)return Response.json({error:"identity_secret_mismatch"},{status:401});
      const now=Date.now(),ipHash=body.ipHash||"unknown",signal=data.ipSignals[ipHash]||{identities:{}};signal.identities[body.anonymousId]??=now;data.ipSignals[ipHash]=signal;const risk=evaluateIpRisk(signal.identities,now);
      if(!existing&&risk.accountRequired)return Response.json({error:"account_required",riskLevel:risk.riskLevel},{status:403});
      const identity=existing||{secretHash,successfulConnections:0,createdAt:now};identity.lastSeenAt=now;identity.lastIpHash=ipHash;data.identities[body.anonymousId]=identity;data.counters.sessionsIssued++;
      const nowSeconds=Math.floor(now/1000),token=await signAnonymousToken({v:1,sub:body.anonymousId,iat:nowSeconds,exp:nowSeconds+TRIAL_DEFAULTS.tokenLifetimeSeconds},this.env.ANON_SESSION_SECRET);await this.state.storage.put(KEY,data);
      return Response.json({token,identityId:body.anonymousId,trial:trialEligibility(identity.successfulConnections),riskLevel:risk.riskLevel});
    }
    if(request.method==="POST"&&url.pathname==="/authorize-search"){
      const body=await request.json(),identity=data.identities[body.identityId];if(!identity)return Response.json({error:"unknown_identity"},{status:401});const trial=trialEligibility(identity.successfulConnections),blocked=trial.accountRequired&&!body.registered;return Response.json(blocked?{...trial,error:"account_required"}:trial,{status:blocked?403:200});
    }
    if(request.method==="POST"&&url.pathname==="/consume"){
      const body=await request.json(),identity=data.identities[body.identityId],key=`${body.sessionId}:${body.identityId}`;if(!identity)return Response.json({error:"unknown_identity"},{status:404});if(data.consumptions[key])return Response.json({...trialEligibility(identity.successfulConnections),consumed:false,idempotent:true});
      if(identity.successfulConnections>=TRIAL_DEFAULTS.maxSuccessfulConnections)return Response.json({...trialEligibility(identity.successfulConnections),consumed:false},{status:409});data.consumptions[key]={at:Date.now(),reason:body.reason};identity.successfulConnections++;data.counters.successfulTrials++;await this.state.storage.put(KEY,data);return Response.json({...trialEligibility(identity.successfulConnections),consumed:true});
    }
    if(request.method==="POST"&&url.pathname==="/activity"){
      const body=await request.json(),allowed={search_started:"searchesStarted",connection_started:"connectionsStarted"},counter=allowed[body.type];if(!counter)return Response.json({error:"invalid_activity"},{status:400});data.counters[counter]++;await this.state.storage.put(KEY,data);return Response.json({ok:true});
    }
    if(request.method==="POST"&&url.pathname==="/spam-fingerprint"){
      const body=await request.json(),now=Date.now();if(!ID.test(body.identityId||"")||!ID.test(body.sessionId||"")||!String(body.fingerprint||"").match(/^[a-f0-9]{24}$/))return Response.json({error:"invalid_fingerprint"},{status:400});const identity=data.identities[body.identityId];if(!identity)return Response.json({error:"unknown_identity"},{status:404});for(const [key,value] of Object.entries(data.spamSignals))if(now-value.lastAt>600000)delete data.spamSignals[key];const key=`${body.identityId}:${body.fingerprint}`,signal=data.spamSignals[key]||{sessions:{},firstAt:now};signal.sessions[body.sessionId]=now;signal.lastAt=now;data.spamSignals[key]=signal;const count=Object.keys(signal.sessions).length,retrySeconds=count>=4?300:count>=3?120:0;await this.state.storage.put(KEY,data);return Response.json({allowed:retrySeconds===0,warning:count===2,retryAt:retrySeconds?now+retrySeconds*1000:null});
    }
    if(request.method==="GET"&&url.pathname==="/counters")return Response.json({exact:true,...data.counters});
    return Response.json({error:"not_found"},{status:404});
  }
}
