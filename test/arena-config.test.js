import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeArenaConfig,DEFAULT_ARENA_CONFIG,validArenaAvatarState } from "../worker/src/policies/arenaPolicy.js";
import { ConfigService,clearConfigCache } from "../worker/src/services/ConfigService.js";

describe("arena config normalization", () => {
  it("defaults to 24 max players", () => {
    assert.deepEqual(normalizeArenaConfig({}), DEFAULT_ARENA_CONFIG);
    assert.equal(DEFAULT_ARENA_CONFIG.maxPlayers, 24);
  });
  it("rejects a cap above 24 -- 100-player Arena is a separate design project (T-098), not a config value", () => {
    assert.throws(() => normalizeArenaConfig({ maxPlayers: 100 }), /invalid_arena_max_players/);
  });
  it("rejects non-integer or too-small values", () => {
    assert.throws(() => normalizeArenaConfig({ maxPlayers: 1 }), /invalid_arena_max_players/);
    assert.throws(() => normalizeArenaConfig({ maxPlayers: 10.5 }), /invalid_arena_max_players/);
  });
  it("accepts any integer from 2 to 24", () => {
    assert.deepEqual(normalizeArenaConfig({ maxPlayers: 2 }), { maxPlayers: 2 });
    assert.deepEqual(normalizeArenaConfig({ maxPlayers: 24 }), { maxPlayers: 24 });
  });
});

describe("shared arena avatar-state validation", () => {
  it("accepts a valid state and whitelists the action", () => {
    assert.deepEqual(validArenaAvatarState({ x: 1, y: 0, z: -1, yaw: 1.5, action: "sprint" }), { x: 1, y: 0, z: -1, yaw: 1.5, action: "sprint" });
  });
  it("falls back to idle for an unrecognized action", () => {
    assert.equal(validArenaAvatarState({ x: 0, y: 0, z: 0, yaw: 0, action: "fly_hack" }).action, "idle");
  });
  it("rejects out-of-bounds coordinates", () => {
    assert.equal(validArenaAvatarState({ x: 261, y: 0, z: 0, yaw: 0 }), null);
    assert.equal(validArenaAvatarState({ x: 0, y: 51, z: 0, yaw: 0 }), null);
    assert.equal(validArenaAvatarState({ x: 0, y: -2, z: 0, yaw: 0 }), null);
  });
  it("rejects non-finite input", () => {
    assert.equal(validArenaAvatarState({ x: "not-a-number", y: 0, z: 0, yaw: 0 }), null);
    assert.equal(validArenaAvatarState({}), null);
  });
});

describe("versioned arena configuration", () => {
  it("caches public reads and uses the audited RPC for updates", async () => {
    clearConfigCache();
    let reads = 0, updateBody;
    const fetcher = async (url, options = {}) => {
      if (url.includes("update_arena_config")) { updateBody = JSON.parse(options.body); return Response.json([{ value: { maxPlayers: 12 }, version: 2, updated_at: "now" }]); }
      reads += 1;
      return Response.json([{ value: { maxPlayers: 24 }, version: 1, updated_at: "before" }]);
    };
    const service = new ConfigService({ SUPABASE_URL: "https://project", SUPABASE_SERVICE_ROLE_KEY: "secret" }, fetcher);
    const first = await service.arena(100);
    assert.equal(first.config.maxPlayers, 24);
    assert.equal((await service.arena(101)).version, 1);
    assert.equal(reads, 1);
    const updated = await service.updateArena({ adminId: "admin-id", expectedVersion: 1, config: { maxPlayers: 12 } });
    assert.equal(updated.config.maxPlayers, 12);
    assert.equal(updateBody.admin_id, "admin-id");
    assert.equal(updateBody.expected_version, 1);
  });
  it("locks config versions and audits updates in the database", async () => {
    const sql = await readFile(new URL("../supabase/migrations/202609140003_arena_config.sql", import.meta.url), "utf8");
    assert.match(sql, /for update/i);
    assert.match(sql, /config_version_conflict/i);
    assert.match(sql, /insert into public\.admin_audit/i);
    assert.match(sql, /current_row\.version\+1/);
  });
});
