import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeVirtualConfig,DEFAULT_VIRTUAL_CONFIG } from "../worker/src/policies/virtualPolicy.js";
import { AnalyticsService } from "../worker/src/services/AnalyticsService.js";
import { ChatSession } from "../worker/src/durable/ChatSession.js";
import { clearConfigCache } from "../worker/src/services/ConfigService.js";

describe("virtual daily token budget config (T-101)", () => {
  it("defaults to a real, non-zero budget rather than unlimited", () => {
    assert.equal(DEFAULT_VIRTUAL_CONFIG.dailyTokenBudget, 200000);
    assert.equal(normalizeVirtualConfig({}).dailyTokenBudget, 200000);
  });
  it("accepts an admin-configured budget", () => {
    assert.equal(normalizeVirtualConfig({ dailyTokenBudget: 50000 }).dailyTokenBudget, 50000);
  });
  it("rejects a negative or absurd budget", () => {
    assert.throws(() => normalizeVirtualConfig({ dailyTokenBudget: -1 }), /invalid_virtual_daily_token_budget/);
    assert.throws(() => normalizeVirtualConfig({ dailyTokenBudget: 1.5 }), /invalid_virtual_daily_token_budget/);
    assert.throws(() => normalizeVirtualConfig({ dailyTokenBudget: 100000000000 }), /invalid_virtual_daily_token_budget/);
  });
});

describe("AnalyticsService.todayTotal", () => {
  it("reads back the persisted daily total for an event", async () => {
    const service = new AnalyticsService({ SUPABASE_URL: "https://project", SUPABASE_SERVICE_ROLE_KEY: "secret" }, async url => {
      assert.match(url, /analytics_daily\?event_name=eq\.virtual_tokens_used&dimension=eq\.total&event_day=eq\./);
      return Response.json([{ value_total: 12345 }]);
    });
    assert.equal(await service.todayTotal("virtual_tokens_used"), 12345);
  });
  it("returns 0 when nothing has been recorded yet today", async () => {
    const service = new AnalyticsService({ SUPABASE_URL: "https://project", SUPABASE_SERVICE_ROLE_KEY: "secret" }, async () => Response.json([]));
    assert.equal(await service.todayTotal("virtual_tokens_used"), 0);
  });
});

describe("ChatSession stops paying for Workers AI once the daily budget is hit", () => {
  function makeSession({ usedToday, budget, provider = "workers-ai" }) {
    const env = {
      SUPABASE_URL: "https://project",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
      FETCHER: async url => {
        if (url.includes("app_config")) return Response.json([{ value: { ...DEFAULT_VIRTUAL_CONFIG, enabled: true, provider, dailyTokenBudget: budget }, version: 1, updated_at: "now" }]);
        if (url.includes("analytics_daily")) return Response.json([{ value_total: usedToday }]);
        return Response.json([]);
      }
    };
    return new ChatSession({}, env);
  }
  it("blocks the AI call once usage today is at or above the budget", async () => {
    clearConfigCache();
    const session = makeSession({ usedToday: 5000, budget: 5000 });
    assert.equal(await session.virtualTokenBudgetExhausted(), true);
  });
  it("allows the AI call while under budget", async () => {
    clearConfigCache();
    const session = makeSession({ usedToday: 100, budget: 5000 });
    assert.equal(await session.virtualTokenBudgetExhausted(), false);
  });
  it("fails open (never blocks) if the config or analytics read errors out", async () => {
    clearConfigCache();
    const session = new ChatSession({}, { SUPABASE_URL: "https://project", SUPABASE_SERVICE_ROLE_KEY: "secret", FETCHER: async () => { throw new Error("network_down"); } });
    assert.equal(await session.virtualTokenBudgetExhausted(), false);
  });
});

describe("virtual token budget migration", () => {
  it("adds virtual_tokens_used to the analytics allowlist", async () => {
    const sql = await readFile(new URL("../supabase/migrations/202609140005_virtual_token_budget_analytics.sql", import.meta.url), "utf8");
    assert.match(sql, /'virtual_tokens_used'/);
  });
});
