export const RLGG_MIN_PLAYERS = 2;
export const RLGG_ROUND_INTERVAL_SECONDS = 300;
export const RLGG_ROUND_DURATION_SECONDS = 90;
export const RLGG_GREEN_MIN_SECONDS = 3;
export const RLGG_GREEN_MAX_SECONDS = 7;
export const RLGG_RED_MIN_SECONDS = 2;
export const RLGG_RED_MAX_SECONDS = 4;
export const RLGG_MOVE_TOLERANCE = 0.5;

export function randomPhaseSeconds(min, max, random = Math.random) {
  return min + random() * (max - min);
}

// Only ground-plane translation counts -- looking around (yaw) during a red phase is allowed,
// matching the actual game. A small tolerance absorbs sampling noise between the 10Hz ticks.
export function movedDuringRedPhase(startPosition, currentPosition, tolerance = RLGG_MOVE_TOLERANCE) {
  if (!startPosition) return false;
  const dx = currentPosition.x - startPosition.x, dz = currentPosition.z - startPosition.z;
  return Math.hypot(dx, dz) > tolerance;
}
