export class AdminService{
  constructor(env,fetcher=fetch){this.env=env;this.fetcher=fetcher}
  headers(extra={}){return{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json",...extra}}
  async request(path,options={}){const response=await this.fetcher(`${this.env.SUPABASE_URL}/rest/v1${path}`,{...options,headers:this.headers(options.headers)}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"admin_query_failed");return data}
  rpc(name,body={}){return this.request(`/rpc/${name}`,{method:"POST",body:JSON.stringify(body)})}
  async dashboard(){return this.rpc("admin_dashboard_snapshot")}
  async users(limit=50,offset=0){return this.rpc("admin_list_users",{result_limit:limit,result_offset:offset})}
  async reports(){const [reports,risks]=await Promise.all([this.request("/reports?select=id,session_id,reporter_ref,target_ref,reason,weight,created_at&order=created_at.desc&limit=100"),this.request("/risk_scores?select=target_ref,recent_score,lifetime_score,unique_reporters,last_report_at")]),byTarget=Object.fromEntries(risks.map(item=>[item.target_ref,item]));return reports.map(report=>({...report,risk:byTarget[report.target_ref]||null}))}
  restrictions(){return this.request("/restrictions?select=target_ref,status,reason,active,updated_at&order=updated_at.desc&limit=100")}
  promotions(type){const table=type==="coupon"?"coupons":"offers";return this.request(`/${table}?select=*&order=created_at.desc&limit=100`)}
  audit(){return this.request("/admin_audit?select=id,admin_user_id,action,target_type,target_ref,created_at&order=created_at.desc&limit=100")}
  ledger(userId){return this.request(`/wallet_ledger?select=id,delta,balance_after,entry_type,reason,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`)}
  wallet({adminId,userId,delta,reason,operationId}){return this.rpc("admin_adjust_wallet",{admin_id:adminId,target_user_id:userId,credit_delta:delta,ledger_reason:reason,operation_id:operationId})}
  restrict({adminId,targetRef,status,reason}){return this.rpc("admin_set_restriction",{admin_id:adminId,target:targetRef,new_status:status,restriction_reason:reason})}
  savePromotion({adminId,type,payload}){return this.rpc("admin_save_promotion",{admin_id:adminId,promotion_type:type,payload})}
}
