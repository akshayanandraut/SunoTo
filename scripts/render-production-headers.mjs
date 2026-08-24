import { readFile,writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const websocketOrigin=value=>{const url=new URL(value);url.protocol="wss:";return url.origin;};
export function renderProductionHeaders(template,{apiBaseUrl,supabaseUrl}){
  const origins=["'self'",new URL(apiBaseUrl).origin,websocketOrigin(apiBaseUrl),new URL(supabaseUrl).origin,websocketOrigin(supabaseUrl),"https://api.razorpay.com"];
  if(origins.slice(1,-1).some(origin=>!origin.startsWith("https://")&&!origin.startsWith("wss://")))throw new Error("Production connect origins must use HTTPS/WSS");
  const rendered=template.replace(/(Content-Security-Policy:.*?connect-src )([^;]+)/,(_match,prefix)=>`${prefix}${[...new Set(origins)].join(" ")}`);
  if(rendered===template)throw new Error("Content-Security-Policy connect-src was not found");
  return rendered;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const apiBaseUrl=process.env.VITE_API_BASE_URL,supabaseUrl=process.env.VITE_SUPABASE_URL;
  if(!apiBaseUrl||!supabaseUrl)throw new Error("VITE_API_BASE_URL and VITE_SUPABASE_URL are required");
  const template=await readFile(new URL("../web/public/_headers",import.meta.url),"utf8");
  await writeFile(new URL("../dist/_headers",import.meta.url),renderProductionHeaders(template,{apiBaseUrl,supabaseUrl}));
  console.log("Rendered exact production connect origins into dist/_headers.");
}
