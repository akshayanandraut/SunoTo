import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fingerprintLaunchReport,launchReportFingerprint,requireReleaseRevision,writeLaunchReport } from "../scripts/launch-report.mjs";

describe("immutable launch reports",()=>{
  it("requires a full release revision",()=>{assert.equal(requireReleaseRevision("A".repeat(40)),"a".repeat(40));assert.throws(()=>requireReleaseRevision("abc"),/40-character/);});
  it("fingerprints a report only when its kind and revision match",async()=>{const content=JSON.stringify({kind:"staging-smoke",revision:"a".repeat(40)}),read=async()=>content;assert.match(await fingerprintLaunchReport("ignored","a".repeat(40),"staging-smoke",read),/^[0-9a-f]{64}$/);assert.notEqual(launchReportFingerprint(content),launchReportFingerprint(content+" "));await assert.rejects(()=>fingerprintLaunchReport("ignored","b".repeat(40),"staging-smoke",read),/revision/);await assert.rejects(()=>fingerprintLaunchReport("ignored","a".repeat(40),"staging-realtime",read),/kind/);});
  it("writes a report once and refuses to overwrite evidence",async()=>{const directory=await mkdtemp(join(tmpdir(),"random-chat-report-")),path=join(directory,"smoke.json"),report={kind:"staging-smoke",revision:"a".repeat(40)};await writeLaunchReport(path,report);assert.deepEqual(JSON.parse(await readFile(path,"utf8")),report);await assert.rejects(()=>writeLaunchReport(path,{kind:"tampered"}),error=>error.code==="EEXIST");});
});
