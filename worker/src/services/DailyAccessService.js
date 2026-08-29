export class DailyAccessService{
  constructor({url,serviceKey,fetcher=fetch}){this.url=url;this.serviceKey=serviceKey;this.fetcher=(...args)=>fetcher(...args)}
  async activate({userId,activationTime}){const response=await this.fetcher(`${this.url}/rest/v1/rpc/activate_daily_access`,{method:"POST",headers:{apikey:this.serviceKey,authorization:`Bearer ${this.serviceKey}`,"content-type":"application/json"},body:JSON.stringify({target_user_id:userId,...(activationTime?{activation_time:activationTime}:{})})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"daily_access_failed");return data[0];}
}
