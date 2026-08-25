import { it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

it("writes a revision-bound structured k6 spike report",async()=>{
  const source=await readFile(new URL("../load/staging-spike.js",import.meta.url),"utf8");
  for(const value of ["RELEASE_REVISION","SPIKE_REPORT_PATH","staging-spike","handleSummary","p95Milliseconds","p99Milliseconds","failureRate","peakVirtualUsers"])assert.match(source,new RegExp(value));
  assert.match(source,/p\(95\)<500/);
  assert.match(source,/p\(99\)<1000/);
  assert.match(source,/rate<0\.01/);
});
