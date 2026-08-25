import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";


export function requireReleaseRevision(value){if(!/^[0-9a-f]{40}$/i.test(value||""))throw new Error("RELEASE_REVISION must be a full 40-character commit SHA");return value.toLowerCase();}
export function launchReportFingerprint(content){return createHash("sha256").update(content).digest("hex");}
export async function fingerprintLaunchReport(path,expectedRevision,expectedKind,read=readFile){
  const content=await read(path);
  const report=JSON.parse(content);
  if(requireReleaseRevision(report.revision)!==requireReleaseRevision(expectedRevision))throw new Error("launch report revision does not match the release");
  if(report.kind!==expectedKind)throw new Error("launch report kind does not match");
  return launchReportFingerprint(content);
}
export async function writeLaunchReport(path,report){if(!path)throw new Error("report path is required");await writeFile(path,`${JSON.stringify(report,null,2)}\n`,{encoding:"utf8",flag:"wx"});return path;}
export async function writeFingerprintedLaunchReport(path,report){
  await writeLaunchReport(path,report);
  const fingerprint=await fingerprintLaunchReport(path,report.revision,report.kind);
  return{path,fingerprint};
}
