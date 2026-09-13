export const DEFAULT_AD_CONFIG=Object.freeze({enabled:false,provider:"house",adFreeBalanceThreshold:1000,interstitialEveryScans:5,placements:{top:true,bottom:true,desktopSide:true,interstitial:true}});

export function normalizeAdConfig(value={}){
  const provider=String(value.provider||DEFAULT_AD_CONFIG.provider).trim().toLowerCase();
  if(!/^[a-z0-9_-]{2,32}$/.test(provider))throw new Error("invalid_ad_provider");
  const threshold=Number(value.adFreeBalanceThreshold??DEFAULT_AD_CONFIG.adFreeBalanceThreshold),frequency=Number(value.interstitialEveryScans??DEFAULT_AD_CONFIG.interstitialEveryScans);
  if(!Number.isSafeInteger(threshold)||threshold<1||threshold>1000000)throw new Error("invalid_ad_threshold");
  if(!Number.isSafeInteger(frequency)||frequency<1||frequency>100)throw new Error("invalid_interstitial_frequency");
  const placements={};for(const key of Object.keys(DEFAULT_AD_CONFIG.placements))placements[key]=value.placements?.[key]!==false;
  return{enabled:value.enabled===true,provider,adFreeBalanceThreshold:threshold,interstitialEveryScans:frequency,placements};
}

// Ad tiers are keyed on premium subscription status, not wallet balance:
// - Free (no account, or a registered account with no money ever put in): full-page ads, incl. periodic interstitials.
// - "Paid" (registered, holds some Credits -- has recharged/played) but not premium: side ads only (top/bottom/desktopSide), no interstitials.
// - Premium subscription: fully ad-free. This is the only path to zero ads.
export function adDecision({registered=false,isPremium=false,balance=0,scanCount=0,config=DEFAULT_AD_CONFIG}={}){
  const normalized=normalizeAdConfig(config),credits=Number.isSafeInteger(balance)?Math.max(0,balance):0;
  if(!normalized.enabled)return{tier:"disabled",provider:normalized.provider,placements:[]};
  if(isPremium)return{tier:"ad_free",provider:normalized.provider,placements:[]};
  const isPaidNonPremium=registered&&credits>=normalized.adFreeBalanceThreshold,placements=[...(normalized.placements.top?["top"]:[]),...(normalized.placements.bottom?["bottom"]:[]),...(normalized.placements.desktopSide?["desktopSide"]:[])];
  if(!isPaidNonPremium&&normalized.placements.interstitial&&scanCount>0&&scanCount%normalized.interstitialEveryScans===0)placements.push("interstitial");
  return{tier:isPaidNonPremium?"side_ads_only":"full_page_ads",provider:normalized.provider,placements,lowBalanceHint:isPaidNonPremium};
}
