const base=import.meta.env.VITE_API_BASE_URL||"/api/v1";

// SunoTo never owns credentials or receives central access tokens in browser
// JavaScript. The Worker owns the OIDC exchange and a secure session cookie.
export const authConfigured=false;

export async function identityStatus(){
  const response=await fetch(`${base}/identity/status`,{credentials:"same-origin"});
  if(!response.ok)throw new Error("identity_status_unavailable");
  return response.json();
}

export async function currentSession(){
  const response=await fetch(`${base}/auth/session`,{credentials:"same-origin"});
  if(response.status===401||response.status===503)return null;
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(payload?.error||"identity_session_unavailable");
  if(!payload?.authenticated||!payload.user?.id)return null;
  return {provider:"grasany_id",csrfToken:payload.csrfToken,user:{id:payload.user.id,email:payload.user.email,email_confirmed_at:payload.user.emailVerified?"central-verified":null}};
}

export async function signInWithGrasany(){location.assign(`${base}/auth/grasany/start?return_to=%2Faccount`);}
export async function completeGrasanyCallback(){return null;}

export async function signOut(session){
  const response=await fetch(`${base}/auth/logout`,{method:"POST",credentials:"same-origin",headers:{"x-csrf-token":session?.csrfToken||""}});
  if(!response.ok&&response.status!==204){const payload=await response.json().catch(()=>null);throw new Error(payload?.error||"identity_logout_failed");}
}

export function onAuthChange(){return()=>{};}
