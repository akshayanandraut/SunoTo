import { pathToFileURL } from "node:url";
import { fingerprintLaunchReport } from "./launch-report.mjs";

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [file,revision,kind]=process.argv.slice(2);
  if(!file||!revision||!kind){
    console.error("Usage: node scripts/fingerprint-launch-report.mjs <report.json> <release-sha> <report-kind>");
    process.exitCode=1;
  }else try{
    console.log(await fingerprintLaunchReport(file,revision,kind));
  }catch(error){
    console.error(error.message);
    process.exitCode=1;
  }
}
