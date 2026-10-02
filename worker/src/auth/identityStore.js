const JSON_HEADERS={"content-type":"application/json","cache-control":"no-store"};
async function objectFor(env,reference){
  if(!env?.IDENTITY_SESSIONS)throw new Error("identity_session_store_unavailable");
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(reference)));
  const name=[...digest].map(byte=>byte.toString(16).padStart(2,"0")).join("");
  return env.IDENTITY_SESSIONS.get(env.IDENTITY_SESSIONS.idFromName(name));
}
async function call(env,reference,path,{method="GET",body}={}){
  const stub=await objectFor(env,reference),response=await stub.fetch(`https://identity-session.internal${path}`,{method,headers:body?JSON_HEADERS:undefined,body:body?JSON.stringify(body):undefined});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok&&response.status!==404&&response.status!==409&&response.status!==410)throw new Error(payload.error||"identity_session_store_failed");
  return{...payload,status:response.status};
}
export const identityStore={
  createPending:(env,state,record)=>call(env,`pending:${state}`,"/record",{method:"POST",body:{key:"pending",payload:JSON.stringify(record),expiresAt:record.expiresAt}}),
  consumePending:(env,state)=>call(env,`pending:${state}`,"/consume",{method:"POST",body:{key:"pending"}}),
  createSession:(env,sessionId,record)=>call(env,`session:${sessionId}`,"/record",{method:"POST",body:{key:"session",payload:JSON.stringify(record),expiresAt:record.expiresAt}}),
  getSession:(env,sessionId)=>call(env,`session:${sessionId}`,"/record?key=session"),
  deleteSession:(env,sessionId)=>call(env,`session:${sessionId}`,"/record?key=session",{method:"DELETE"}),
  claimRefresh:(env,sessionId,refreshId,now)=>call(env,`session:${sessionId}`,"/refresh/claim",{method:"POST",body:{key:"session",refreshId,now}}),
  completeRefresh:(env,sessionId,refreshId,record)=>call(env,`session:${sessionId}`,"/refresh/complete",{method:"POST",body:{key:"session",refreshId,payload:JSON.stringify(record),expiresAt:record.expiresAt}})
};
