const BASE = 182938;
const SPREAD = 100000;
const MAX_STEP = 1500;

let current = null;

export function randomActiveCount(random = Math.random) {
  if (current === null) current = BASE;
  const drift = (random() * 2 - 1) * MAX_STEP;
  current = Math.min(BASE + SPREAD, Math.max(BASE - SPREAD, current + drift));
  return Math.round(current);
}
