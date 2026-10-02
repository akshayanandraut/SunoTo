const APP_ID="sunoto";
const REQUEST_PATH="/api/notifications/v1/requests";
const STATUS_PATH="/api/notifications/v1/status";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createCentralNotificationHeaders({method="POST",path=REQUEST_PATH,rawBody,secret,timestampMs=Date.now(),nowMs=Date.now(),cryptoApi=globalThis.crypto}={}){
  const verb=String(method).toUpperCase();
  if(typeof path!=="string"||!path.startsWith("/")||path.startsWith("//")||path.includes("\\"))throw new Error("notification_request_path_not_supported");
  let parsedPath;
  try{parsedPath=new URL(path,"https://notifications.invalid");}catch{throw new Error("notification_request_path_not_supported");}
  if(parsedPath.origin!=="https://notifications.invalid"||parsedPath.username||parsedPath.password)throw new Error("notification_request_path_not_supported");
  const canonicalPath=parsedPath.pathname;
  if(parsedPath.hash)throw new Error("notification_request_path_not_supported");
  if(verb==="POST"){
    if(canonicalPath!==REQUEST_PATH||parsedPath.search)throw new Error("notification_request_path_not_supported");
    if(typeof rawBody!=="string")throw new Error("notification_raw_body_required");
  }else if(verb==="GET"){
    const ids=parsedPath.searchParams.getAll("notification_id");
    if(canonicalPath!==STATUS_PATH||ids.length!==1||[...parsedPath.searchParams.keys()].length!==1||!UUID.test(ids[0]))throw new Error("notification_request_path_not_supported");
    if(rawBody!=="")throw new Error("notification_status_body_must_be_empty");
  }else throw new Error("notification_request_method_not_supported");
  if(typeof secret!=="string"||!secret.trim())throw new Error("notification_service_credential_unavailable");
  if(!Number.isSafeInteger(timestampMs)||timestampMs<0||!Number.isSafeInteger(nowMs)||Math.abs(nowMs-timestampMs)>300_000)throw new Error("notification_timestamp_out_of_window");
  if(!cryptoApi?.subtle)throw new Error("webcrypto_unavailable");
  const timestamp=String(timestampMs);
  const signingInput=`${timestamp}\n${verb}\n${canonicalPath}\n${rawBody}`;
  const key=await cryptoApi.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=new Uint8Array(await cryptoApi.subtle.sign("HMAC",key,new TextEncoder().encode(signingInput)));
  const signature=[...digest].map(byte=>byte.toString(16).padStart(2,"0")).join("");
  return{"x-grasany-app-id":APP_ID,"x-grasany-timestamp":timestamp,"x-grasany-signature":signature};
}
