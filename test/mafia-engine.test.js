import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { assignMafiaRoles,resolveMafiaNight,resolveMafiaDayVote,checkMafiaWinner,MAFIA_ROLES } from "../worker/src/policies/mafiaEngine.js";

describe("mafia role assignment", () => {
  it("assigns exactly one mafia per four players, minimum one", () => {
    for (const n of [5, 6, 7, 8, 9, 12]) {
      const roles = assignMafiaRoles(Array.from({ length: n }, (_, i) => `p${i}`));
      const mafiaCount = Object.values(roles).filter(role => role === MAFIA_ROLES.MAFIA).length;
      assert.equal(mafiaCount, Math.max(1, Math.floor(n / 4)));
      assert.equal(Object.keys(roles).length, n);
    }
  });
  it("only adds a Detective at 6+ players and a Doctor at 8+", () => {
    const five = Object.values(assignMafiaRoles(["a", "b", "c", "d", "e"]));
    assert.ok(!five.includes(MAFIA_ROLES.DETECTIVE));
    const six = Object.values(assignMafiaRoles(["a", "b", "c", "d", "e", "f"]));
    assert.ok(six.includes(MAFIA_ROLES.DETECTIVE));
    assert.ok(!six.includes(MAFIA_ROLES.DOCTOR));
    const eight = Object.values(assignMafiaRoles(["a", "b", "c", "d", "e", "f", "g", "h"]));
    assert.ok(eight.includes(MAFIA_ROLES.DETECTIVE));
    assert.ok(eight.includes(MAFIA_ROLES.DOCTOR));
  });
  it("fills every remaining seat with Villager", () => {
    const roles = assignMafiaRoles(["a", "b", "c", "d", "e", "f", "g", "h"]);
    const villagers = Object.values(roles).filter(role => role === MAFIA_ROLES.VILLAGER).length;
    assert.equal(villagers, 8 - 2 - 1 - 1);
  });
});

describe("mafia night resolution", () => {
  const roles = { m1: "mafia", m2: "mafia", v1: "villager", v2: "villager", d1: "doctor" };
  const alive = Object.keys(roles);
  it("kills the plurality target the mafia agree on", () => {
    const { killedId } = resolveMafiaNight({ roles, alive, mafiaTargets: { m1: "v1", m2: "v1" } });
    assert.equal(killedId, "v1");
  });
  it("kills no one when the mafia split their votes evenly", () => {
    const { killedId } = resolveMafiaNight({ roles, alive, mafiaTargets: { m1: "v1", m2: "v2" } });
    assert.equal(killedId, null);
  });
  it("the doctor saves the target the mafia agreed on", () => {
    const { killedId } = resolveMafiaNight({ roles, alive, mafiaTargets: { m1: "v1", m2: "v1" }, doctorProtect: "v1" });
    assert.equal(killedId, null);
  });
  it("mafia cannot target another mafia member", () => {
    const { killedId } = resolveMafiaNight({ roles, alive, mafiaTargets: { m1: "m2", m2: "m2" } });
    assert.equal(killedId, null);
  });
  it("a target who already died overnight (no longer alive) cannot be killed again", () => {
    const { killedId } = resolveMafiaNight({ roles, alive: alive.filter(id => id !== "v1"), mafiaTargets: { m1: "v1", m2: "v1" } });
    assert.equal(killedId, null);
  });
});

describe("mafia day vote resolution", () => {
  it("eliminates the plurality vote target", () => {
    const { eliminatedId } = resolveMafiaDayVote({ alive: ["a", "b", "c"], votes: { a: "c", b: "c", c: "a" } });
    assert.equal(eliminatedId, "c");
  });
  it("eliminates no one on a tie", () => {
    const { eliminatedId } = resolveMafiaDayVote({ alive: ["a", "b", "c", "d"], votes: { a: "c", b: "c", c: "a", d: "a" } });
    assert.equal(eliminatedId, null);
  });
  it("eliminates no one when everyone abstains", () => {
    const { eliminatedId } = resolveMafiaDayVote({ alive: ["a", "b"], votes: { a: "abstain", b: "abstain" } });
    assert.equal(eliminatedId, null);
  });
  it("ignores a self-vote", () => {
    const { eliminatedId } = resolveMafiaDayVote({ alive: ["a", "b"], votes: { a: "a", b: "a" } });
    assert.equal(eliminatedId, "a");
  });
});

describe("mafia win conditions", () => {
  it("villagers win once every mafia is dead", () => {
    assert.equal(checkMafiaWinner({ roles: { m1: "mafia", v1: "villager" }, alive: ["v1"] }), "villagers");
  });
  it("mafia win once they're no longer outnumbered", () => {
    assert.equal(checkMafiaWinner({ roles: { m1: "mafia", v1: "villager" }, alive: ["m1", "v1"] }), "mafia");
  });
  it("the game continues while villagers still outnumber the mafia", () => {
    assert.equal(checkMafiaWinner({ roles: { m1: "mafia", v1: "villager", v2: "villager" }, alive: ["m1", "v1", "v2"] }), null);
  });
});
