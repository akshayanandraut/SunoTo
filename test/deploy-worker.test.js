import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runWorkerDeploy,workerDeployArguments } from "../scripts/deploy-worker.mjs";

describe("revision-bound Worker deployment",()=>{
  const revision="a".repeat(40);
  it("injects the exact SHA while preserving existing remote variables",()=>{const args=workerDeployArguments({RELEASE_REVISION:revision});assert.deepEqual(args,["deploy","--config","worker/wrangler.toml","--var",`RELEASE_REVISION:${revision}`,"--tag","git-aaaaaaaaaaaa","--message",`Release ${revision}`,"--strict","--keep-vars"]);});
  it("supports bounded environment selection and a local dry run",()=>{const args=workerDeployArguments({RELEASE_REVISION:revision,WRANGLER_ENV:"staging",DRY_RUN:"true"});assert.deepEqual(args.slice(-3),["--env","staging","--dry-run"]);assert.throws(()=>workerDeployArguments({RELEASE_REVISION:revision,WRANGLER_ENV:"../../other"}),/unsupported/);});
  it("fails before Wrangler when the release SHA is missing",async()=>{assert.throws(()=>workerDeployArguments({}),/40-character/);const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));assert.equal(pkg.scripts["worker:deploy"],"node scripts/deploy-worker.mjs");});
  it("verifies the checkout before invoking Wrangler",()=>{
    let invoked=false;
    const mismatch=(_command,args)=>({status:0,stdout:args.includes("rev-parse")?"b".repeat(40):""});
    assert.throws(()=>runWorkerDeploy({RELEASE_REVISION:revision},()=>{invoked=true;return{status:0}},mismatch),/current Git HEAD/);
    assert.equal(invoked,false);
    let args;
    const clean=(_command,values)=>({status:0,stdout:values.includes("rev-parse")?revision:""});
    runWorkerDeploy({RELEASE_REVISION:revision},(_command,values)=>{args=values;return{status:0}},clean);
    assert.deepEqual(args.slice(1),workerDeployArguments({RELEASE_REVISION:revision}));
  });
});
