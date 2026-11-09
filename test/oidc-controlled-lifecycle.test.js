import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {beginGrasanyLogin,completeGrasanyCallback,readGrasanySession,logoutGrasanySession,getGrasanyPrincipal} from "../worker/src/auth/grasanyIdentityFlow.js";
import {GRASANY_OIDC_PACKET as packet,decryptIdentityTokens} from "../worker/src/auth/grasanyOidc.js";

test("controlled OIDC lifecycle keeps provider tokens and product authority isolated",async()=>{
  const guard="a".repeat(64),key=Buffer.alloc(32,7).toString("base64url");
  const rows=new Map(),providerCalls=[];
  const sessions={idFromName:id=>id,get:id=>({fetch:async(url,init)=>{
    const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;
    const row=rows.get(id);
    if(path==="/record"&&init.method==="POST"){rows.set(id,{payload:body.payload});return Response.json({stored:true});}
    if(!row)return Response.json({}, {status:404});
    if(path==="/consume"){rows.delete(id);return Response.json(row);}
    if(init.method==="DELETE"){rows.delete(id);return new Response(null,{status:204});}
    if(path==="/refresh/claim"){row.refreshId=body.refreshId;return Response.json({...row,claimed:true});}
    if(path==="/refresh/complete"){assert.equal(row.refreshId,body.refreshId);rows.set(id,{payload:body.payload});return Response.json({stored:true});}
    assert.equal(path,"/record");return Response.json(row);
  }})};
  const env={GRASANY_OIDC_ACCEPTANCE_MODE:"1",GRASANY_OIDC_ACCEPTANCE_SECRET:guard,
    IDENTITY_ACCEPTANCE_SESSIONS:sessions,IDENTITY_SESSIONS:{idFromName(){throw Error("production storage touched");}},
    GRASANY_OIDC_ISSUER:packet.issuer,GRASANY_OIDC_CLIENT_ID:packet.clientId,
    GRASANY_OIDC_REDIRECT_URI:packet.proposedCallback,GRASANY_OIDC_TOKEN_ENCRYPTION_KEY:key};
  const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
  const tokenEndpoint=packet.issuer+"/oauth/token",jwks=packet.issuer+"/.well-known/jwks.json";
  let authorization;
  const jwtPart=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
  const fetcher=async(url,init)=>{
    providerCalls.push(url);
    if(url===packet.discoveryUrl)return Response.json({issuer:packet.issuer,authorization_endpoint:packet.authorizationEndpoint,
      token_endpoint:tokenEndpoint,jwks_uri:jwks,response_types_supported:["code"],code_challenge_methods_supported:["S256"],
      scopes_supported:packet.scopes,id_token_signing_alg_values_supported:["RS256"]});
    if(url===jwks)return Response.json({keys:[{...publicKey.export({format:"jwk"}),kid:"fixture",alg:"RS256",use:"sig"}]});
    assert.equal(url,tokenEndpoint);
    assert.equal(init.headers.authorization,undefined);
    assert.equal(init.body.get("client_id"),packet.clientId);
    if(init.body.get("grant_type")==="refresh_token"){
      assert.equal(init.body.get("refresh_token"),"synthetic-refresh-1");
      return Response.json({access_token:"synthetic-access-2",refresh_token:"synthetic-refresh-2",token_type:"Bearer",expires_in:3600});
    }
    assert.equal(init.body.get("redirect_uri"),packet.proposedCallback);
    assert.equal(init.body.get("code"),"synthetic-code");
    assert.equal(createHash("sha256").update(init.body.get("code_verifier")).digest("base64url"),authorization.searchParams.get("code_challenge"));
    const iat=Math.floor(Date.now()/1000),nonce=authorization.searchParams.get("nonce");
    const payload=jwtPart({alg:"RS256",kid:"fixture"})+"."+jwtPart({iss:packet.issuer,aud:packet.clientId,sub:"synthetic-user",nonce,iat,exp:iat+300});
    return Response.json({access_token:"synthetic-access-1",refresh_token:"synthetic-refresh-1",id_token:payload+"."+sign("RSA-SHA256",Buffer.from(payload),privateKey).toString("base64url"),token_type:"Bearer",expires_in:3600,scope:packet.scopes.join(" ")});
  };
  const req=(path,opts={})=>new Request(packet.proposedOrigin+path,{...opts,headers:{"x-sunoto-identity-acceptance":guard,...opts.headers}});
  const start=await beginGrasanyLogin(req("/api/v1/auth/grasany/start?return_to=%2F%23party"),env,{fetcher});
  assert.equal(start.status,302);authorization=new URL(start.headers.get("location"));
  const cookie=start.headers.getSetCookie()[0].split(";")[0];
  assert.match(start.headers.getSetCookie()[0],/Secure; HttpOnly; SameSite=Lax/);
  const path="/auth/callback?code=synthetic-code&state="+authorization.searchParams.get("state");
  assert.equal((await completeGrasanyCallback(req(path),env,{fetcher})).status,400);
  assert.equal(rows.size,1);
  const callback=await completeGrasanyCallback(req(path,{headers:{cookie}}),env,{fetcher});
  assert.equal(callback.status,303);assert.equal(callback.headers.get("location"),packet.proposedOrigin+"/#party");
  const sessionCookie=callback.headers.getSetCookie()[0].split(";")[0];
  assert.equal((await completeGrasanyCallback(req(path,{headers:{cookie}}),env,{fetcher})).status,400);
  const session=req("/api/v1/auth/session",{headers:{cookie:sessionCookie}});
  const reloaded=await (await readGrasanySession(session,env,{fetcher})).json();
  assert.equal(reloaded.user.id,"synthetic-user");assert.deepEqual(reloaded.authorization,{roles:[],entitlements:[]});
  assert.equal(JSON.stringify(reloaded).includes("synthetic-refresh"),false);
  assert.equal((await getGrasanyPrincipal(session,env)).error,"identity_service_not_configured");
  const [stored]=rows.values();const row=JSON.parse(stored.payload);
  assert.equal(row.issuer,packet.issuer);assert.equal(row.subject,"synthetic-user");
  assert.equal(stored.payload.includes("synthetic-refresh-1"),false);
  assert.equal((await readGrasanySession(session,env,{fetcher,now:row.accessExpiresAt-1000})).status,200);
  assert.equal((await decryptIdentityTokens(JSON.parse([...rows.values()][0].payload).tokenEnvelope,key)).refreshToken,"synthetic-refresh-2");
  const beforeLogout=providerCalls.length;
  const logout=await logoutGrasanySession(req("/api/v1/auth/logout",{method:"POST",headers:{origin:packet.proposedOrigin,cookie:sessionCookie,"x-csrf-token":reloaded.csrfToken}}),env);
  assert.equal(logout.status,204);assert.equal(providerCalls.length,beforeLogout);
  assert.equal(rows.size,0);
  assert.equal((await readGrasanySession(session,env,{fetcher})).status,401);
});
