const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const response=(body,status=200)=>Response.json(body,{status,headers:JSON_HEADERS});

// One instance per hashed login transaction or opaque session cookie. Tokens
// arrive only as AES-GCM envelopes from the Worker; this object never receives
// or stores plaintext OAuth credentials.
export class IdentitySessionShard{
  constructor(state){
    this.state=state;
    state.blockConcurrencyWhile(async()=>{
      state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS identity_record (
        record_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        refresh_id TEXT,
        refresh_started_at INTEGER
      )`);
    });
  }

  async fetch(request){
    const url=new URL(request.url);
    if(request.method==="POST"&&url.pathname==="/record"){
      const body=await request.json().catch(()=>null);
      if(!body||!['pending','session'].includes(body.key)||typeof body.payload!=="string"||body.payload.length>65536||!Number.isSafeInteger(body.expiresAt)||body.expiresAt<=Date.now())return response({error:"invalid_identity_record"},400);
      this.state.storage.sql.exec("INSERT OR REPLACE INTO identity_record (record_key,payload,expires_at,status,refresh_id,refresh_started_at) VALUES (?,?,?,'active',NULL,NULL)",body.key,body.payload,body.expiresAt);
      await this.state.storage.setAlarm(body.expiresAt);
      return response({stored:true},201);
    }
    if(request.method==="GET"&&url.pathname==="/record"){
      const key=url.searchParams.get("key");if(!["pending","session"].includes(key))return response({error:"invalid_identity_record_key"},400);
      const row=this.state.storage.sql.exec("SELECT payload,expires_at,status,refresh_id,refresh_started_at FROM identity_record WHERE record_key=?",key).toArray()[0];
      if(!row)return response({error:"identity_record_not_found"},404);
      if(row.expires_at<=Date.now()){this.state.storage.sql.exec("DELETE FROM identity_record WHERE record_key=?",key);return response({error:"identity_record_expired"},404);}
      return response({payload:row.payload,expiresAt:row.expires_at,status:row.status,refreshId:row.refresh_id,refreshStartedAt:row.refresh_started_at});
    }
    if(request.method==="POST"&&url.pathname==="/consume"){
      const body=await request.json().catch(()=>null);if(body?.key!=="pending")return response({error:"invalid_identity_record_key"},400);
      const row=this.state.storage.sql.exec("DELETE FROM identity_record WHERE record_key='pending' AND expires_at>? RETURNING payload,expires_at",Date.now()).toArray()[0];
      if(row)await this.state.storage.deleteAlarm();
      return row?response({payload:row.payload,expiresAt:row.expires_at}):response({error:"identity_transaction_not_found"},404);
    }
    if(request.method==="POST"&&url.pathname==="/refresh/claim"){
      const body=await request.json().catch(()=>null);if(body?.key!=="session"||typeof body.refreshId!=="string"||!Number.isSafeInteger(body.now))return response({error:"invalid_refresh_claim"},400);
      const changed=this.state.storage.sql.exec("UPDATE identity_record SET status='refreshing',refresh_id=?,refresh_started_at=? WHERE record_key='session' AND status='active' AND expires_at>? RETURNING payload,expires_at",body.refreshId,body.now,body.now).toArray()[0];
      if(changed)return response({claimed:true,payload:changed.payload,expiresAt:changed.expires_at});
      const current=this.state.storage.sql.exec("SELECT status,refresh_started_at FROM identity_record WHERE record_key='session' AND expires_at>?",body.now).toArray()[0];
      if(current?.status==="refreshing"){
        if(current.refresh_started_at+120_000>body.now)return response({claimed:false,inProgress:true},409);
        this.state.storage.sql.exec("DELETE FROM identity_record WHERE record_key='session'");
        return response({claimed:false,stale:true},410);
      }
      return response({claimed:false},404);
    }
    if(request.method==="POST"&&url.pathname==="/refresh/complete"){
      const body=await request.json().catch(()=>null);
      if(body?.key!=="session"||typeof body.refreshId!=="string"||typeof body.payload!=="string"||body.payload.length>65536||!Number.isSafeInteger(body.expiresAt)||body.expiresAt<=Date.now())return response({error:"invalid_refresh_result"},400);
      const result=this.state.storage.sql.exec("UPDATE identity_record SET payload=?,expires_at=?,status='active',refresh_id=NULL,refresh_started_at=NULL WHERE record_key='session' AND status='refreshing' AND refresh_id=? RETURNING record_key",body.payload,body.expiresAt,body.refreshId).toArray()[0];
      return result?response({stored:true}):response({error:"identity_refresh_state_conflict"},409);
    }
    if(request.method==="DELETE"&&url.pathname==="/record"){
      const key=url.searchParams.get("key");if(!["pending","session"].includes(key))return response({error:"invalid_identity_record_key"},400);
      this.state.storage.sql.exec("DELETE FROM identity_record WHERE record_key=?",key);await this.state.storage.deleteAlarm();return response({deleted:true});
    }
    return response({error:"not_found"},404);
  }

  async alarm(){
    const now=Date.now();
    this.state.storage.sql.exec("DELETE FROM identity_record WHERE expires_at<=?",now);
    const row=this.state.storage.sql.exec("SELECT expires_at FROM identity_record LIMIT 1").toArray()[0];
    if(row)await this.state.storage.setAlarm(row.expires_at);
  }
}
