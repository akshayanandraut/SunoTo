export async function verifySupabaseUser(request,env,fetcher=fetch){
  const authorization=request.headers.get("authorization");if(!authorization?.startsWith("Bearer ")||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return null;
  const response=await fetcher(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{authorization,apikey:env.SUPABASE_PUBLISHABLE_KEY}});if(!response.ok)return null;const user=await response.json();return{...user,emailVerified:Boolean(user.email_confirmed_at||user.confirmed_at),accessToken:authorization.slice(7)};
}
export async function supabaseRest(env,user,path,options={}){return fetch(`${env.SUPABASE_URL}/rest/v1${path}`,{...options,headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${user.accessToken}`,"content-type":"application/json",...options.headers}});}
