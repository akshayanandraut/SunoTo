export const GRASANY_REQUESTED_SCOPES=Object.freeze(["openid","email","profile"]);

export function createRefreshTokenForm({refreshToken,clientId}={}){
  if(typeof refreshToken!=="string"||!refreshToken.trim()||typeof clientId!=="string"||!clientId.trim())throw new Error("identity_refresh_configuration_unavailable");
  return new URLSearchParams({grant_type:"refresh_token",refresh_token:refreshToken,client_id:clientId});
}

export function validateInitialTokenResponse(payload,{requestedScopes=GRASANY_REQUESTED_SCOPES}={}){
  const scopes=typeof payload?.scope==="string"?payload.scope.split(/\s+/).filter(Boolean):[];
  const valid=payload&&typeof payload.access_token==="string"&&payload.access_token.length>0&&
    typeof payload.id_token==="string"&&payload.id_token.length>0&&
    typeof payload.refresh_token==="string"&&payload.refresh_token.length>0&&
    typeof payload.token_type==="string"&&payload.token_type.toLowerCase()==="bearer"&&
    Number.isFinite(payload.expires_in)&&payload.expires_in>0&&
    requestedScopes.every(scope=>scopes.includes(scope));
  if(!valid)throw new Error("identity_initial_token_response_incomplete");
  return{accessToken:payload.access_token,idToken:payload.id_token,refreshToken:payload.refresh_token,tokenType:"Bearer",expiresIn:payload.expires_in,scopes};
}

// Apply only a fully successful refresh response. Any error/non-success is a
// terminal session failure; callers must destroy the product session and must
// not retry the same refresh token. Unknown provider error details are ignored.
export function applyRefreshTokenResponse(currentTokens,{httpStatus,payload}={}){
  if(!currentTokens||typeof currentTokens.refreshToken!=="string"||!currentTokens.refreshToken)throw new Error("identity_refresh_session_missing");
  if(httpStatus<200||httpStatus>=300||!payload||typeof payload.access_token!=="string"||!payload.access_token||
    typeof payload.token_type!=="string"||payload.token_type.toLowerCase()!=="bearer"||
    !Number.isFinite(payload.expires_in)||payload.expires_in<=0){
    throw new Error("identity_refresh_failed_destroy_session");
  }
  const replacement=typeof payload.refresh_token==="string"&&payload.refresh_token.trim()?payload.refresh_token:currentTokens.refreshToken;
  return{...currentTokens,accessToken:payload.access_token,refreshToken:replacement,tokenType:"Bearer",expiresIn:payload.expires_in};
}
