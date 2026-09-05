const ONLINE_WINDOW_MS = 90000;
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;

export class PresenceShard{
  constructor(state,env){
    this.state=state;this.env=env;
    this.presence=new Map();
    this.adCounts=new Map();
    this.state.blockConcurrencyWhile(async()=>{
      const alarm=await this.state.storage.getAlarm();
      if(!alarm)await this.state.storage.setAlarm(Date.now()+SNAPSHOT_INTERVAL_MS);
    });
  }
  async fetch(request){
    const url=new URL(request.url);
    if(request.method==="POST"&&url.pathname==="/status"){
      const body=await request.json();
      if(typeof body.identityId!=="string")return Response.json({error:"invalid_identity"},{status:400});
      const previous=this.presence.get(body.identityId)||{};
      this.presence.set(body.identityId,{...previous,status:body.status||"online",section:typeof body.section==="string"?body.section.slice(0,64):(previous.section||"other"),anonymous:body.anonymous!==false,publicRef:body.publicRef||previous.publicRef||null,accountUserId:body.accountUserId||previous.accountUserId||null,lastSeen:Date.now()});
      return Response.json({ok:true});
    }
    if(request.method==="DELETE"&&url.pathname.startsWith("/identity/")){this.presence.delete(decodeURIComponent(url.pathname.slice(10)));return Response.json({ok:true});}
    if(request.method==="GET"&&url.pathname.startsWith("/identity/")){const ref=decodeURIComponent(url.pathname.slice(10)),direct=this.presence.get(ref),aliases=[...this.presence].filter(([,value])=>value.publicRef===ref).sort((left,right)=>right[1].lastSeen-left[1].lastSeen),entry=direct?[ref,direct]:aliases[0],identityId=entry?.[0],value=entry?.[1],online=Boolean(value&&Date.now()-value.lastSeen<ONLINE_WINDOW_MS&&value.status!=="offline");return Response.json({online,status:online?value.status:"offline",...(online?{identityId,publicRef:value.publicRef,accountUserId:value.accountUserId}:{})});}
    if(request.method==="GET"&&url.pathname==="/stats"){
      const now=Date.now(),values=[...this.presence.values()].filter(value=>now-value.lastSeen<ONLINE_WINDOW_MS&&value.status!=="offline");const count=status=>values.filter(value=>value.status===status).length;
      const sections={};for(const value of values)sections[value.section||"other"]=(sections[value.section||"other"]||0)+1;
      return Response.json({exact:true,anonymousOnline:values.filter(value=>value.anonymous).length,registeredOnline:values.filter(value=>!value.anonymous).length,waiting:count("waiting"),chatting:count("chatting"),sections,totalOnline:values.length});
    }
    if(request.method==="POST"&&url.pathname==="/ad-event"){
      const body=await request.json();
      if(typeof body.adId!=="string"||!["load","click"].includes(body.type))return Response.json({error:"invalid_ad_event"},{status:400});
      const previous=this.adCounts.get(body.adId)||{loads:0,clicks:0};
      previous[body.type==="load"?"loads":"clicks"]+=1;
      this.adCounts.set(body.adId,previous);
      return Response.json({ok:true});
    }
    return Response.json({error:"not_found"},{status:404});
  }
  async alarm(){
    await this.state.storage.setAlarm(Date.now()+SNAPSHOT_INTERVAL_MS);
    const now=Date.now(),values=[...this.presence.values()].filter(value=>now-value.lastSeen<ONLINE_WINDOW_MS&&value.status!=="offline");
    const sections={};for(const value of values)sections[value.section||"other"]=(sections[value.section||"other"]||0)+1;
    sections._totalOnline=values.length;
    const adStats=Object.fromEntries(this.adCounts);
    if(!this.env?.SUPABASE_URL||!this.env?.SUPABASE_SERVICE_ROLE_KEY)return;
    try{
      await (this.env.FETCHER||fetch)(`${this.env.SUPABASE_URL}/rest/v1/rpc/record_realtime_stats_snapshot`,{
        method:"POST",
        headers:{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"},
        body:JSON.stringify({target_sections:sections,target_ad_stats:adStats}),
      });
      this.adCounts.clear();
    }catch{}
  }
}
