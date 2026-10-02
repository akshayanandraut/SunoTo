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
