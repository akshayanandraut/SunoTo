import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { dirname,resolve } from "node:path";
import { fingerprintLaunchReport } from "./launch-report.mjs";

const placeholder=value=>!value||/replace/i.test(String(value));
const reference=value=>typeof value==="string"&&value.trim().length>=3&&!placeholder(value);
const iso=value=>!Number.isNaN(Date.parse(value||""));
const sha256=value=>/^[0-9a-f]{64}$/i.test(value||"");
const https=value=>{try{return new URL(value).protocol==="https:"}catch{return false}};
function timestamp(errors,value,label,now){if(!iso(value))errors.push(`${label} timestamp is missing`);else if(Date.parse(value)>now+300000)errors.push(`${label} timestamp is in the future`);}
export function validateLaunchEvidence(value={},options={}){
  const errors=[],now=options.now??Date.now();
  if(!/^[0-9a-f]{40}$/i.test(value.revision||""))errors.push("revision must be a full 40-character commit SHA");
  else if(options.expectedRevision&&value.revision.toLowerCase()!==options.expectedRevision.toLowerCase())errors.push("revision does not match the expected release commit");

  for(const key of ["frontendVersion","workerVersion","migrationVersion","backupReference"])if(!reference(value.release?.[key]))errors.push(`release.${key} is missing`);
  timestamp(errors,value.release?.restoreDrillAt,"restore drill",now);

  if(!https(value.staging?.webUrl)||!https(value.staging?.apiUrl)||placeholder(value.staging?.webUrl)||placeholder(value.staging?.apiUrl))errors.push("staging must contain non-placeholder HTTPS web and API URLs");
  if(!reference(value.staging?.smokeReportReference))errors.push("staging smoke report reference is missing");
  if(!reference(value.staging?.smokeReportPath))errors.push("staging smoke report path is missing");
  if(!sha256(value.staging?.smokeReportSha256))errors.push("staging smoke report SHA-256 is missing");
  timestamp(errors,value.staging?.smokePassedAt,"staging smoke",now);

  for(const key of ["liveOrderReference","livePaymentReference","refundReference","ledgerReference"])if(!reference(value.payment?.[key]))errors.push(`payment.${key} is missing`);
  if(value.payment?.ledgerReconciled!==true)errors.push("live payment/refund ledger reconciliation is not confirmed");
  timestamp(errors,value.payment?.reconciledAt,"payment reconciliation",now);

  if(placeholder(value.advertising?.provider)||["house","disabled"].includes(String(value.advertising?.provider||"").toLowerCase()))errors.push("a reviewed production ad provider is missing");
  if(!reference(value.advertising?.reviewReference))errors.push("advertising provider review reference is missing");
  timestamp(errors,value.advertising?.tiersVerifiedAt,"advertising verification",now);
  if(value.advertising?.killSwitchVerified!==true)errors.push("ad tiers and kill switch are not verified");

  const load=value.load||{};
  if(!reference(load.reportReference)||!(load.peakVirtualUsers>0))errors.push("load report and peak virtual users are missing");
  if(!reference(load.reportPath))errors.push("load report path is missing");
  if(!sha256(load.reportSha256))errors.push("load report SHA-256 is missing");
  if(!(load.p95Milliseconds>0&&load.p95Milliseconds<500)||!(load.p99Milliseconds>0&&load.p99Milliseconds<1000)||!(load.failureRate>=0&&load.failureRate<0.01))errors.push("load thresholds are not met");
  if(load.queuesClean!==true||load.noTranscriptPersistenceVerified!==true)errors.push("post-load cleanup/privacy evidence is missing");
  timestamp(errors,load.completedAt,"load test",now);

  const redditUrl=value.reddit?.postUrl,redditPath=https(redditUrl)?new URL(redditUrl).pathname:"";
  if(!https(redditUrl)||!/(^|\.)reddit\.com$/i.test(new URL(redditUrl||"https://invalid.invalid").hostname)||!/^\/r\/[^/]+\/comments\/[^/]+/i.test(redditPath)||placeholder(value.reddit?.monitoringOwner))errors.push("Reddit post URL or monitoring owner is missing");
  timestamp(errors,value.reddit?.postedAt,"Reddit launch",now);
  return{ok:errors.length===0,errors};
}
export async function validateLaunchEvidenceFiles(value={},options={}){
  const result=validateLaunchEvidence(value,options);
  const errors=[...result.errors];
  const baseDir=options.baseDir??process.cwd();
  const reports=[
    {label:"staging smoke report",path:value.staging?.smokeReportPath,hash:value.staging?.smokeReportSha256,kind:"staging-smoke"},
    {label:"load report",path:value.load?.reportPath,hash:value.load?.reportSha256,kind:"staging-realtime"},
  ];
  if(/^[0-9a-f]{40}$/i.test(value.revision||""))for(const report of reports){
    if(!reference(report.path)||!sha256(report.hash))continue;
    try{
      const actual=await fingerprintLaunchReport(resolve(baseDir,report.path),value.revision,report.kind,options.readFile);
      if(actual.toLowerCase()!==report.hash.toLowerCase())errors.push(`${report.label} fingerprint does not match its file`);
    }catch(error){
      errors.push(`${report.label} could not be verified: ${error.message}`);
    }
  }
  return{ok:errors.length===0,errors};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const file=process.argv[2],expectedRevision=process.argv[3]||process.env.RELEASE_REVISION;if(!file||!/^[0-9a-f]{40}$/i.test(expectedRevision||"")){console.error("Usage: node scripts/validate-launch-evidence.mjs <evidence.json> <expected-release-sha>");process.exitCode=1;}else{readFile(file,"utf8").then(JSON.parse).then(value=>validateLaunchEvidenceFiles(value,{expectedRevision,baseDir:dirname(resolve(file))})).then(result=>{if(!result.ok){console.error("Phase 24 evidence is incomplete:");for(const error of result.errors)console.error(`- ${error}`);process.exitCode=1;}else console.log("Phase 24 launch evidence and report files match the expected release commit.");}).catch(error=>{console.error(error.message);process.exitCode=1;});}}
