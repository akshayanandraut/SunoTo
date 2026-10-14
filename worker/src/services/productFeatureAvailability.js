import { getGrasanyIdentityReadiness } from "../auth/grasanyOidc.js";
import { getCentralPaymentReadiness } from "./centralPaymentContract.js";

const ACCOUNT_FEATURES = ["signup_enabled", "preference_matching_enabled", "geo_matching_enabled", "contact_unlock_enabled", "favourite_reconnect_enabled", "paid_continuation_enabled", "games_enabled", "game_staking_enabled", "experience_match_enabled", "arena_enabled", "live_world_enabled", "forums_enabled"];
export function availableProductFlags(env, flags) {
  const identity = getGrasanyIdentityReadiness(env);
  const result = { ...flags, payments_enabled: getCentralPaymentReadiness().enabled && flags.payments_enabled === true };
  if (!identity.enabled || !identity.productAccountApiEnabled) {
    for (const key of ACCOUNT_FEATURES) result[key] = false;
  }
  return result;
}
