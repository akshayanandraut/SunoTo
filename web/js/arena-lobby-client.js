const base=import.meta.env?.VITE_API_BASE_URL||"http://127.0.0.1:8787/api/v1";

function arenaSocketUrl({accountToken}={}){
  const url=new URL(`${base}/arena/socket`);
  url.protocol=url.protocol==="https:"?"wss:":"ws:";
  if(accountToken)url.searchParams.set("accountToken",accountToken);
  return url.toString();
}

// The strangers-lobby counterpart to PartyRoomClient, deliberately much smaller: no WebRTC, no
// seating, no games -- just join, relay AVATAR_STATE/ARENA_MESSAGE, and reconnect on drop.
export class ArenaLobbyClient{
  constructor({onEvent=()=>{},onStatus=()=>{},WebSocketImpl=WebSocket}={}){
    this.onEvent=onEvent;
    this.onStatus=onStatus;
    this.WebSocketImpl=WebSocketImpl;
    this.socket=null;
    this.participantId=null;
    this.stopped=true;
    this.reconnectTimer=null;
    this.consecutiveFailedAttempts=0;
  }
  connect({accountToken,anonymousToken}){
    this.accountToken=accountToken;
    this.anonymousToken=anonymousToken;
    this.stopped=false;
    this.consecutiveFailedAttempts=0;
    this.open();
  }
  open(){
    if(this.stopped)return;
    const url=arenaSocketUrl({accountToken:this.accountToken});
    this.socket=new this.WebSocketImpl(url,["arena-lobby.v1",`rc-auth.${this.anonymousToken}`]);
    let openedThisAttempt=false;
    this.socket.addEventListener("open",()=>{openedThisAttempt=true;this.consecutiveFailedAttempts=0;this.onStatus("connected");});
    this.socket.addEventListener("close",()=>{
      this.onStatus("closed");
      if(this.stopped)return;
      if(!openedThisAttempt){
        this.consecutiveFailedAttempts+=1;
        // The upgrade handshake was rejected outright (full lobby, flag off, not premium) -- browsers
        // don't expose the HTTP status of a failed WebSocket upgrade, so there's no specific reason to
        // show. Stop retrying a lobby that's refusing us rather than looping forever.
        if(this.consecutiveFailedAttempts>=3){this.stopped=true;this.onStatus("failed");return;}
      }
      this.reconnectTimer=setTimeout(()=>this.open(),1500);
    });
    this.socket.addEventListener("error",()=>this.onStatus("error"));
    this.socket.addEventListener("message",event=>{
      let parsed;try{parsed=JSON.parse(event.data);}catch{return;}
      const {type,payload={}}=parsed;
      if(type==="READY")this.participantId=payload.participantId;
      this.onEvent(type,payload);
    });
  }
  send(type,payload={}){if(this.socket?.readyState===1)this.socket.send(JSON.stringify({type,payload}));}
  sendMessage(text){this.send("ARENA_MESSAGE",{text});}
  stop(){
    this.stopped=true;
    clearTimeout(this.reconnectTimer);
    try{this.socket?.close();}catch{}
    this.socket=null;
  }
}
