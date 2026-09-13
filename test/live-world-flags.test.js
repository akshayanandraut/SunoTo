import { describe,it } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { clearConfigCache } from "../worker/src/services/ConfigService.js";
import { DEFAULT_FLAGS } from "../worker/src/policies/flagPolicy.js";

function envWithFlags(overrides) {
  return {
    SUPABASE_URL: "https://project",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    FETCHER: async () => Response.json([{ value: { ...DEFAULT_FLAGS, ...overrides }, version: 1, updated_at: "now" }])
  };
}

const LIVE_WORLD_ROUTES = [
  { method: "POST", path: "/api/v1/live-world/opt-in" },
  { method: "POST", path: "/api/v1/live-world/opt-out" },
  { method: "POST", path: "/api/v1/live-world/place" },
  { method: "GET", path: "/api/v1/live-world/nearby" },
  { method: "POST", path: "/api/v1/live-world/chat-requests" },
  { method: "GET", path: "/api/v1/live-world/chat-requests" },
  { method: "POST", path: "/api/v1/live-world/chat-requests/11111111-1111-1111-1111-111111111111/respond" },
  { method: "POST", path: "/api/v1/live-world/claim-session" }
];

describe("live_world_enabled gates every Live World route before auth is even checked", () => {
  for (const { method, path } of LIVE_WORLD_ROUTES) {
    it(`${method} ${path} returns feature_disabled:live_world_enabled when the flag is off`, async () => {
      clearConfigCache();
      const response = await worker.fetch(new Request(`https://api.example.test${path}`, { method, headers: { authorization: "Bearer garbage", "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined }), envWithFlags({ live_world_enabled: false }));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "feature_disabled:live_world_enabled" });
    });
  }

  it("falls through to the normal auth check once the flag is on", async () => {
    clearConfigCache();
    const response = await worker.fetch(new Request("https://api.example.test/api/v1/live-world/opt-in", { method: "POST", headers: { authorization: "Bearer garbage", "content-type": "application/json" }, body: "{}" }), envWithFlags({ live_world_enabled: true }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "invalid_account_session" });
  });
});
