import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { randomPhaseSeconds,movedDuringRedPhase,RLGG_GREEN_MIN_SECONDS,RLGG_GREEN_MAX_SECONDS } from "../worker/src/policies/redLightGreenLightEngine.js";

describe("red light green light phase timing", () => {
  it("stays within the requested min/max range", () => {
    for (let i = 0; i < 50; i++) {
      const value = randomPhaseSeconds(RLGG_GREEN_MIN_SECONDS, RLGG_GREEN_MAX_SECONDS, () => i / 50);
      assert.ok(value >= RLGG_GREEN_MIN_SECONDS && value <= RLGG_GREEN_MAX_SECONDS);
    }
  });
  it("is deterministic given a fixed random source", () => {
    assert.equal(randomPhaseSeconds(2, 4, () => 0), 2);
    assert.equal(randomPhaseSeconds(2, 4, () => 1), 4);
    assert.equal(randomPhaseSeconds(2, 4, () => 0.5), 3);
  });
});

describe("red light green light movement detection", () => {
  it("does not eliminate someone who hasn't moved", () => {
    assert.equal(movedDuringRedPhase({ x: 10, z: 10 }, { x: 10, z: 10 }), false);
  });
  it("tolerates tiny sampling noise", () => {
    assert.equal(movedDuringRedPhase({ x: 10, z: 10 }, { x: 10.1, z: 10.1 }), false);
  });
  it("catches real translation during the red phase", () => {
    assert.equal(movedDuringRedPhase({ x: 0, z: 0 }, { x: 3, z: 0 }), true);
  });
  it("ignores a player who never had a recorded starting position (just joined)", () => {
    assert.equal(movedDuringRedPhase(null, { x: 100, z: 100 }), false);
  });
  it("only counts ground-plane translation, not looking around", () => {
    // Same x/z, this function doesn't even receive yaw -- it's not part of the movement check.
    assert.equal(movedDuringRedPhase({ x: 5, z: 5 }, { x: 5, z: 5 }), false);
  });
});
