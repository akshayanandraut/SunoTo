import { partySocketUrl } from "./party-api.js";

const ICE_SERVERS=[{urls:"stun:stun.l.google.com:19302"}];

export class PartyRoomClient{
  constructor({onEvent=()=>{},onStatus=()=>{},onRemoteAudio=()=>{},WebSocketImpl=WebSocket,RTCPeerConnectionImpl=RTCPeerConnection,getUserMediaImpl=(...args)=>navigator.mediaDevices.getUserMedia(...args)}={}){
    this.onEvent=onEvent;
    this.onStatus=onStatus;
    this.onRemoteAudio=onRemoteAudio;
    this.WebSocketImpl=WebSocketImpl;
    this.RTCPeerConnectionImpl=RTCPeerConnectionImpl;
    this.getUserMediaImpl=getUserMediaImpl;
    this.socket=null;
    this.participantId=null;
    this.isHost=false;
    this.hostStream=null;
    this.peerConnections=new Map();
    this.localVideoStream=null;
    this.videoPeerConnections=new Map();
    this.stopped=true;
    this.reconnectTimer=null;
  }
  connect({publicId,accountToken,isHost=false,anonymousToken,roomType}){
    this.isHost=isHost;
    this.publicId=publicId;
    this.accountToken=accountToken;
    this.anonymousToken=anonymousToken;
    this.roomType=roomType;
    this.participantId=this.participantId||crypto.randomUUID();
    this.stopped=false;
    this.open();
  }
  open(){
    if(this.stopped)return;
    const url=partySocketUrl(this.publicId,{accountToken:this.accountToken,isHost:this.isHost,participantId:this.participantId,roomType:this.roomType});
    this.socket=new this.WebSocketImpl(url,["party-room.v1",`rc-auth.${this.anonymousToken}`]);
    this.socket.addEventListener("open",()=>this.onStatus("connected"));
    this.socket.addEventListener("close",()=>{
      this.onStatus("closed");
      if(this.stopped)return;
      this.reconnectTimer=setTimeout(()=>this.open(),1500);
    });
    this.socket.addEventListener("error",()=>this.onStatus("error"));
    this.socket.addEventListener("message",event=>{
      let parsed;try{parsed=JSON.parse(event.data);}catch{return;}
      const {type,payload={}}=parsed;
      if(type==="READY")this.participantId=payload.participantId;
      if(["AUDIO_OFFER","AUDIO_ANSWER","AUDIO_ICE_CANDIDATE"].includes(type))return this.handleAudioSignal(type,payload);
      if(["VIDEO_OFFER","VIDEO_ANSWER","VIDEO_ICE_CANDIDATE"].includes(type))return this.handleVideoSignal(type,payload);
      if(type==="MEMBER_JOINED"&&this.localVideoStream&&payload.participantId)this.offerVideoToPeer(payload.participantId).catch(()=>{});
      this.onEvent(type,payload);
    });
  }
  sendMessage(text){this.send("ROOM_MESSAGE",{text});}
  sendReaction(reaction){this.send("RADIO_REACTION",{reaction});}
  send(type,payload={}){if(this.socket?.readyState===1)this.socket.send(JSON.stringify({type,payload}));}
  async startHostingAudio(){
    if(!this.isHost)return;
    this.hostStream=await this.getUserMediaImpl({audio:true,video:false});
    this.hostHeartbeat=setInterval(()=>this.send("HOST_HEARTBEAT"),30000);
  }
  connectAsListener(targetParticipantId){
    const pc=new this.RTCPeerConnectionImpl({iceServers:ICE_SERVERS});
    pc.addEventListener("icecandidate",event=>{if(event.candidate)this.send("AUDIO_ICE_CANDIDATE",{targetParticipantId,candidate:event.candidate.toJSON()});});
    pc.addEventListener("track",event=>this.onRemoteAudio(event.streams[0]));
    this.peerConnections.set(targetParticipantId,pc);
    return pc;
  }
  async offerToListener(listenerParticipantId){
    if(!this.hostStream)return;
    const pc=new this.RTCPeerConnectionImpl({iceServers:ICE_SERVERS});
    pc.addEventListener("icecandidate",event=>{if(event.candidate)this.send("AUDIO_ICE_CANDIDATE",{targetParticipantId:listenerParticipantId,candidate:event.candidate.toJSON()});});
    for(const track of this.hostStream.getTracks())pc.addTrack(track,this.hostStream);
    this.peerConnections.set(listenerParticipantId,pc);
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send("AUDIO_OFFER",{targetParticipantId:listenerParticipantId,sdp:offer.sdp});
  }
  async startLocalVideo(){
    if(this.localVideoStream)return this.localVideoStream;
    this.localVideoStream=await this.getUserMediaImpl({audio:true,video:true});
    return this.localVideoStream;
  }
  connectVideoAsPeer(fromId){
    const pc=new this.RTCPeerConnectionImpl({iceServers:ICE_SERVERS});
    pc.addEventListener("icecandidate",event=>{if(event.candidate)this.send("VIDEO_ICE_CANDIDATE",{targetParticipantId:fromId,candidate:event.candidate.toJSON()});});
    pc.addEventListener("track",event=>this.onEvent("PARTY_VIDEO_TRACK",{participantId:fromId,stream:event.streams[0]}));
    if(this.localVideoStream)for(const track of this.localVideoStream.getTracks())pc.addTrack(track,this.localVideoStream);
    this.videoPeerConnections.set(fromId,pc);
    return pc;
  }
  async offerVideoToPeer(targetParticipantId){
    if(!this.localVideoStream)return;
    const pc=this.connectVideoAsPeer(targetParticipantId);
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send("VIDEO_OFFER",{targetParticipantId,sdp:offer.sdp});
  }
  async handleVideoSignal(type,payload){
    const fromId=payload.fromParticipantId;
    if(type==="VIDEO_OFFER"){
      const pc=this.videoPeerConnections.get(fromId)||this.connectVideoAsPeer(fromId);
      await pc.setRemoteDescription({type:"offer",sdp:payload.sdp});
      const answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send("VIDEO_ANSWER",{targetParticipantId:fromId,sdp:answer.sdp});
      return;
    }
    if(type==="VIDEO_ANSWER"){
      const pc=this.videoPeerConnections.get(fromId);
      if(pc)await pc.setRemoteDescription({type:"answer",sdp:payload.sdp});
      return;
    }
    if(type==="VIDEO_ICE_CANDIDATE"){
      const pc=this.videoPeerConnections.get(fromId);
      if(pc&&payload.candidate)try{await pc.addIceCandidate(payload.candidate);}catch{}
    }
  }
  async handleAudioSignal(type,payload){
    const fromId=payload.fromParticipantId;
    if(type==="AUDIO_OFFER"){
      const pc=this.connectAsListener(fromId);
      await pc.setRemoteDescription({type:"offer",sdp:payload.sdp});
      const answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send("AUDIO_ANSWER",{targetParticipantId:fromId,sdp:answer.sdp});
      return;
    }
    if(type==="AUDIO_ANSWER"){
      const pc=this.peerConnections.get(fromId);
      if(pc)await pc.setRemoteDescription({type:"answer",sdp:payload.sdp});
      return;
    }
    if(type==="AUDIO_ICE_CANDIDATE"){
      const pc=this.peerConnections.get(fromId);
      if(pc&&payload.candidate)try{await pc.addIceCandidate(payload.candidate);}catch{}
    }
  }
  stop(){
    this.stopped=true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.hostHeartbeat);
    for(const pc of this.peerConnections.values())pc.close();
    this.peerConnections.clear();
    for(const pc of this.videoPeerConnections.values())pc.close();
    this.videoPeerConnections.clear();
    for(const track of this.hostStream?.getTracks()||[])track.stop();
    this.hostStream=null;
    for(const track of this.localVideoStream?.getTracks()||[])track.stop();
    this.localVideoStream=null;
    this.socket?.close(1000,"client_end");
  }
}
