// Product payment processing is owned by Grasany. This deliberately contains
// no guessed gateway URL, merchant ID, credential, or provider fallback.
// Product-local wallets, memberships and entitlements remain separate records.
export const CENTRAL_PAYMENT_CONTRACT=Object.freeze({
  provider:"unprovisioned",
  enabled:false,
  serviceBaseUrl:null,
  scopedCredential:null,
  merchantApproved:false,
  liveVerified:false
});

export function getCentralPaymentReadiness(){
  const blockers=[];
  if(!CENTRAL_PAYMENT_CONTRACT.merchantApproved)blockers.push("central_merchant_unapproved");
  if(!CENTRAL_PAYMENT_CONTRACT.serviceBaseUrl)blockers.push("central_payment_service_unprovisioned");
  if(!CENTRAL_PAYMENT_CONTRACT.scopedCredential)blockers.push("central_payment_credential_unprovisioned");
  if(!CENTRAL_PAYMENT_CONTRACT.liveVerified)blockers.push("central_payment_live_verification_pending");
  return Object.freeze({enabled:CENTRAL_PAYMENT_CONTRACT.enabled&&blockers.length===0,status:"not_configured",provider:CENTRAL_PAYMENT_CONTRACT.provider,blockers:Object.freeze(blockers)});
}

export function centralPaymentUnavailableResponse(){return Response.json({error:"central_payment_service_not_configured",message:"Payments are unavailable until the central Grasany merchant contract is approved and verified."},{status:503,headers:{"retry-after":"300"}});}
