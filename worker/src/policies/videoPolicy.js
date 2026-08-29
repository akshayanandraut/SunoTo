export const DEFAULT_VIDEO_CONFIG=Object.freeze({enabled:false,betaUserIds:[]});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalizeVideoConfig(value={}){
  const betaUserIds=(Array.isArray(value.betaUserIds)?value.betaUserIds:[]).map(String).filter(id=>UUID.test(id)).slice(0,1000);
  return{enabled:value.enabled===true,betaUserIds:[...new Set(betaUserIds)]};
}
export const VIDEO_FREE_SESSION_LIMIT=5;
export function videoEligible(config,leftAccountUserId,rightAccountUserId,leftVirtual,rightVirtual){
  return Boolean(config.enabled&&!leftVirtual&&!rightVirtual&&leftAccountUserId&&rightAccountUserId);
}
export function hasUnlimitedVideoSessions(config,accountUserId){return config.betaUserIds.includes(accountUserId);}
