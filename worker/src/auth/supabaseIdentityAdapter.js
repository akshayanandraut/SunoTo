import { GRASANY_OIDC_PACKET } from "./grasanyOidc.js";

// The central packet is disabled and the product database activation is
// intentionally pending. This adapter is an explicit fail-closed contract,
// not a hidden fallback to browser Supabase sessions or email matching.
export const supabaseIdentityAdapter=Object.freeze({
  name:"supabase-product-account-store",
  enabled:false,
  async findAccountByGrasanySubject(){throw new Error("product_identity_storage_not_configured");},
  async getMembership(){throw new Error("product_identity_storage_not_configured");},
  async getEntitlements(){throw new Error("product_identity_storage_not_configured");},
  async getProductRoles(){throw new Error("product_identity_storage_not_configured");}
});

export function isProductOperator(principal){return Array.isArray(principal?.productRoles)&&principal.productRoles.includes("operator");}

// The lookup must be a server-only product-store operation; never accept browser claims.
export async function resolveVerifiedProductIdentity(principal,lookup){
  const issuer=principal?.issuer,subject=principal?.subject;
  if(issuer!==GRASANY_OIDC_PACKET.issuer||typeof subject!=="string"||!subject.trim()||subject.length>255||typeof lookup!=="function")return null;
  const rows=await lookup({issuer,subject});
  if(!Array.isArray(rows)||rows.length!==1)return null;
  const row=rows[0];
  if(row?.issuer!==issuer||row?.subject!==subject||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.accountId??""))return null;
  return Object.freeze({accountId:row.accountId,issuer,subject,roles:Object.freeze([]),entitlements:Object.freeze([])});
}

const PRODUCT_DATABASE_ORIGIN="https://mybjgljylmcweeprhhlw.supabase.co";

// Use only the product Worker binding; never forward a browser or central token.
export async function lookupSunotoProductIdentity(env,principal,fetcher=env.FETCHER||fetch){
  if(env.SUNOTO_PRODUCT_IDENTITY_LOOKUP!=="1")return {status:"service_not_configured"};
  const secret=env.SUPABASE_SERVICE_ROLE_KEY;
  if(typeof secret!=="string"||!secret||String(env.SUPABASE_URL??"").replace(/\/$/,"")!==PRODUCT_DATABASE_ORIGIN)return {status:"service_unavailable"};
  try{
    const identity=await resolveVerifiedProductIdentity(principal,async ({issuer,subject})=>{
      const url=new URL("/rest/v1/grasany_identity_links",PRODUCT_DATABASE_ORIGIN);
      url.search=new URLSearchParams({select:"issuer,subject,account_id",issuer:"eq."+issuer,subject:"eq."+subject,limit:"2"});
      const response=await fetcher(url,{method:"GET",headers:{apikey:secret,authorization:"Bearer "+secret,accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error("product_identity_lookup_failed");
      const rows=await response.json();
      if(!Array.isArray(rows))throw Error("product_identity_lookup_invalid");
      return rows.map(row=>({issuer:row.issuer,subject:row.subject,accountId:row.account_id}));
    });
    return identity?{status:"linked",identity}:{status:"not_linked"};
  }catch{return {status:"service_unavailable"};}
}
