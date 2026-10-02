import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handleHeartbeatProbe,verifyHeartbeatRequest } from "../worker/src/services/heartbeatProbe.js";

const secret="s".repeat(48);
const probeId="b2d6ba2c-63a8-487b-999b-992903883901";
const nonce="43050c61-4304-4f2d-9dfd-df797809f202";
const timestamp=1_800_000_000_000;
const hex=bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");

async function signedRequest({body=JSON.stringify({probeId}),time=timestamp,path="/api/internal/heartbeat",nonceValue=nonce,product="sunoto"}={}){
  const bytes=new TextEncoder().encode(body);
  const digest=hex(new Uint8Array(await webcrypto.subtle.digest("SHA-256",bytes)));
  const canonical=`v1\n${product}\nPOST\n/api/internal/heartbeat\n${time}\n${nonceValue}\n${digest}`;
  const key=await webcrypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=hex(new Uint8Array(await webcrypto.subtle.sign("HMAC",key,new TextEncoder().encode(canonical))));
  return new Request(`https://sunoto.example${path}`,{method:"POST",headers:{"content-type":"application/json","x-grasany-product":product,"x-grasany-timestamp":String(time),"x-grasany-nonce":nonceValue,"x-grasany-signature":signature},body});
}

function fixture({guardStatus=204,dbResult=[{status:"ok",read_before:"ok",write:"ok",read_after:"ok",counter:1,last_probe_id:probeId}],dbStatus=200}={}){
  const calls={guard:0,db:0};
  const env={STATUSNERVE_HEARTBEAT_KEY:secret,SUPABASE_URL:"https://sunoto-db.example",SUPABASE_SERVICE_ROLE_KEY:"server-only",HEARTBEAT_DB_ENABLED:"1",HEARTBEAT_GUARD:{idFromName:name=>name,get:()=>({fetch:async()=>{calls.guard++;return new Response(null,{status:guardStatus});}})}};
  const fetcher=async()=>{calls.db++;return Response.json(dbResult,{status:dbStatus});};
  return{env,calls,fetcher};
}

test("unsigned or altered heartbeat never reaches replay storage or database",async()=>{
  const {env,calls,fetcher}=fixture();
  const unsigned=new Request("https://sunoto.example/api/internal/heartbeat",{method:"POST",body:JSON.stringify({probeId})});
  const denial=await handleHeartbeatProbe(unsigned,env,{fetcher,now:()=>timestamp});
  assert.equal(denial.status,401);
  assert.deepEqual(calls,{guard:0,db:0});
  const request=await signedRequest({body:JSON.stringify({probeId,unexpected:true})});
  assert.equal(await verifyHeartbeatRequest(request,secret,{now:timestamp,cryptoApi:webcrypto}),null);
  assert.deepEqual(calls,{guard:0,db:0});
});

test("valid exact v1 signature produces only verified stage status",async()=>{
  const {env,calls,fetcher}=fixture();
  const response=await handleHeartbeatProbe(await signedRequest(),env,{fetcher,now:()=>timestamp});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.status,"ok");
  assert.deepEqual(body.stages,{readBefore:"ok",write:"ok",readAfter:"ok"});
  assert.deepEqual(calls,{guard:1,db:1});
  assert.equal(JSON.stringify(body).includes("server-only"),false);
});

test("database failure and write failure never report a successful probe",async()=>{
  const unavailable=fixture({dbStatus:503});
  const first=await handleHeartbeatProbe(await signedRequest(),unavailable.env,{fetcher:unavailable.fetcher,now:()=>timestamp});
  assert.equal(first.status,503);
  assert.deepEqual((await first.json()).stages,{readBefore:"failed",write:"skipped",readAfter:"skipped"});
  const failedWrite=fixture({dbResult:[{status:"error",read_before:"ok",write:"failed",read_after:"skipped",counter:null,last_probe_id:null}]});
  const second=await handleHeartbeatProbe(await signedRequest(),failedWrite.env,{fetcher:failedWrite.fetcher,now:()=>timestamp});
  assert.equal(second.status,503);
  assert.equal((await second.json()).stages.write,"failed");
});

test("mismatched readback and guarded race cannot claim health",async()=>{
  const mismatch=fixture({dbResult:[{status:"ok",read_before:"ok",write:"ok",read_after:"ok",counter:1,last_probe_id:"0ee7fe4b-7d53-4a11-b7e1-31f2e1a2a781"}]});
  const first=await handleHeartbeatProbe(await signedRequest(),mismatch.env,{fetcher:mismatch.fetcher,now:()=>timestamp});
  assert.equal(first.status,503);
  assert.equal((await first.json()).stages.readAfter,"failed");
  const raced=fixture({guardStatus:429});
  const second=await handleHeartbeatProbe(await signedRequest(),raced.env,{fetcher:raced.fetcher,now:()=>timestamp});
  assert.equal(second.status,429);
  assert.equal((await second.json()).status,"rate_limited");
  assert.deepEqual(raced.calls,{guard:1,db:0});
});

test("migration keeps one private row and server-only transactional RPC",async()=>{
  const sql=await readFile(new URL("../supabase/migrations/20261002171218_sunoto_heartbeat_probe.sql",import.meta.url),"utf8");
  for(const marker of ["create schema if not exists grasany_ops","check (product_id = 'sunoto')","enable row level security","security invoker","pg_try_advisory_xact_lock","on conflict (product_id)","grant execute on function public.sunoto_heartbeat_probe(uuid) to service_role"])assert.ok(sql.toLowerCase().includes(marker));
  assert.doesNotMatch(sql,/grant execute on function public\.sunoto_heartbeat_probe\(uuid\) to (anon|authenticated)/i);
});
