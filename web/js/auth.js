import { createClient } from "@supabase/supabase-js";
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const authConfigured=Boolean(url&&key&&!url.includes("example.supabase.co")&&!key.includes("replace-"));
export const supabase=authConfigured?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
export async function currentSession(){if(!supabase)return null;return(await supabase.auth.getSession()).data.session;}
export async function signUp(email,password){if(!supabase)throw new Error("Supabase is not configured yet.");const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${location.origin}/#/account`}});if(error)throw error;return data;}
export async function signIn(email,password){if(!supabase)throw new Error("Supabase is not configured yet.");const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;return data;}
export async function sendPasswordReset(email){if(!supabase)throw new Error("Supabase is not configured yet.");const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/#/account`});if(error)throw error;}
export async function updatePassword(password){if(!supabase)throw new Error("Supabase is not configured yet.");const {error}=await supabase.auth.updateUser({password});if(error)throw error;}
export async function signOut(){if(supabase)await supabase.auth.signOut();}
export function onAuthChange(callback){if(!supabase)return()=>{};const {data}=supabase.auth.onAuthStateChange((event,session)=>callback(session,event));return()=>data.subscription.unsubscribe();}
