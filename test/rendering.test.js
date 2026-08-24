import { it } from "node:test";
import assert from "node:assert/strict";
import { escapeText } from "../web/js/ui.js";
import { views } from "../web/js/views.js";

it("escapes local values before template rendering",()=>{
  assert.equal(escapeText(`<img src=x onerror="bad()">`),"&lt;img src=x onerror=&quot;bad()&quot;&gt;");
});

it("escapes restored onboarding state at the template boundary",()=>{
  const attack=`\"><img src=x onerror=\"bad()\">`,html=views.onboarding({storageLimited:false,identity:{handle:attack},preferences:{age:attack,name:attack,languages:[],interests:[]}});
  assert.equal(html.includes("<img src=x"),false);
  assert.match(html,/&lt;img src=x/);
});
