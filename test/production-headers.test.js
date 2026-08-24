import { it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderProductionHeaders } from "../scripts/render-production-headers.mjs";

it("adds only the configured API and Supabase connect origins",async()=>{
  const template=await readFile(new URL("../web/public/_headers",import.meta.url),"utf8"),headers=renderProductionHeaders(template,{apiBaseUrl:"https://api.random.in/api/v1",supabaseUrl:"https://project.supabase.co"});
  for(const origin of ["https://api.random.in","wss://api.random.in","https://project.supabase.co","wss://project.supabase.co"])assert.match(headers,new RegExp(origin.replaceAll(".","\\.")));
  assert.doesNotMatch(headers,/evil\.invalid|127\.0\.0\.1|\*\.supabase\.co/);
});
