export const ARENA_HALF_EXTENT=260;
export const ARENA_ACTIONS=["idle","walk","sprint","crouch","prone"];

// Shared by PartyRoomShard's in-room arena mode and ArenaLobbyShard's strangers lobby, so the
// same bounds/whitelist validation applies everywhere the client-authoritative avatar relay is used.
export function validArenaAvatarState(payload={}){
  const x=Number(payload.x),y=Number(payload.y),z=Number(payload.z),yaw=Number(payload.yaw);
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)||!Number.isFinite(yaw))return null;
  if(Math.abs(x)>ARENA_HALF_EXTENT||Math.abs(z)>ARENA_HALF_EXTENT||y<-1||y>50)return null;
  const action=ARENA_ACTIONS.includes(payload.action)?payload.action:"idle";
  return {x,y,z,yaw,action};
}

export const DEFAULT_ARENA_CONFIG=Object.freeze({maxPlayers:24});

export function normalizeArenaConfig(value={}){
  const maxPlayers=Number(value.maxPlayers??DEFAULT_ARENA_CONFIG.maxPlayers);
  if(!Number.isSafeInteger(maxPlayers)||maxPlayers<2||maxPlayers>24)throw new Error("invalid_arena_max_players");
  return {maxPlayers};
}
