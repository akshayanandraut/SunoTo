const encoder=new TextEncoder();
function hex(bytes){return[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,"0")).join("")}
async function hmac(message,secret){const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",key,encoder.encode(message)))}
function safeEqual(left,right){if(typeof left!=="string"||typeof right!=="string"||left.length!==right.length)return false;let difference=0;for(let index=0;index<left.length;index++)difference|=left.charCodeAt(index)^right.charCodeAt(index);return difference===0}
export class RazorpayService{
  constructor({keyId,keySecret,webhookSecret,fetcher=fetch}){this.keyId=keyId;this.keySecret=keySecret;this.webhookSecret=webhookSecret;this.fetcher=(...args)=>fetcher(...args)}
  async request(path,options={}){const response=await this.fetcher(`https://api.razorpay.com/v1${path}`,{...options,headers:{authorization:`Basic ${btoa(`${this.keyId}:${this.keySecret}`)}`,"content-type":"application/json",...options.headers}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error?.description||"razorpay_request_failed");return data}
  createOrder({amountPaise,receipt,notes}){if(!Number.isSafeInteger(amountPaise)||amountPaise<5000)throw new Error("minimum_recharge_50");return this.request("/orders",{method:"POST",body:JSON.stringify({amount:amountPaise,currency:"INR",receipt,notes})})}
  payment(paymentId){return this.request(`/payments/${encodeURIComponent(paymentId)}`)}
  order(orderId){return this.request(`/orders/${encodeURIComponent(orderId)}`)}
  async verifyCheckout({orderId,paymentId,signature}){return safeEqual(await hmac(`${orderId}|${paymentId}`,this.keySecret),signature)}
  async verifyWebhook(rawBody,signature){return safeEqual(await hmac(rawBody,this.webhookSecret),signature)}
  createSubscription({planId,totalCount,notes}){return this.request("/subscriptions",{method:"POST",body:JSON.stringify({plan_id:planId,total_count:totalCount,customer_notify:1,notes})})}
  subscription(subscriptionId){return this.request(`/subscriptions/${encodeURIComponent(subscriptionId)}`)}
  cancelSubscription(subscriptionId){return this.request(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,{method:"POST",body:JSON.stringify({cancel_at_cycle_end:0})})}
  async verifySubscriptionCheckout({subscriptionId,paymentId,signature}){return safeEqual(await hmac(`${paymentId}|${subscriptionId}`,this.keySecret),signature)}
}
export const razorpayInternals={hmac,safeEqual};
