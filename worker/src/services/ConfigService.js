import { normalizeAdConfig } from "../policies/adPolicy.js";
let cachedAds=null,cachedUntil=0;
export class ConfigService{
  constructor(env,fetcher=fetch){this.env=env;this.fetcher=fetcher}
  headers(){return{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"}}
  async ads(now=Date.now()){if(cachedAds&&cachedUntil>now)return cachedAds;const response=await this.fetcher(`${this.env.SUPABASE_URL}/rest/v1/app_config?key=eq.ads&select=value,version,updated_at&limit=1`,{headers:this.headers()});if(!response.ok)throw new Error("ad_config_lookup_failed");const [row]=await response.json();if(!row)throw new Error("ad_config_missing");cachedAds={config:normalizeAdConfig(row.value),version:row.version,updatedAt:row.updated_at};cachedUntil=now+30000;return cachedAds}
  async updateAds({adminId,expectedVersion,config}){const normalized=normalizeAdConfig(config),response=await this.fetcher(`${this.env.SUPABASE_URL}/rest/v1/rpc/update_ad_config`,{method:"POST",headers:this.headers(),body:JSON.stringify({admin_id:adminId,expected_version:expectedVersion,new_value:normalized})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"ad_config_update_failed");cachedAds=null;cachedUntil=0;const row=Array.isArray(data)?data[0]:data;return{config:normalizeAdConfig(row.value),version:row.version,updatedAt:row.updated_at}}
}
export function clearConfigCache(){cachedAds=null;cachedUntil=0;}
