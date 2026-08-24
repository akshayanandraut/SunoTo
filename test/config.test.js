import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { APP_CONFIG } from "../web/js/config.js";
describe("locked Phase 1 configuration",()=>{it("keeps adults-only access",()=>assert.equal(APP_CONFIG.minAge,18));it("keeps five trial connections",()=>assert.equal(APP_CONFIG.freeTrialSuccessfulConnections,5));it("keeps two-minute chats",()=>assert.equal(APP_CONFIG.randomChatFreeSeconds,120));it("limits profile choices",()=>{assert.equal(APP_CONFIG.maxLanguages,3);assert.equal(APP_CONFIG.maxInterests,5)})});
