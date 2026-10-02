const PRODUCT_ID="sunoto";
const PATH="/api/internal/heartbeat";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64=/^[0-9a-f]{64}$/;
const encoder=new TextEncoder();
const emptyStages=()=>({readBefore:"skipped",write:"skipped",readAfter:"skipped"});
const hex=bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");

function probeResponse(status,probeId,stages,startedAt,httpStatus){
  return Response.json({version:1,productId:PRODUCT_ID,probeId,status,checkedAt:new Date().toISOString(),durationMs:Date.now()-startedAt,stages},{status:httpStatus,headers:{"cache-control":"no-store"}});
}

async function readBody(request){
  const declared=Number(request.headers.get("content-length"));
  if(Number.isFinite(declared)&&declared>1024)throw new Error("invalid_body");
  const reader=request.body?.getReader();
  if(!reader)return new Uint8Array(0);
  const chunks=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();throw new Error("invalid_body");}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

export async function verifyHeartbeatRequest(request,secret,{now=Date.now(),cryptoApi=globalThis.crypto}={}){
  const url=new URL(request.url);
  if(request.method!=="POST"||url.pathname!==PATH||url.search||url.hash||!(url.protocol==="https:"||url.hostname==="localhost"))return null;
  if(typeof secret!=="string"||secret.length<32)return null;
  const product=request.headers.get("x-grasany-product"),timestamp=request.headers.get("x-grasany-timestamp"),nonce=request.headers.get("x-grasany-nonce"),signature=request.headers.get("x-grasany-signature");
  if(product!==PRODUCT_ID||!/^\d{13}$/.test(timestamp||"")||!UUID.test(nonce||"")||!HEX64.test(signature||""))return null;
  const time=Number(timestamp);
  if(!Number.isSafeInteger(time)||Math.abs(now-time)>300_000)return null;
  let bytes;
  try{bytes=await readBody(request);}catch{return null;}
  const digest=hex(new Uint8Array(await cryptoApi.subtle.digest("SHA-256",bytes)));
  const signedBytes=encoder.encode(`v1\n${PRODUCT_ID}\nPOST\n${PATH}\n${timestamp}\n${nonce}\n${digest}`);
  const key=await cryptoApi.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const signatureBytes=Uint8Array.from(signature.match(/../g),pair=>parseInt(pair,16));
  if(!await cryptoApi.subtle.verify("HMAC",key,signatureBytes,signedBytes))return null;
  let body;
  try{body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{return null;}
  if(!body||Array.isArray(body)||Object.keys(body).length!==1||!UUID.test(body.probeId||""))return null;
  return{probeId:body.probeId,nonce};
}

export async function handleHeartbeatProbe(request,env,{fetcher=env.FETCHER||fetch,now=Date.now}={}){
  const startedAt=now();
  if(!env.STATUSNERVE_HEARTBEAT_KEY)return Response.json({error:"unauthorized"},{status:401,headers:{"cache-control":"no-store"}});
  const authenticated=await verifyHeartbeatRequest(request,env.STATUSNERVE_HEARTBEAT_KEY,{now:startedAt}).catch(()=>null);
  if(!authenticated)return Response.json({error:"unauthorized"},{status:401,headers:{"cache-control":"no-store"}});
  const {probeId,nonce}=authenticated;
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.HEARTBEAT_GUARD||env.HEARTBEAT_DB_ENABLED!=="1")return probeResponse("unconfigured",probeId,emptyStages(),startedAt,503);
  let claim;
  try{
    const namespace=env.HEARTBEAT_GUARD;
    claim=await namespace.get(namespace.idFromName("sunoto-heartbeat")).fetch("https://heartbeat.internal/claim",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({nonce})});
  }catch{return probeResponse("error",probeId,emptyStages(),startedAt,503);}
  if(claim.status===429||claim.status===409)return probeResponse("rate_limited",probeId,emptyStages(),startedAt,429);
  if(!claim.ok)return probeResponse("error",probeId,emptyStages(),startedAt,503);
  let result;
  try{
    const response=await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/sunoto_heartbeat_probe`,{
      method:"POST",signal:AbortSignal.timeout(5_000),
      headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"},
      body:JSON.stringify({probe_id:probeId})
    });
    if(!response.ok)return probeResponse("error",probeId,{readBefore:"failed",write:"skipped",readAfter:"skipped"},startedAt,503);
    const rows=await response.json();
    result=Array.isArray(rows)&&rows.length===1?rows[0]:null;
  }catch{return probeResponse("error",probeId,{readBefore:"failed",write:"skipped",readAfter:"skipped"},startedAt,503);}
  const allowedStage=value=>["ok","failed","skipped"].includes(value)?value:"failed";
  const stages={readBefore:allowedStage(result?.read_before),write:allowedStage(result?.write),readAfter:allowedStage(result?.read_after)};
  if(result?.status==="ok"&&stages.readAfter==="ok"&&(result.last_probe_id!==probeId||!Number.isSafeInteger(result.counter)||result.counter<=0))stages.readAfter="failed";
  const verified=result?.status==="ok"&&Object.values(stages).every(value=>value==="ok")&&result.last_probe_id===probeId&&Number.isSafeInteger(result.counter)&&result.counter>0;
  return probeResponse(verified?"ok":"error",probeId,stages,startedAt,verified?200:503);
}
