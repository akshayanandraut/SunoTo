import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { requireReleaseRevision } from "./launch-report.mjs";

export function releaseManifest(revision, builtAt = new Date().toISOString()) {
  return {
    revision: requireReleaseRevision(revision),
    builtAt,
  };
}

export async function writeReleaseManifest(path, revision, builtAt) {
  const manifest = releaseManifest(revision, builtAt);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await writeReleaseManifest(new URL("../dist/release.json", import.meta.url), process.env.RELEASE_REVISION);
    console.log("Wrote revision-bound frontend manifest to dist/release.json.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
