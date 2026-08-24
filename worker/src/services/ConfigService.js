import { normalizeAdConfig } from "../policies/adPolicy.js";
import { normalizeVirtualConfig } from "../policies/virtualPolicy.js";
let cachedAds=null,adsCachedUntil=0,cachedVirtual=null,virtualCachedUntil=0;
export class ConfigService{
  constructor(env,fetcher=fetch){this.env=env;this.fetcher=fetcher}
  headers(){return{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"}}
  async row(key){const response=await this.fetcher(`${this.env.SUPABASE_URL}/rest/v1/app_config?key=eq.${key}&select=value,version,updated_at&limit=1`,{headers:this.headers()});if(!response.ok)throw new Error(`${key}_config_lookup_failed`);const [row]=await response.json();if(!row)throw new Error(`${key}_config_missing`);return row}
  async ads(now=Date.now()){if(cachedAds&&adsCachedUntil>now)return cachedAds;const row=await this.row("ads");cachedAds={config:normalizeAdConfig(row.value),version:row.version,updatedAt:row.updated_at};adsCachedUntil=now+30000;return cachedAds}
  async virtual(now=Date.now()){if(cachedVirtual&&virtualCachedUntil>now)return cachedVirtual;const row=await this.row("virtual");cachedVirtual={config:normalizeVirtualConfig(row.value),version:row.version,updatedAt:row.updated_at};virtualCachedUntil=now+30000;return cachedVirtual}
  async updateAds({adminId,expectedVersion,config}){const normalized=normalizeAdConfig(config),response=await this.fetcher(`${this.env.SUPABASE_URL}/rest/v1/rpc/update_ad_config`,{method:"POST",headers:this.headers(),body:JSON.stringify({admin_id:adminId,expected_version:expectedVersion,new_value:normalized})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"ad_config_update_failed");cachedAds=null;adsCachedUntil=0;const row=Array.isArray(data)?data[0]:data;return{config:normalizeAdConfig(row.value),version:row.version,updatedAt:row.updated_at}}
}
export function clearConfigCache(){cachedAds=null;adsCachedUntil=0;cachedVirtual=null;virtualCachedUntil=0;}
