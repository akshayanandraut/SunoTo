export class PresenceShard{
  constructor(){this.presence=new Map()}
  async fetch(request){
    const url=new URL(request.url);
    if(request.method==="POST"&&url.pathname==="/status"){
      const body=await request.json();
      if(typeof body.identityId!=="string")return Response.json({error:"invalid_identity"},{status:400});
      this.presence.set(body.identityId,{status:body.status||"online",anonymous:body.anonymous!==false,lastSeen:Date.now()});
      return Response.json({ok:true});
    }
    if(request.method==="DELETE"&&url.pathname.startsWith("/identity/")){this.presence.delete(decodeURIComponent(url.pathname.slice(10)));return Response.json({ok:true});}
    if(request.method==="GET"&&url.pathname.startsWith("/identity/")){const value=this.presence.get(decodeURIComponent(url.pathname.slice(10))),online=Boolean(value&&Date.now()-value.lastSeen<90000&&value.status!=="offline");return Response.json({online,status:online?value.status:"offline"});}
    if(request.method==="GET"&&url.pathname==="/stats"){
      const now=Date.now(),values=[...this.presence.values()].filter(value=>now-value.lastSeen<90000&&value.status!=="offline");const count=status=>values.filter(value=>value.status===status).length;
      return Response.json({exact:true,anonymousOnline:values.filter(value=>value.anonymous).length,registeredOnline:values.filter(value=>!value.anonymous).length,waiting:count("waiting"),chatting:count("chatting")});
    }
    return Response.json({error:"not_found"},{status:404});
  }
}
