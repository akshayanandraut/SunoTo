export const MAFIA_MIN_PLAYERS = 5;
export const MAFIA_MAX_PLAYERS = 10; // matches MAX_ROOM_MEMBERS -- a party room can never seat more than 10
export const MAFIA_ROLES = Object.freeze({ MAFIA: "mafia", DETECTIVE: "detective", DOCTOR: "doctor", VILLAGER: "villager" });

function shuffled(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// One mafia per four players (minimum one), a Detective from six players, a Doctor from eight.
// Everyone left over is a Villager.
export function assignMafiaRoles(playerIds) {
  const order = shuffled(playerIds);
  const n = order.length;
  const mafiaCount = Math.max(1, Math.floor(n / 4));
  const roles = {};
  let i = 0;
  for (; i < mafiaCount; i++) roles[order[i]] = MAFIA_ROLES.MAFIA;
  if (n >= 6) { roles[order[i]] = MAFIA_ROLES.DETECTIVE; i++; }
  if (n >= 8) { roles[order[i]] = MAFIA_ROLES.DOCTOR; i++; }
  for (; i < n; i++) roles[order[i]] = MAFIA_ROLES.VILLAGER;
  return roles;
}

// Strict plurality only -- a tie (including "no votes at all") resolves to no winner,
// matching the traditional house rule that an undecided mafia/table doesn't act.
function pluralityWinner(tally) {
  const entries = Object.entries(tally);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return null;
  return entries[0][0];
}

export function resolveMafiaNight({ roles, alive, mafiaTargets = {}, doctorProtect = null }) {
  const aliveMafia = alive.filter(id => roles[id] === MAFIA_ROLES.MAFIA);
  const tally = {};
  for (const mafiaId of aliveMafia) {
    const targetId = mafiaTargets[mafiaId];
    if (targetId && alive.includes(targetId) && roles[targetId] !== MAFIA_ROLES.MAFIA) tally[targetId] = (tally[targetId] || 0) + 1;
  }
  const target = pluralityWinner(tally);
  const protectedId = doctorProtect && alive.includes(doctorProtect) ? doctorProtect : null;
  return { killedId: target && target !== protectedId ? target : null };
}

export function resolveMafiaDayVote({ alive, votes = {} }) {
  const tally = {};
  for (const voterId of alive) {
    const targetId = votes[voterId];
    if (targetId && targetId !== "abstain" && alive.includes(targetId) && targetId !== voterId) tally[targetId] = (tally[targetId] || 0) + 1;
  }
  return { eliminatedId: pluralityWinner(tally) };
}

// Villagers win once every mafia is gone; mafia win once they're no longer outnumbered.
export function checkMafiaWinner({ roles, alive }) {
  const aliveMafia = alive.filter(id => roles[id] === MAFIA_ROLES.MAFIA).length;
  if (aliveMafia === 0) return "villagers";
  if (aliveMafia >= alive.length - aliveMafia) return "mafia";
  return null;
}
