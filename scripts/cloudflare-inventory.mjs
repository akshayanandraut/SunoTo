import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Read Wrangler's saved credential locally; never include it in output or arguments.
const config = await readFile(join(process.env.APPDATA, "xdg.config", ".wrangler", "config", "default.toml"), "utf8");
const token = config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!token) throw new Error("Wrangler OAuth login is required");
const account = "d765117089c48868f64cd0d0c682732f";
async function get(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000)
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare inventory failed (${response.status}): ${JSON.stringify(data.errors)}`);
  return data.result;
}
const zones = await get(`/zones?name=grasany.com&account.id=${account}`);
console.log(JSON.stringify({ account, zones: zones.map(({ id, name, status }) => ({ id, name, status })) }));
for (const zone of zones) {
  for (const name of ["sunoto.grasany.com", "radio.grasany.com"]) {
    try {
      const records = await get(`/zones/${zone.id}/dns_records?name=${name}`);
      console.log(JSON.stringify({ name, records: records.map(({ id, type, content, proxied }) => ({ id, type, content, proxied })) }));
    } catch (error) {
      console.log(JSON.stringify({ name, inventoryUnavailable: error.message }));
    }
  }
}
const domains = await get(`/accounts/${account}/workers/domains`);
console.log(JSON.stringify({ domains: domains.filter(({ hostname }) => /^(sunoto|radio)\./.test(hostname)) }));
