import http from "k6/http";
import { check,sleep } from "k6";
import { Rate } from "k6/metrics";

const failures=new Rate("request_failures"),base=__ENV.STAGING_API_URL;
if(!base)throw new Error("STAGING_API_URL is required");
export const options={stages:[{duration:"30s",target:10},{duration:"30s",target:50},{duration:"20s",target:100},{duration:"30s",target:10},{duration:"20s",target:0}],thresholds:{http_req_duration:["p(95)<500","p(99)<1000"],request_failures:["rate<0.01"]}};

export default function(){const responses=http.batch([["GET",`${base}/health`],["GET",`${base}/config/public`],["GET",`${base}/stats/public`],["GET",`${base}/compliance/public`]]);for(const response of responses){const ok=check(response,{"public endpoint is healthy":item=>item.status===200});failures.add(!ok);}sleep(Math.random()*0.8+0.2);}
