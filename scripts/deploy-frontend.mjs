import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath,pathToFileURL } from "node:url";
import { requireReleaseRevision } from "./launch-report.mjs";

const PROJECT=/^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/;
const BRANCH=/^[a-z0-9][a-z0-9._/-]{0,127}$/i;

function validBranch(value){
  return BRANCH.test(value||"")&&!value.includes("..")&&!value.includes("//")&&!value.endsWith("/");
}

export function frontendDeployArguments(env={}){
  const revision=requireReleaseRevision(env.RELEASE_REVISION);
  const project=env.CLOUDFLARE_PAGES_PROJECT;
  const branch=env.PAGES_BRANCH;
  if(!PROJECT.test(project||""))throw new Error("CLOUDFLARE_PAGES_PROJECT contains unsupported characters");
  if(!validBranch(branch))throw new Error("PAGES_BRANCH contains unsupported characters");
  return [
    "pages","deploy","dist",
    "--project-name",project,
    "--branch",branch,
    "--commit-hash",revision,
    "--commit-message",`Release ${revision}`,
  ];
}

export async function verifyFrontendArtifact(env={},read=readFile){
  const revision=requireReleaseRevision(env.RELEASE_REVISION);
  const manifest=JSON.parse(await read(new URL("../dist/release.json",import.meta.url),"utf8"));
  if(requireReleaseRevision(manifest.revision)!==revision)throw new Error("dist/release.json does not match RELEASE_REVISION");
  return manifest;
}

export async function runFrontendDeploy(env=process.env,runner=spawnSync,read=readFile){
  await verifyFrontendArtifact(env,read);
  const cli=fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js",import.meta.url));
  const result=runner(process.execPath,[cli,...frontendDeployArguments(env)],{
    cwd:fileURLToPath(new URL("..",import.meta.url)),
    env,
    stdio:"inherit",
  });
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`Wrangler Pages deploy failed with exit code ${result.status}`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{
  await runFrontendDeploy();
}catch(error){
  console.error(error.message);
  process.exitCode=1;
}
