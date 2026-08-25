import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { requireReleaseRevision } from "./launch-report.mjs";

const repositoryRoot=fileURLToPath(new URL("..",import.meta.url));

function gitOutput(runner,cwd,args){
  const result=runner("git",["-c",`safe.directory=${cwd}`,...args],{cwd,encoding:"utf8"});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`Git release check failed with exit code ${result.status}`);
  return String(result.stdout||"").trim();
}

export function verifyReleaseCheckout(expectedRevision,runner=spawnSync,cwd=repositoryRoot){
  const expected=requireReleaseRevision(expectedRevision);
  const actual=gitOutput(runner,cwd,["rev-parse","HEAD"]).toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(actual))throw new Error("Git HEAD is not a full 40-character commit SHA");
  if(actual!==expected)throw new Error("RELEASE_REVISION does not match the current Git HEAD");
  if(gitOutput(runner,cwd,["status","--porcelain","--untracked-files=no"]))throw new Error("Tracked files must be clean before deployment");
  return actual;
}
