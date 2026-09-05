export const DEFAULT_GUEST_WIN_CONFIG=Object.freeze({enabled:true,sparksReward:250,winProbabilityBps:9000,claimWindowSeconds:180,cooldownHours:20});
export function normalizeGuestWinConfig(value={}){
  const clampInt=(input,fallback,min,max)=>{const n=Number.isFinite(Number(input))?Math.round(Number(input)):fallback;return Math.min(max,Math.max(min,n));};
  return{
    enabled:value.enabled===undefined?DEFAULT_GUEST_WIN_CONFIG.enabled:value.enabled!==false,
    sparksReward:clampInt(value.sparksReward,DEFAULT_GUEST_WIN_CONFIG.sparksReward,1,100000),
    winProbabilityBps:clampInt(value.winProbabilityBps,DEFAULT_GUEST_WIN_CONFIG.winProbabilityBps,0,10000),
    claimWindowSeconds:clampInt(value.claimWindowSeconds,DEFAULT_GUEST_WIN_CONFIG.claimWindowSeconds,30,3600),
    cooldownHours:clampInt(value.cooldownHours,DEFAULT_GUEST_WIN_CONFIG.cooldownHours,1,720),
  };
}
