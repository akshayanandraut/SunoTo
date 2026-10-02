import { webcrypto } from "node:crypto";

const ISSUER="https://grtjbgksspckvtrvwwbm.supabase.co/auth/v1";
const CLIENT_ID="sunoto-local-test-client";
const encode=value=>Buffer.from(typeof value==="string"?value:JSON.stringify(value)).toString("base64url");

// Test-only provider. This module is never imported by Worker production code.
export async function createDeterministicGrasanyProvider({subject="local-test-subject-1",email="local-test@example.invalid",nowSeconds=Math.floor(Date.now()/1000)}={}){
  const pair=await webcrypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
  const publicJwk=await webcrypto.subtle.exportKey("jwk",pair.publicKey);publicJwk.kid="local-test-key-1";publicJwk.alg="RS256";publicJwk.use="sig";
  const discovery={issuer:ISSUER,authorization_endpoint:`${ISSUER}/oauth/authorize`,token_endpoint:`${ISSUER}/oauth/token`,jwks_uri:`${ISSUER}/.well-known/jwks.json`,response_types_supported:["code"],code_challenge_methods_supported:["S256"],scopes_supported:["openid","email","profile"],id_token_signing_alg_values_supported:["RS256"]};
  async function signIdToken({nonce,audience=CLIENT_ID,issuer=ISSUER,sub=subject,iat=nowSeconds,exp=nowSeconds+300,extraClaims={}}={}){
    const header=encode({alg:"RS256",kid:publicJwk.kid,typ:"JWT"}),claims=encode({iss:issuer,aud:audience,sub,nonce,iat,exp,email,email_verified:true,...extraClaims}),input=`${header}.${claims}`;
    const signature=await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(input));
    return`${input}.${Buffer.from(signature).toString("base64url")}`;
  }
  const fetcher=async(input,init={})=>{
    const url=new URL(String(input));
    if(url.href===`${ISSUER}/.well-known/openid-configuration`)return Response.json(discovery);
    if(url.href===discovery.jwks_uri)return Response.json({keys:[publicJwk]});
    if(url.href===discovery.token_endpoint&&init.method==="POST")return Response.json({error:"test_code_exchange_not_configured"},{status:400});
    return Response.json({error:"test_provider_not_found"},{status:404});
  };
  return{issuer:ISSUER,clientId:CLIENT_ID,discovery,jwks:{keys:[publicJwk]},fetcher,signIdToken};
}
