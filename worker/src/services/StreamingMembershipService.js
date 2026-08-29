import { RazorpayService } from "./RazorpayService.js";
const SUBSCRIPTION_REFERENCE=/^sub_[a-zA-Z0-9]{1,100}$/,PAYMENT_REFERENCE=/^pay_[a-zA-Z0-9]{1,100}$/;
export class StreamingMembershipService{
  constructor(env,fetcher=fetch){this.env=env;this.fetcher=(...args)=>fetcher(...args);this.razorpay=new RazorpayService({keyId:env.RAZORPAY_KEY_ID,keySecret:env.RAZORPAY_KEY_SECRET,webhookSecret:env.RAZORPAY_WEBHOOK_SECRET,fetcher:this.fetcher})}
  serviceHeaders(){return{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"}}
  async database(path,options={}){const response=await this.fetcher(`${this.env.SUPABASE_URL}/rest/v1${path}`,{...options,headers:{...this.serviceHeaders(),...options.headers}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"streaming_membership_database_failed");return data}
  async createSubscription(user){
    if(!user.emailVerified)throw new Error("email_verification_required");
    if(!this.env.RAZORPAY_STREAMING_PLAN_ID)throw new Error("streaming_membership_not_configured");
    const subscription=await this.razorpay.createSubscription({planId:this.env.RAZORPAY_STREAMING_PLAN_ID,totalCount:120,notes:{user_id:user.id}});
    if(!SUBSCRIPTION_REFERENCE.test(subscription.id||""))throw new Error("invalid_provider_subscription");
    await this.database("/rpc/upsert_streaming_membership",{method:"POST",body:JSON.stringify({target_user_id:user.id,subscription_id:subscription.id,new_status:"created",period_end:null})});
    return{keyId:this.env.RAZORPAY_KEY_ID,subscriptionId:subscription.id};
  }
  async verifyCheckout({user,subscriptionId,paymentId,signature}){
    if(!SUBSCRIPTION_REFERENCE.test(subscriptionId)||!PAYMENT_REFERENCE.test(paymentId)||!/^[a-f0-9]{64}$/i.test(signature))throw new Error("invalid_subscription_signature");
    if(!await this.razorpay.verifySubscriptionCheckout({subscriptionId,paymentId,signature}))throw new Error("invalid_subscription_signature");
    const subscription=await this.razorpay.subscription(subscriptionId);
    if(subscription.notes?.user_id!==user.id||!["active","authenticated"].includes(subscription.status))throw new Error("subscription_not_active");
    const periodEnd=subscription.current_end?new Date(subscription.current_end*1000).toISOString():null;
    const [row]=await this.database("/rpc/upsert_streaming_membership",{method:"POST",body:JSON.stringify({target_user_id:user.id,subscription_id:subscriptionId,new_status:"active",period_end:periodEnd})});
    return row;
  }
  async status(userId){return Boolean(await this.database(`/rpc/streaming_membership_status`,{method:"POST",body:JSON.stringify({target_user_id:userId})}));}
  async onWebhookEvent(eventType,subscriptionEntity){
    const subscriptionId=subscriptionEntity?.id;
    if(!SUBSCRIPTION_REFERENCE.test(subscriptionId||""))throw new Error("invalid_subscription_event");
    const userId=await this.database(`/rpc/subscription_id_to_user`,{method:"POST",body:JSON.stringify({subscription_id:subscriptionId})});
    if(!userId)return{accepted:true,ignored:true};
    const periodEnd=subscriptionEntity.current_end?new Date(subscriptionEntity.current_end*1000).toISOString():null;
    const status=eventType==="subscription.cancelled"||eventType==="subscription.halted"?"cancelled":"active";
    await this.database("/rpc/upsert_streaming_membership",{method:"POST",body:JSON.stringify({target_user_id:userId,subscription_id:subscriptionId,new_status:status,period_end:periodEnd})});
    return{accepted:true};
  }
}
