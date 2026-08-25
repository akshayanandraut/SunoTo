import { spawnSync } from "node:child_process";
import { fileURLToPath,pathToFileURL } from "node:url";
import { requireReleaseRevision } from "./launch-report.mjs";

const ENVIRONMENT=/^[a-z0-9_-]{1,32}$/i;
export function workerDeployArguments(env={}){
  const revision=requireReleaseRevision(env.RELEASE_REVISION),environment=env.WRANGLER_ENV;
  if(environment&&!ENVIRONMENT.test(environment))throw new Error("WRANGLER_ENV contains unsupported characters");
  const args=["deploy","--config","worker/wrangler.toml","--var",`RELEASE_REVISION:${revision}`,"--tag",`git-${revision.slice(0,12)}`,"--message",`Release ${revision}`,"--strict","--keep-vars"];
  if(environment)args.push("--env",environment);
  if(env.DRY_RUN==="true")args.push("--dry-run");
  return args;
}
export function runWorkerDeploy(env=process.env,runner=spawnSync){const cli=fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js",import.meta.url)),result=runner(process.execPath,[cli,...workerDeployArguments(env)],{cwd:fileURLToPath(new URL("..",import.meta.url)),env,stdio:"inherit"});if(result.error)throw result.error;if(result.status!==0)throw new Error(`Wrangler deploy failed with exit code ${result.status}`);}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{runWorkerDeploy();}catch(error){console.error(error.message);process.exitCode=1;}
