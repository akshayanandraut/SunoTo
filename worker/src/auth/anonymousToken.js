const encoder=new TextEncoder(),decoder=new TextDecoder();
function encode(bytes){let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function decode(value){const base64=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");return Uint8Array.from(atob(base64),character=>character.charCodeAt(0))}
async function key(secret){return crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"])}
export async function signAnonymousToken(claims,secret){const payload=encode(encoder.encode(JSON.stringify(claims))),signature=await crypto.subtle.sign("HMAC",await key(secret),encoder.encode(payload));return `${payload}.${encode(new Uint8Array(signature))}`}
export async function verifyAnonymousToken(token,secret,nowSeconds=Math.floor(Date.now()/1000)){
  if(typeof token!=="string")return null;const [payload,signature,...extra]=token.split(".");if(!payload||!signature||extra.length)return null;
  try{const valid=await crypto.subtle.verify("HMAC",await key(secret),decode(signature),encoder.encode(payload));if(!valid)return null;const claims=JSON.parse(decoder.decode(decode(payload)));if(claims.v!==1||typeof claims.sub!=="string"||claims.exp<=nowSeconds)return null;return claims;}catch{return null}
}
export async function keyedFingerprint(value,secret){const signature=await crypto.subtle.sign("HMAC",await key(secret),encoder.encode(value));return encode(new Uint8Array(signature));}
export function ipPrefix(ip){if(typeof ip!=="string"||!ip)return"unknown";if(ip.includes(".")){const parts=ip.split(".");return parts.length===4?`${parts[0]}.${parts[1]}.${parts[2]}.0/24`:"unknown";}const parts=ip.split(":");return `${parts.slice(0,3).join(":")}::/48`;}
