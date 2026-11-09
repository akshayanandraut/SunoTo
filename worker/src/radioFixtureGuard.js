// Separate temporary entrypoint. Never import it from the production Worker.
import { verifyAnonymousToken } from "./auth/anonymousToken.js";
import { serveStoredMedia } from "./services/mediaDelivery.js";

const hex32 = /^[0-9a-f]{64}$/;
const idPattern = /^[0-9a-f]{32}$/;
const enc = new TextEncoder();
const headers = {"cache-control":"no-store","x-robots-tag":"noindex, nofollow","x-content-type-options":"nosniff"};
const empty = status => new Response(null,{status,headers});
async function authorized(request,secret){
  const supplied=request.headers.get("authorization")?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  if(!supplied||!hex32.test(secret??""))return false;
  const hmac=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
  const sig=await crypto.subtle.sign("HMAC",hmac,enc.encode(supplied));
  return crypto.subtle.verify("HMAC",hmac,sig,enc.encode(secret));
}
function syntheticWav(){
  const b=new Uint8Array(8044),v=new DataView(b.buffer);
  b.set(enc.encode("RIFF")); v.setUint32(4,8036,true);
  b.set(enc.encode("WAVEfmt "),8); v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,8000,true);v.setUint32(28,8000,true);
  v.setUint16(32,1,true);v.setUint16(34,8,true);
  b.set(enc.encode("data"),36);v.setUint32(40,8000,true);
  b.fill(128,44);return b;
}
export default {
  async fetch(request,env){
    const url=new URL(request.url),id=env.RADIO_FIXTURE_ID,secret=env.RADIO_FIXTURE_SECRET;
    if(!idPattern.test(id??"")||url.pathname!=="/__radio-fixture/"+id||
       !["PUT","DELETE","GET","HEAD"].includes(request.method)||!env.FIXTURE_BUCKET)return empty(404);
    try{
      if(!await authorized(request,secret))return empty(404);
      const key="__sunoto_synthetic/"+id+"/silence.wav",bucket=env.FIXTURE_BUCKET;
      if(request.method==="PUT"){
        const created=await bucket.put(key,syntheticWav(),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"audio/wav"},customMetadata:{sunotoFixture:id}});
        return empty(created?201:409);
      }
      if(request.method==="DELETE"){
        const object=await bucket.head(key);
        if(object?.customMetadata?.sunotoFixture!==id)return empty(404);
        await bucket.delete(key);
        return empty(204);
      }
      const claims=await verifyAnonymousToken(url.searchParams.get("t"),"sunoto-radio-fixture:"+secret);
      if(!claims||claims.kind!=="radio-media"||claims.sub!==key)return empty(403);
      const object=await bucket.head(key);
      if(object?.customMetadata?.sunotoFixture!==id)return empty(404);
      const response=await serveStoredMedia(request,bucket,key);
      const final=new Headers(response.headers);
      for(const [name,value] of Object.entries(headers))final.set(name,value);
      return new Response(response.body,{status:response.status,headers:final});
    }catch{return empty(503);}
  }
};
