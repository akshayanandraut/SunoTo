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
  {id:"game",name:"Draw & Guess"},
  {id:"snake_ladder",name:"Snake & Ladder"},
  {id:"rummy",name:"Rummy"},
  {id:"ludo",name:"Ludo"},
  {id:"teen_patti",name:"Teen Patti"},
  {id:"andar_bahar",name:"Andar Bahar"},
  {id:"dragon_tiger",name:"Dragon Tiger"},
  {id:"bidding",name:"Blind Auction"},
  {id:"tug_of_war",name:"Tug of War Trivia"},
  {id:"elimination_reflex",name:"Elimination Reflex"},
  {id:"prediction_pool",name:"Prediction Pool"},
  {id:"charades",name:"Charades (text)"},
  {id:"connect_four",name:"Connect Four"},
];
export const DRAW_GUESS_CHOOSE_SECONDS=15;
export const DRAW_GUESS_ROUND_SECONDS=75;
export const CHARADES_CHOOSE_SECONDS=15;
export const CHARADES_ROUND_SECONDS=75;
export const SNAKE_LADDER_TURN_SECONDS=30;
export const RUMMY_TURN_SECONDS=45;
export const LUDO_TURN_SECONDS=20;
export const TEEN_PATTI_TURN_SECONDS=25;
export const ANDAR_BAHAR_BETTING_SECONDS=20;
export const DRAGON_TIGER_BETTING_SECONDS=15;
export const BIDDING_ROUND_SECONDS=25;
export const TUG_OF_WAR_QUESTION_SECONDS=12;
export const TUG_OF_WAR_TARGET_SCORE=5;
export const ELIMINATION_REFLEX_MIN_PLAYERS=3;
export const ELIMINATION_REFLEX_MAX_PLAYERS=4;
export const ELIMINATION_REFLEX_ARM_MIN_MS=1500;
export const ELIMINATION_REFLEX_ARM_MAX_MS=5000;
export const ELIMINATION_REFLEX_TAP_WINDOW_SECONDS=5;
export const PREDICTION_POOL_ROUND_SECONDS=25;
export const PREDICTION_POOL_DEFAULT_RANGE_MAX=100;
export const CONNECT_FOUR_TURN_SECONDS=20;
export const CONNECT_FOUR_ROWS=6;
export const CONNECT_FOUR_COLS=7;
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
