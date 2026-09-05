const ICE_SERVERS=[{urls:"stun:stun.l.google.com:19302"}];

export class VideoCallClient{
  constructor({send,onLocalStream=()=>{},onRemoteStream=()=>{},onEnded=()=>{},RTCPeerConnectionImpl=RTCPeerConnection,getUserMediaImpl=(...args)=>navigator.mediaDevices.getUserMedia(...args)}){
    this.send=send;
    this.onLocalStream=onLocalStream;
    this.onRemoteStream=onRemoteStream;
    this.onEnded=onEnded;
    this.RTCPeerConnectionImpl=RTCPeerConnectionImpl;
    this.getUserMediaImpl=getUserMediaImpl;
    this.pc=null;
    this.localStream=null;
    this.active=false;
    this.videoDeviceId=null;
    this.audioDeviceId=null;
  }
  mediaConstraints(){
    return {video:this.videoDeviceId?{deviceId:{exact:this.videoDeviceId}}:true,audio:this.audioDeviceId?{deviceId:{exact:this.audioDeviceId}}:true};
  }
  async start(){
    if(this.active)return;
    this.active=true;
    this.localStream=await this.getUserMediaImpl(this.mediaConstraints());
    this.onLocalStream(this.localStream);
    this.pc=this.createPeerConnection();
    for(const track of this.localStream.getTracks())this.pc.addTrack(track,this.localStream);
    const offer=await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.send("VIDEO_OFFER",{sdp:offer.sdp});
  }
  async switchDevice({videoDeviceId,audioDeviceId}={}){
    if(!this.active)return;
    if(videoDeviceId!==undefined)this.videoDeviceId=videoDeviceId;
    if(audioDeviceId!==undefined)this.audioDeviceId=audioDeviceId;
    const nextStream=await this.getUserMediaImpl(this.mediaConstraints());
    for(const track of nextStream.getTracks()){
      const sender=this.pc?.getSenders().find(item=>item.track&&item.track.kind===track.kind);
      if(sender)await sender.replaceTrack(track);
    }
    for(const track of this.localStream?.getTracks()||[])track.stop();
    this.localStream=nextStream;
    this.onLocalStream(this.localStream);
  }
  setTrackEnabled(kind,enabled){
    for(const track of this.localStream?.getTracks()||[])if(track.kind===kind)track.enabled=enabled;
  }
  createPeerConnection(){
    const pc=new this.RTCPeerConnectionImpl({iceServers:ICE_SERVERS});
    pc.addEventListener("icecandidate",event=>{if(event.candidate)this.send("VIDEO_ICE_CANDIDATE",{candidate:event.candidate.toJSON()});});
    pc.addEventListener("track",event=>{this.onRemoteStream(event.streams[0]);});
    return pc;
  }
  async handleSignal(type,payload){
    if(type==="VIDEO_OFFER"){
      this.active=true;
      this.localStream??=await this.getUserMediaImpl({video:true,audio:true});
      this.onLocalStream(this.localStream);
      this.pc??=this.createPeerConnection();
      for(const track of this.localStream.getTracks())if(!this.pc.getSenders().some(sender=>sender.track===track))this.pc.addTrack(track,this.localStream);
      await this.pc.setRemoteDescription({type:"offer",sdp:payload.sdp});
      const answer=await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.send("VIDEO_ANSWER",{sdp:answer.sdp});
      return;
    }
    if(type==="VIDEO_ANSWER"){
      if(!this.pc)return;
      await this.pc.setRemoteDescription({type:"answer",sdp:payload.sdp});
      return;
    }
    if(type==="VIDEO_ICE_CANDIDATE"){
      if(!this.pc||!payload.candidate)return;
      try{await this.pc.addIceCandidate(payload.candidate);}catch{}
      return;
    }
    if(type==="VIDEO_END"){
      this.stop(false);
      this.onEnded();
    }
  }
  stop(notify=true){
    if(notify&&this.active)this.send("VIDEO_END");
    this.active=false;
    this.pc?.close();
    this.pc=null;
    for(const track of this.localStream?.getTracks()||[])track.stop();
    this.localStream=null;
  }
}
