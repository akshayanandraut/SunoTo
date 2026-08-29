export const ROOM_TYPES=[
  {id:"audio",name:"Audio only"},
  {id:"audio_video",name:"Audio + video"},
  {id:"music",name:"Music room"},
  {id:"radio",name:"Radio (public)"},
];

export const ROOM_PRICE_TIERS=[
  {id:"standard",name:"Standard",creditsPerMonth:10000,discountedMultiMonthMultiplier:0.85},
  {id:"basic",name:"Basic",creditsPerMonth:5000,discountedMultiMonthMultiplier:0.85},
];

export const DEFAULT_ROOM_PRICE_TIER_ID="standard";
export const HOST_INACTIVITY_TIMEOUT_SECONDS=600;
export const ROOM_OWNERSHIP_MONTH_SECONDS=30*24*60*60;
export const MAX_ROOM_MEMBERS=10;

export const ROOM_MODES=[
  {id:"chat",name:"Group chat"},
  {id:"music",name:"Music"},
  {id:"musical_chairs",name:"Musical chairs"},
  {id:"game",name:"Game"},
];
export const DEFAULT_ROOM_MODE_ID="chat";

export function roomTypeById(id){return ROOM_TYPES.find(type=>type.id===id)||null;}
export function validRoomTypeId(id){return ROOM_TYPES.some(type=>type.id===id);}
export function priceTierById(id){return ROOM_PRICE_TIERS.find(tier=>tier.id===id)||ROOM_PRICE_TIERS.find(tier=>tier.id===DEFAULT_ROOM_PRICE_TIER_ID);}
export function validPriceTierId(id){return ROOM_PRICE_TIERS.some(tier=>tier.id===id);}
export function validRoomModeId(id){return ROOM_MODES.some(mode=>mode.id===id);}

export function roomActivationCost(tierId,months=1){
  const tier=priceTierById(tierId);
  const wholeMonths=Math.max(1,Math.trunc(months));
  if(wholeMonths===1)return tier.creditsPerMonth;
  return Math.round(tier.creditsPerMonth*wholeMonths*tier.discountedMultiMonthMultiplier);
}
