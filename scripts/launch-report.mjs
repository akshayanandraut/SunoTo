import { writeFile } from "node:fs/promises";

export function requireReleaseRevision(value){if(!/^[0-9a-f]{40}$/i.test(value||""))throw new Error("RELEASE_REVISION must be a full 40-character commit SHA");return value.toLowerCase();}
export async function writeLaunchReport(path,report){if(!path)throw new Error("report path is required");await writeFile(path,`${JSON.stringify(report,null,2)}\n`,{encoding:"utf8",flag:"wx"});return path;}
