import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { frontendDeployArguments,runFrontendDeploy,verifyFrontendArtifact } from "../scripts/deploy-frontend.mjs";

describe("revision-bound frontend deployment",()=>{
  const revision="a".repeat(40);
  const env={RELEASE_REVISION:revision,CLOUDFLARE_PAGES_PROJECT:"random-chat",PAGES_BRANCH:"main"};

  it("binds Pages deployment metadata to the exact release",()=>{
    assert.deepEqual(frontendDeployArguments(env),[
      "pages","deploy","dist",
      "--project-name","random-chat",
      "--branch","main",
      "--commit-hash",revision,
      "--commit-message",`Release ${revision}`,
    ]);
  });

  it("rejects missing or unsafe Pages targets",()=>{
    assert.throws(()=>frontendDeployArguments({...env,CLOUDFLARE_PAGES_PROJECT:""}),/CLOUDFLARE_PAGES_PROJECT/);
    assert.throws(()=>frontendDeployArguments({...env,PAGES_BRANCH:"../production"}),/PAGES_BRANCH/);
    assert.throws(()=>frontendDeployArguments({...env,PAGES_BRANCH:"--branch"}),/PAGES_BRANCH/);
  });

  it("refuses to upload an artifact built from another revision",async()=>{
    assert.deepEqual(await verifyFrontendArtifact(env,async()=>JSON.stringify({revision})),{revision});
    await assert.rejects(()=>verifyFrontendArtifact(env,async()=>JSON.stringify({revision:"b".repeat(40)})),/does not match/);
  });

  it("verifies the artifact before invoking the local Wrangler CLI",async()=>{
    let invocation;
    await runFrontendDeploy(env,(command,args,options)=>{
      invocation={command,args,options};
      return {status:0};
    },async()=>JSON.stringify({revision}),(_command,args)=>({status:0,stdout:args.includes("rev-parse")?revision:""}));
    assert.equal(invocation.command,process.execPath);
    assert.match(invocation.args[0],/wrangler[\\/]bin[\\/]wrangler\.js$/);
    assert.deepEqual(invocation.args.slice(1),frontendDeployArguments(env));
    assert.equal(invocation.options.stdio,"inherit");
  });

  it("is the only package entry point for a Pages release",async()=>{
    const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
    assert.equal(pkg.scripts["frontend:deploy"],"npm run production:build && node scripts/deploy-frontend.mjs");
  });
});
