import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const project = "mybjgljylmcweeprhhlw";
const runtimePath = new URL("../work/sunoto-runtime-secrets.json", import.meta.url);
let input = "";
for await (const chunk of process.stdin) input += chunk;
const keys = JSON.parse(input);
const serviceKey = keys.find(key => key.name === "service_role")?.api_key;
const publicKey = keys.find(key => key.type === "publishable")?.api_key || keys.find(key => key.name === "anon")?.api_key;
if (!serviceKey || !publicKey) throw new Error("Existing project API keys are missing");
const claims = JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url").toString());
if (claims.ref !== project || claims.role !== "service_role") throw new Error("Server credential does not belong to the intended SunoTo project");
const url = `https://${project}.supabase.co`;
for (const table of ["app_config", "restrictions", "profiles"]) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Required database table ${table} is unavailable (${response.status})`);
  console.log(`Verified server access to ${table}`);
}
let previous = {};
try { previous = JSON.parse(await readFile(runtimePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const secrets = {
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: publicKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  ANON_SESSION_SECRET: previous.ANON_SESSION_SECRET || randomBytes(48).toString("base64url"),
  ...(previous.STATUSNERVE_HEARTBEAT_KEY || process.argv.includes("--heartbeat") ? {
    STATUSNERVE_HEARTBEAT_KEY: previous.STATUSNERVE_HEARTBEAT_KEY || randomBytes(48).toString("base64url")
  } : {})
};
await mkdir(new URL("../work/", import.meta.url), { recursive: true });
await writeFile(runtimePath, JSON.stringify(secrets), { mode: 0o600 });
console.log("Saved validated server configuration under the Git-ignored work directory; no secret values are printed.");
if (process.argv.includes("--publish")) {
  const cli = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  const result = spawnSync(process.execPath, [cli, "secret", "bulk", fileURLToPath(runtimePath), "--config", "worker/wrangler.toml", "--env", ""], {
    cwd: root, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: "d765117089c48868f64cd0d0c682732f" }, stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Worker secret provisioning failed (${result.status})`);
}
