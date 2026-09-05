export const DEFAULT_AD_EARNING_CONFIG = Object.freeze({
  enabled: false,
  creditsPerView: 500,
  dailyCapCredits: 2000,
  cooldownSeconds: 60,
  dwellSeconds: 15,
});

export function normalizeAdEarningConfig(value = {}) {
  const clampInt = (input, fallback, min, max) => {
    const n = Number.isFinite(Number(input)) ? Math.round(Number(input)) : fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    enabled: value.enabled === undefined ? DEFAULT_AD_EARNING_CONFIG.enabled : value.enabled === true,
    creditsPerView: clampInt(value.creditsPerView, DEFAULT_AD_EARNING_CONFIG.creditsPerView, 1, 100000),
    dailyCapCredits: clampInt(value.dailyCapCredits, DEFAULT_AD_EARNING_CONFIG.dailyCapCredits, 1, 1000000),
    cooldownSeconds: clampInt(value.cooldownSeconds, DEFAULT_AD_EARNING_CONFIG.cooldownSeconds, 5, 86400),
    dwellSeconds: clampInt(value.dwellSeconds, DEFAULT_AD_EARNING_CONFIG.dwellSeconds, 3, 120),
  };
}
