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
