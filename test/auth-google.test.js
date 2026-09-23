import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { oauthRedirectUrl } from "../web/js/oauth.js";

describe("Google OAuth boundary", () => {
  it("builds the account callback without retaining a caller-controlled path", () => {
    assert.equal(oauthRedirectUrl("https://suno.example/"), "https://suno.example/#/account");
    assert.equal(oauthRedirectUrl("https://suno.example"), "https://suno.example/#/account");
  });

  it("does not accept a path or query from the configured origin", () => {
    assert.equal(oauthRedirectUrl("https://suno.example/evil?next=https://attacker.example"), "https://suno.example/#/account");
  });
});
