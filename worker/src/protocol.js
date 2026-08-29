export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_CHARS = 1000;
export const MAX_PHOTO_DATA_CHARS = 280000;
export function serverEvent(type,payload={},eventId){return JSON.stringify({v:PROTOCOL_VERSION,type,...(eventId?{eventId}:{}),payload});}
export function parseClientEvent(raw){
  if(typeof raw!=="string")return{ok:false,code:"binary_not_supported"};
  let event;try{event=JSON.parse(raw)}catch{return{ok:false,code:"invalid_json"}}
  if(event?.v!==PROTOCOL_VERSION||typeof event.type!=="string")return{ok:false,code:"invalid_envelope"};
  if(event.type==="CHAT_MESSAGE"){
    const text=event.payload?.text;
    if(typeof event.eventId!=="string"||!event.eventId||typeof text!=="string")return{ok:false,code:"invalid_message"};
    if(!text.trim())return{ok:false,code:"empty_message"};
    if([...text].length>MAX_MESSAGE_CHARS)return{ok:false,code:"message_too_large"};
    return{ok:true,event:{...event,payload:{text}}};
  }
  if(event.type==="REPORT"){const reason=event.payload?.reason;if(!["spam","contact_bypass","harassment","inappropriate","underage","scam","threats","other"].includes(reason))return{ok:false,code:"invalid_report_reason"};return{ok:true,event:{...event,payload:{reason}}};}
  if(event.type==="VIDEO_OFFER"||event.type==="VIDEO_ANSWER"){const sdp=event.payload?.sdp;if(typeof sdp!=="string"||!sdp||sdp.length>20000)return{ok:false,code:"invalid_video_signal"};return{ok:true,event:{...event,payload:{sdp}}};}
  if(event.type==="VIDEO_ICE_CANDIDATE"){const candidate=event.payload?.candidate;if(typeof candidate!=="object"||candidate===null||JSON.stringify(candidate).length>4000)return{ok:false,code:"invalid_video_signal"};return{ok:true,event:{...event,payload:{candidate}}};}
  if(event.type==="PHOTO_MESSAGE"){
    const data=event.payload?.data,durationSeconds=Number(event.payload?.durationSeconds??10);
    if(typeof event.eventId!=="string"||!event.eventId||typeof data!=="string"||!/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/]+=*$/.test(data)||data.length>MAX_PHOTO_DATA_CHARS)return{ok:false,code:"invalid_photo"};
    if(!Number.isFinite(durationSeconds)||durationSeconds<3||durationSeconds>30)return{ok:false,code:"invalid_photo_duration"};
    return{ok:true,event:{...event,payload:{data,durationSeconds}}};
  }
  if(event.type==="TYPING"){const typing=event.payload?.typing;if(typeof typing!=="boolean")return{ok:false,code:"invalid_typing"};return{ok:true,event:{...event,payload:{typing}}};}
  if(["HELLO","HEARTBEAT","SESSION_RESUME","ACTIVITY","NEXT_REQUEST","SESSION_END","CONTINUE_ACCEPT","CONTINUE_DECLINE","CONTACT_UNLOCK_REQUEST","CONTACT_UNLOCK_ACCEPT","CONTACT_UNLOCK_DECLINE","LIKE","BLOCK","VIDEO_END"].includes(event.type))return{ok:true,event};
  return{ok:false,code:"unsupported_event"};
}
