export function isEligibleRandomPair(seeker,candidate,active={}){
  if(!seeker||!candidate||seeker.identityId===candidate.identityId)return false;
  if(active[seeker.identityId]||active[candidate.identityId])return false;
  if(seeker.blockedPeerIds?.includes(candidate.identityId)||candidate.blockedPeerIds?.includes(seeker.identityId))return false;
  if(seeker.blockedRefs?.some(ref=>ref===candidate.identityId||ref===candidate.accountUserId||ref===candidate.accountPublicId)||candidate.blockedRefs?.some(ref=>ref===seeker.identityId||ref===seeker.accountUserId||ref===seeker.accountPublicId))return false;
  if(candidate.banned||candidate.restricted||candidate.idle||candidate.available===false)return false;
  return true;
}
export function selectRandomCandidate(seeker,queue,active={}){
  return queue.filter(candidate=>isEligibleRandomPair(seeker,candidate,active)).sort((a,b)=>a.queuedAt-b.queuedAt)[0]||null;
}
