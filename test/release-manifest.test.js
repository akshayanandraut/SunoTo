import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseManifest, writeReleaseManifest } from "../scripts/write-release-manifest.mjs";
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const revision = "A".repeat(40);

describe("frontend release manifest", () => {
  it("normalizes and records the immutable release revision", () => {
    assert.deepEqual(releaseManifest(revision, "2026-08-25T00:00:00.000Z"), {
      revision: revision.toLowerCase(),
      builtAt: "2026-08-25T00:00:00.000Z",
    });
  });

  it("writes the production artifact as JSON", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sunoto-release-"));
    const path = join(directory, "release.json");
    await writeReleaseManifest(path, revision, "2026-08-25T00:00:00.000Z");
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), releaseManifest(revision, "2026-08-25T00:00:00.000Z"));
  });

  it("is part of the production build", () => {
    assert.match(packageJson.scripts["production:build"], /write-release-manifest\.mjs/);
  });

  it("prevents stale manifests from being cached", async () => {
    const headers = await readFile(new URL("../web/public/_headers", import.meta.url), "utf8");
    assert.match(headers, /\/release\.json\s+Cache-Control: no-store/);
  });
});
