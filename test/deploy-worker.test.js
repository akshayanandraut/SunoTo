import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { workerDeployArguments } from "../scripts/deploy-worker.mjs";

describe("revision-bound Worker deployment",()=>{
  const revision="a".repeat(40);
  it("injects the exact SHA while preserving existing remote variables",()=>{const args=workerDeployArguments({RELEASE_REVISION:revision});assert.deepEqual(args,["deploy","--config","worker/wrangler.toml","--var",`RELEASE_REVISION:${revision}`,"--tag","git-aaaaaaaaaaaa","--message",`Release ${revision}`,"--strict","--keep-vars"]);});
  it("supports bounded environment selection and a local dry run",()=>{const args=workerDeployArguments({RELEASE_REVISION:revision,WRANGLER_ENV:"staging",DRY_RUN:"true"});assert.deepEqual(args.slice(-3),["--env","staging","--dry-run"]);assert.throws(()=>workerDeployArguments({RELEASE_REVISION:revision,WRANGLER_ENV:"../../other"}),/unsupported/);});
  it("fails before Wrangler when the release SHA is missing",async()=>{assert.throws(()=>workerDeployArguments({}),/40-character/);const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));assert.equal(pkg.scripts["worker:deploy"],"node scripts/deploy-worker.mjs");});
});
