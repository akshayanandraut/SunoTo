export const FLAG_KEYS=["preference_matching_enabled","geo_matching_enabled","contact_unlock_enabled","favourite_reconnect_enabled","paid_continuation_enabled","signup_enabled","payments_enabled","new_matches_enabled"];
export const DEFAULT_FLAGS=Object.freeze(Object.fromEntries(FLAG_KEYS.map(key=>[key,true])));
export function normalizeFlags(value={}){
  const normalized={};
  for(const key of FLAG_KEYS)normalized[key]=value[key]!==false;
  return normalized;
}
