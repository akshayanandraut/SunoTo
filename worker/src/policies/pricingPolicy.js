// Unified pricing config: every price that previously had no admin control at all (was hardcoded
// in JS constants and/or duplicated inside SQL functions). Deliberately loose validation compared
// to the other config normalizers -- this is a single admin-only aggregation surface, not a
// public-facing schema, so we mainly guard against non-numeric garbage rather than modeling every
// field's exact business constraints.
const POSITIVE_INT = value => Number.isSafeInteger(value) && value > 0;
export function normalizePricingConfig(value = {}) {
  const rooms = value.roomPriceTiersCreditsPerMonth || {};
  const standard = Number(rooms.standard), basic = Number(rooms.basic);
  if (!POSITIVE_INT(standard) || !POSITIVE_INT(basic)) throw new Error("invalid_room_price_tiers");
  const discount = Number(value.roomMultiMonthDiscountMultiplier);
  if (!Number.isFinite(discount) || discount <= 0 || discount > 1) throw new Error("invalid_room_discount_multiplier");
  const verificationFeeCredits = Number(value.verificationFeeCredits);
  if (!POSITIVE_INT(verificationFeeCredits)) throw new Error("invalid_verification_fee");
  const favouriteReconnectCredits = Number(value.favouriteReconnectCredits);
  if (!POSITIVE_INT(favouriteReconnectCredits)) throw new Error("invalid_favourite_reconnect_fee");
  const paidMessageCredits = Number(value.paidMessageCredits), paidPhotoCredits = Number(value.paidPhotoCredits);
  if (!POSITIVE_INT(paidMessageCredits) || !POSITIVE_INT(paidPhotoCredits)) throw new Error("invalid_paid_chat_pricing");
  const contactUnlockCredits = Number(value.contactUnlockCredits), contactUnlockSeconds = Number(value.contactUnlockSeconds);
  if (!POSITIVE_INT(contactUnlockCredits) || !POSITIVE_INT(contactUnlockSeconds)) throw new Error("invalid_contact_unlock_pricing");
  const fees = value.preferenceFees || {};
  const preferenceFees = {
    genderCredits: Number(fees.genderCredits), genderAgeCredits: Number(fees.genderAgeCredits),
    genderAgeRadiusCredits: Number(fees.genderAgeRadiusCredits), languageAddonCredits: Number(fees.languageAddonCredits),
    interestAddonCredits: Number(fees.interestAddonCredits),
  };
  for (const key of Object.keys(preferenceFees)) if (!POSITIVE_INT(preferenceFees[key])) throw new Error("invalid_preference_fees");
  return {
    roomPriceTiersCreditsPerMonth: { standard, basic },
    roomMultiMonthDiscountMultiplier: discount,
    verificationFeeCredits, favouriteReconnectCredits, paidMessageCredits, paidPhotoCredits,
    contactUnlockCredits, contactUnlockSeconds, preferenceFees,
  };
}
