export class RestrictionService{
  constructor(env,fetcher=fetch){this.env=env;this.fetcher=fetcher}
  async find(refs){const safe=[...new Set(refs.filter(Boolean).map(String).filter(ref=>/^[a-zA-Z0-9_-]{8,100}$/.test(ref)))].slice(0,5);if(!safe.length)return[];const encoded=safe.map(encodeURIComponent).join(","),response=await this.fetcher(`${this.env.SUPABASE_URL}/rest/v1/restrictions?select=target_ref,status&active=eq.true&target_ref=in.(${encoded})`,{headers:{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`}});if(!response.ok)throw new Error("restriction_lookup_failed");return response.json();}
}
