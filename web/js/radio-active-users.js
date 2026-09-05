const BASE = 18000;
const MIN = 12000;
const MAX = 26000;
const MAX_STEP = 700;

const current = new Map();

export function nextRadioListenerCount(channelId, random = Math.random) {
  const prev = current.has(channelId) ? current.get(channelId) : BASE + Math.round((random() * 2 - 1) * 4000);
  const pull = (BASE - prev) * 0.02;
  const step = pull + (random() * 2 - 1) * MAX_STEP;
  const next = Math.min(MAX, Math.max(MIN, Math.round(prev + step)));
  current.set(channelId, next);
  return next;
}

export function randomRadioListenerCount(random = Math.random) {
  return BASE + Math.round((random() * 2 - 1) * 4000);
}
