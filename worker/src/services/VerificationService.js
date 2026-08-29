export class VerificationService{
  constructor(env,fetcher=fetch){this.env=env;this.fetcher=(...args)=>fetcher(...args)}
  serviceHeaders(){return{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"}}
  async request(userId){
    const response=await this.fetcher(`${this.env.SUPABASE_URL}/rest/v1/rpc/request_verification`,{method:"POST",headers:this.serviceHeaders(),body:JSON.stringify({target_user_id:userId})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||"verification_failed");
    return data[0];
  }
}
