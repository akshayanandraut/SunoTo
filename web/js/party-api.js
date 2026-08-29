const base=import.meta.env?.VITE_API_BASE_URL||"http://127.0.0.1:8787/api/v1";
async function call(path,session,options={}){const authHeader=session?.access_token?{authorization:`Bearer ${session.access_token}`}:{};const response=await fetch(`${base}${path}`,{...options,headers:{"content-type":"application/json",...authHeader,...options.headers}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"party_room_request_failed");return data;}
export const partyApi={
  create:(session,{roomType,priceTier,name,months})=>call("/party-rooms",session,{method:"POST",body:JSON.stringify({roomType,priceTier,name,months})}),
  join:(session,joinCode)=>call("/party-rooms/join",session,{method:"POST",body:JSON.stringify({joinCode})}),
  claimHost:(session,publicId)=>call(`/party-rooms/${publicId}/claim-host`,session,{method:"POST",body:"{}"}),
  invite:(session,publicId,{inviteeUserId,inviteeUsername})=>call(`/party-rooms/${publicId}/invite`,session,{method:"POST",body:JSON.stringify({inviteeUserId,inviteeUsername})}),
  publicRadioRooms:session=>call("/party-rooms/public",session,{method:"GET"}),
  radioChannels:(session=null)=>call("/radio/channels",session,{method:"GET"}),
  radioQueue:(session,publicId)=>call(`/party-rooms/${publicId}/radio/tracks`,session,{method:"GET"}),
  submitRadioTrack:async(session,publicId,{audioFile,artworkFile,title,artistName,durationSeconds,rightsAttested})=>{
    const form=new FormData();
    form.set("audio",audioFile);
    if(artworkFile)form.set("artwork",artworkFile);
    form.set("title",title);
    form.set("artistName",artistName||"");
    form.set("durationSeconds",String(Math.round(durationSeconds||0)));
    form.set("rightsAttested",rightsAttested?"true":"false");
    const response=await fetch(`${base}/party-rooms/${publicId}/radio/tracks`,{method:"POST",headers:{authorization:`Bearer ${session.access_token}`},body:form});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"radio_submit_failed");
    return data;
  },
};
export function partySocketUrl(publicId,{accountToken,isHost,participantId,roomType}={}){
  const url=new URL(`${base}/party-rooms/${publicId}/socket`);
  url.protocol=url.protocol==="https:"?"wss:":"ws:";
  url.searchParams.set("participantId",participantId);
  if(accountToken)url.searchParams.set("accountToken",accountToken);
  if(isHost)url.searchParams.set("isHost","1");
  if(roomType)url.searchParams.set("roomType",roomType);
  return url.toString();
}
