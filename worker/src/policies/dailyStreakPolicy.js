export const DEFAULT_DAILY_STREAK_CONFIG = Object.freeze({
  enabled: true,
  baseCreditsPerDay: 500,
  maxStreakDays: 7,
});

export function normalizeDailyStreakConfig(value = {}) {
  const clampInt = (input, fallback, min, max) => {
    const n = Number.isFinite(Number(input)) ? Math.round(Number(input)) : fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    enabled: value.enabled === undefined ? DEFAULT_DAILY_STREAK_CONFIG.enabled : value.enabled === true,
    baseCreditsPerDay: clampInt(value.baseCreditsPerDay, DEFAULT_DAILY_STREAK_CONFIG.baseCreditsPerDay, 1, 100000),
    maxStreakDays: clampInt(value.maxStreakDays, DEFAULT_DAILY_STREAK_CONFIG.maxStreakDays, 1, 60),
  };
}
