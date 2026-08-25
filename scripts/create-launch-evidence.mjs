import { readFile,writeFile } from "node:fs/promises";
import { dirname,relative,resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyReleaseCheckout } from "./git-release.mjs";
import { fingerprintLaunchReport } from "./launch-report.mjs";

const templateUrl=new URL("../config/launch-evidence.example.json",import.meta.url);

function required(env,name){
  const value=env[name];
  if(!value)throw new Error(`${name} is required`);
  return value;
}

function evidencePath(outputPath,reportPath){
  return relative(dirname(outputPath),reportPath).replaceAll("\\","/");
}

export async function createLaunchEvidenceDraft(env=process.env,dependencies={}){
  const cwd=dependencies.cwd??process.cwd();
  const readTemplate=dependencies.readTemplate??readFile;
  const readReport=dependencies.readReport??readFile;
  const write=dependencies.write??writeFile;
  const verifyCheckout=dependencies.verifyCheckout??verifyReleaseCheckout;
  const outputPath=resolve(cwd,required(env,"EVIDENCE_PATH"));
  const smokePath=resolve(cwd,required(env,"SMOKE_REPORT_PATH"));
  const realtimePath=resolve(cwd,required(env,"REALTIME_REPORT_PATH"));
  const revision=verifyCheckout(required(env,"RELEASE_REVISION"),dependencies.gitRunner,cwd);
  const [template,smokeReportSha256,reportSha256]=await Promise.all([
    readTemplate(templateUrl,"utf8").then(JSON.parse),
    fingerprintLaunchReport(smokePath,revision,"staging-smoke",readReport),
    fingerprintLaunchReport(realtimePath,revision,"staging-realtime",readReport),
  ]);
  const draft={
    ...template,
    revision,
    staging:{...template.staging,smokeReportPath:evidencePath(outputPath,smokePath),smokeReportSha256},
    load:{...template.load,reportPath:evidencePath(outputPath,realtimePath),reportSha256},
  };
  await write(outputPath,`${JSON.stringify(draft,null,2)}\n`,{encoding:"utf8",flag:"wx"});
  return{outputPath,draft};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{
  const {outputPath,draft}=await createLaunchEvidenceDraft();
  console.log(`Evidence draft written to ${outputPath}`);
  console.log(`Smoke report SHA-256: ${draft.staging.smokeReportSha256}`);
  console.log(`Realtime report SHA-256: ${draft.load.reportSha256}`);
  console.log("External evidence placeholders remain incomplete.");
}catch(error){
  console.error(error.message);
  process.exitCode=1;
}
