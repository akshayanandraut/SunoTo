import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { views } from "../web/js/views.js";

test("logged-out account view exposes only Grasany ID and fails closed when unconfigured",()=>{
  const html=views.account({accountSession:null,activeUsersDisplay:0,wallet:null,uiTheme:null,accountMessage:"",grasanyAuthConfigured:false});
  assert.match(html,/id="grasany-sign-in"/);
  assert.match(html,/disabled aria-describedby="grasany-sign-in-note"/);
  assert.match(html,/No alternate sign-in method is available/);
  assert.doesNotMatch(html,/name="(?:email|password)"|google-sign-in|reset-password|auth-mode-toggle/);
});

test("browser auth wrapper exposes no competing Supabase identity or mail-sending path",async()=>{
  const auth=await readFile(new URL("../web/js/auth.js",import.meta.url),"utf8");
  for(const api of ["signUp(","signIn(","sendPasswordReset(","resetPasswordForEmail(","signInWithPassword(","signInWithOAuth("])assert.doesNotMatch(auth,new RegExp(api.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
});
