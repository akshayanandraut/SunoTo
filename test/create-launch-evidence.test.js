import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,readFile,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLaunchEvidenceDraft } from "../scripts/create-launch-evidence.mjs";
import { launchReportFingerprint } from "../scripts/launch-report.mjs";

describe("release-bound launch evidence draft",()=>{
  const revision="a".repeat(40);
  it("copies only verified report metadata into a new incomplete draft",async()=>{
    const cwd=await mkdtemp(join(tmpdir(),"sunoto-evidence-"));
    const smoke=JSON.stringify({kind:"staging-smoke",revision});
    const realtime=JSON.stringify({kind:"staging-realtime",revision});
    const template={revision:"replace",release:{frontendVersion:"replace"},staging:{smokeReportReference:"replace"},load:{reportReference:"replace"}};
    const env={RELEASE_REVISION:revision,EVIDENCE_PATH:"release/evidence.json",SMOKE_REPORT_PATH:"reports/smoke.json",REALTIME_REPORT_PATH:"reports/realtime.json"};
    await import("node:fs/promises").then(({mkdir})=>mkdir(join(cwd,"release"),{recursive:true}));
    const result=await createLaunchEvidenceDraft(env,{cwd,verifyCheckout:value=>value,readTemplate:async()=>JSON.stringify(template),readReport:async path=>String(path).endsWith("smoke.json")?smoke:realtime,write:writeFile});
    const stored=JSON.parse(await readFile(result.outputPath,"utf8"));
    assert.equal(stored.revision,revision);
    assert.equal(stored.staging.smokeReportPath,"../reports/smoke.json");
    assert.equal(stored.staging.smokeReportSha256,launchReportFingerprint(smoke));
    assert.equal(stored.load.reportSha256,launchReportFingerprint(realtime));
    assert.equal(stored.release.frontendVersion,"replace");
    await assert.rejects(()=>createLaunchEvidenceDraft(env,{cwd,verifyCheckout:value=>value,readTemplate:async()=>JSON.stringify(template),readReport:async path=>String(path).endsWith("smoke.json")?smoke:realtime,write:writeFile}),error=>error.code==="EEXIST");
  });
});
