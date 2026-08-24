export class WalletService{
  constructor({url,serviceKey,fetcher=fetch}){this.url=url;this.serviceKey=serviceKey;this.fetcher=fetcher}
  async apply({userId,delta,type,reason,idempotencyKey,metadata={}}){
    if(!Number.isSafeInteger(delta)||delta===0)throw new Error("invalid_wallet_delta");if(typeof idempotencyKey!=="string"||idempotencyKey.length<8)throw new Error("invalid_idempotency_key");
    const response=await this.fetcher(`${this.url}/rest/v1/rpc/apply_wallet_entry`,{method:"POST",headers:{apikey:this.serviceKey,authorization:`Bearer ${this.serviceKey}`,"content-type":"application/json"},body:JSON.stringify({target_user_id:userId,credit_delta:delta,ledger_type:type,ledger_reason:reason,ledger_idempotency_key:idempotencyKey,ledger_metadata:metadata})});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"wallet_entry_failed");return data[0];
  }
}
