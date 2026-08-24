export class PresenceShard{
  constructor(){this.presence=new Map()}
  async fetch(request){
    const url=new URL(request.url);
    if(request.method==="POST"&&url.pathname==="/status"){
      const body=await request.json();
      if(typeof body.identityId!=="string")return Response.json({error:"invalid_identity"},{status:400});
      const previous=this.presence.get(body.identityId)||{};
      this.presence.set(body.identityId,{...previous,status:body.status||"online",anonymous:body.anonymous!==false,publicRef:body.publicRef||previous.publicRef||null,accountUserId:body.accountUserId||previous.accountUserId||null,lastSeen:Date.now()});
      return Response.json({ok:true});
    }
    if(request.method==="DELETE"&&url.pathname.startsWith("/identity/")){this.presence.delete(decodeURIComponent(url.pathname.slice(10)));return Response.json({ok:true});}
    if(request.method==="GET"&&url.pathname.startsWith("/identity/")){const ref=decodeURIComponent(url.pathname.slice(10)),direct=this.presence.get(ref),entry=direct?[ref,direct]:[...this.presence].find(([,value])=>value.publicRef===ref),identityId=entry?.[0],value=entry?.[1],online=Boolean(value&&Date.now()-value.lastSeen<90000&&value.status!=="offline");return Response.json({online,status:online?value.status:"offline",...(online?{identityId,publicRef:value.publicRef,accountUserId:value.accountUserId}:{})});}
    if(request.method==="GET"&&url.pathname==="/stats"){
      const now=Date.now(),values=[...this.presence.values()].filter(value=>now-value.lastSeen<90000&&value.status!=="offline");const count=status=>values.filter(value=>value.status===status).length;
      return Response.json({exact:true,anonymousOnline:values.filter(value=>value.anonymous).length,registeredOnline:values.filter(value=>!value.anonymous).length,waiting:count("waiting"),chatting:count("chatting")});
    }
    return Response.json({error:"not_found"},{status:404});
  }
}
