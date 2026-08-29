export class ContactUnlockService{
  constructor({url,serviceKey,fetcher=fetch}){this.url=url;this.serviceKey=serviceKey;this.fetcher=(...args)=>fetcher(...args)}
  async activate({sessionId,leftUserId,rightUserId}){if(!sessionId||!leftUserId||!rightUserId||leftUserId===rightUserId)throw new Error("invalid_contact_unlock");const response=await this.fetcher(`${this.url}/rest/v1/rpc/activate_contact_unlock`,{method:"POST",headers:{apikey:this.serviceKey,authorization:`Bearer ${this.serviceKey}`,"content-type":"application/json"},body:JSON.stringify({target_session_id:sessionId,left_user_id:leftUserId,right_user_id:rightUserId})}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"contact_unlock_failed");return data[0];}
}
