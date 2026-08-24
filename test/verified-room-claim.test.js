import { it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

it("attaches persistent account identity to room claims only after verification",async()=>{
  const source=await readFile(new URL("../worker/src/index.js",import.meta.url),"utf8");
  assert.match(source,/if\(user\.emailVerified\)\{body\.accountUserId=user\.id/);
  assert.doesNotMatch(source,/if\(user\)\{body\.accountUserId=user\.id/);
});
