import http from "k6/http";
import { check,sleep } from "k6";
import { Rate } from "k6/metrics";

const failures=new Rate("request_failures"),base=__ENV.STAGING_API_URL,revision=__ENV.RELEASE_REVISION,reportPath=__ENV.SPIKE_REPORT_PATH;
if(!base||new URL(base).protocol!=="https:")throw new Error("STAGING_API_URL must use HTTPS");
if(!/^[0-9a-f]{40}$/i.test(revision||""))throw new Error("RELEASE_REVISION must be a full 40-character commit SHA");
if(!reportPath)throw new Error("SPIKE_REPORT_PATH is required");
const apiUrl=base.replace(/\/$/,"");
export const options={stages:[{duration:"30s",target:10},{duration:"30s",target:50},{duration:"20s",target:100},{duration:"30s",target:10},{duration:"20s",target:0}],thresholds:{http_req_duration:["p(95)<500","p(99)<1000"],request_failures:["rate<0.01"]}};
const metric=(data,name,key)=>Number(data.metrics?.[name]?.values?.[key]??0);
const thresholdsPassed=data=>Object.values(data.metrics||{}).every(item=>!item.thresholds||Object.values(item.thresholds).every(threshold=>threshold.ok===true));

export function spikeReportFromSummary(data,completedAt=new Date().toISOString()){
  return{
    kind:"staging-spike",
    revision:revision.toLowerCase(),
    completedAt,
    apiUrl,
    peakVirtualUsers:metric(data,"vus_max","max"),
    p95Milliseconds:metric(data,"http_req_duration","p(95)"),
    p99Milliseconds:metric(data,"http_req_duration","p(99)"),
    failureRate:metric(data,"request_failures","rate"),
    httpRequests:metric(data,"http_reqs","count"),
    durationMilliseconds:Number(data.state?.testRunDurationMs??0),
    thresholdsPassed:thresholdsPassed(data),
  };
}

export function handleSummary(data){const report=spikeReportFromSummary(data);return{[reportPath]:`${JSON.stringify(report,null,2)}\n`,stdout:`Spike report written to ${reportPath}\n`};}

export default function(){const responses=http.batch([["GET",`${apiUrl}/health`],["GET",`${apiUrl}/config/public`],["GET",`${apiUrl}/stats/public`],["GET",`${apiUrl}/compliance/public`]]);for(const response of responses){const ok=check(response,{"public endpoint is healthy":item=>item.status===200});failures.add(!ok);}sleep(Math.random()*0.8+0.2);}
