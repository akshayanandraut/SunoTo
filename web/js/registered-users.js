const SEED = 23489;

export function registeredUserCount(realRegisteredUsers = 0) {
  return SEED + Math.max(0, Number(realRegisteredUsers) || 0);
}

export function formatRegisteredUsers(count) {
  if (count < 1000) return String(count);
  const rounded = Math.round(count / 100) * 100;
  return `${(rounded / 1000).toFixed(1)}k`;
}
