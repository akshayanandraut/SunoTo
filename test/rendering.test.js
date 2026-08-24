import { it } from "node:test";
import assert from "node:assert/strict";
import { escapeText } from "../web/js/ui.js";

it("escapes local values before template rendering",()=>{
  assert.equal(escapeText(`<img src=x onerror="bad()">`),"&lt;img src=x onerror=&quot;bad()&quot;&gt;");
});
