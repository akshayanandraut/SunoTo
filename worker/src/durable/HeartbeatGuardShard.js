// One low-volume coordinator for SunoTo's internal database probe. SQLite
// uniqueness makes nonce replay rejection durable across Worker isolates.
export class HeartbeatGuardShard {
  constructor(state){
    this.state=state;
    state.storage.sql.exec("CREATE TABLE IF NOT EXISTS probe_guard (id INTEGER PRIMARY KEY CHECK (id = 1), last_claimed_at INTEGER NOT NULL)");
    state.storage.sql.exec("CREATE TABLE IF NOT EXISTS probe_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)");
    state.storage.sql.exec("INSERT OR IGNORE INTO probe_guard (id, last_claimed_at) VALUES (1, 0)");
  }

  async fetch(request){
    if(request.method!=="POST")return new Response(null,{status:405});
    if(new URL(request.url).pathname!=="/claim")return new Response(null,{status:404});
    const payload=await request.json().catch(()=>null);
    if(typeof payload?.nonce!=="string"||!/^[0-9a-f-]{36}$/i.test(payload.nonce))return new Response(null,{status:400});
    const now=Date.now(),sql=this.state.storage.sql;
    sql.exec("DELETE FROM probe_nonces WHERE expires_at <= ?",now);
    if(sql.exec("SELECT 1 FROM probe_nonces WHERE nonce = ?",payload.nonce).toArray().length)return new Response(null,{status:409});
    const guard=sql.exec("SELECT last_claimed_at FROM probe_guard WHERE id = 1").one();
    if(now-guard.last_claimed_at<60_000)return new Response(null,{status:429,headers:{"retry-after":String(Math.ceil((60_000-(now-guard.last_claimed_at))/1000))}});
    if(sql.exec("SELECT count(*) AS total FROM probe_nonces").one().total>=12)return new Response(null,{status:429,headers:{"retry-after":"60"}});
    // rowsWritten includes index maintenance; RETURNING counts logical inserts.
    const inserted=sql.exec("INSERT OR IGNORE INTO probe_nonces (nonce, expires_at) VALUES (?, ?) RETURNING nonce",payload.nonce,now+600_000).toArray();
    if(inserted.length!==1)return new Response(null,{status:409});
    sql.exec("UPDATE probe_guard SET last_claimed_at = ? WHERE id = 1",now);
    return new Response(null,{status:204});
  }
}
