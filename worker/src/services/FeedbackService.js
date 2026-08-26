export class FeedbackService{
  constructor(env,fetcher=fetch){this.env=env;this.fetcher=fetcher}
  headers(){return{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"}}
  async request(path,options={}){const response=await this.fetcher(`${this.env.SUPABASE_URL}/rest/v1${path}`,{...options,headers:{...this.headers(),...options.headers}}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"feedback_request_failed");return data}
  async submit({accountUserId,message}){const rows=await this.request("/feedback",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({account_user_id:accountUserId||null,message})});return rows[0]}
}
