const BASE = 15000;
const SPREAD = 8000;

export function randomRadioListenerCount(random = Math.random) {
  return BASE + Math.round((random() * 2 - 1) * SPREAD);
}
