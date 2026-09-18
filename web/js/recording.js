let activeRecorder=null;

function pickMimeType(){
  const candidates=["video/mp4","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];
  for(const type of candidates)if(window.MediaRecorder?.isTypeSupported?.(type))return type;
  return "";
}

function downloadBlob(blob,extension){
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=`sunoto-recording-${Date.now()}.${extension}`;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function closeModal(modal){modal.remove();if(activeRecorder?.stream)for(const track of activeRecorder.stream.getTracks())track.stop();activeRecorder=null;}

async function startScreenRecording(statusEl,startBtn,stopBtn){
  let stream;
  try{stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});}
  catch{statusEl.textContent="Screen share was cancelled or denied.";return;}
  const mimeType=pickMimeType();
  if(!mimeType){statusEl.textContent="This browser can't record video.";for(const track of stream.getTracks())track.stop();return;}
  const chunks=[],recorder=new MediaRecorder(stream,{mimeType});
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  recorder.onstop=()=>{
    const blob=new Blob(chunks,{type:mimeType}),extension=mimeType.startsWith("video/mp4")?"mp4":"webm";
    downloadBlob(blob,extension);
    statusEl.textContent=`Saved as .${extension}${extension==="webm"?" (this browser can only record webm, not mp4)":""}.`;
    startBtn.disabled=false;stopBtn.disabled=true;
  };
  stream.getVideoTracks()[0].addEventListener("ended",()=>{if(recorder.state==="recording")recorder.stop();});
  activeRecorder={recorder,stream};
  recorder.start();
  statusEl.textContent="Recording your screen…";
  startBtn.disabled=true;stopBtn.disabled=false;
}

export function openRecordingModal({accountSession,loadAccountApi,recordingCreditsPerSession,onWalletUpdate,friendlyError}){
  const modal=document.createElement("div");
  modal.className="recording-modal-backdrop";
  modal.innerHTML=`<div class="recording-modal panel">
    <button type="button" class="btn btn-ghost recording-modal-close" aria-label="Close">✕</button>
    <p class="eyebrow">Premium</p>
    <h3>Record or stream this session</h3>
    <div class="recording-tabs">
      <button type="button" class="btn btn-ghost" data-recording-tab="record" aria-pressed="true">🎬 Record screen</button>
      <button type="button" class="btn btn-ghost" data-recording-tab="stream" aria-pressed="false">📡 Stream live</button>
    </div>
    <div data-recording-panel="record">
      <p class="muted">Recording happens entirely on your device — nothing is uploaded. Costs ${recordingCreditsPerSession} Credits per recording session, charged once you start.</p>
      <div class="inline-form">
        <button type="button" class="btn btn-primary" id="recording-start-btn">Start recording</button>
        <button type="button" class="btn btn-ghost" id="recording-stop-btn" disabled>Stop &amp; download</button>
      </div>
      <p class="muted" id="recording-status"></p>
    </div>
    <div data-recording-panel="stream" hidden>
      <p class="muted">SunoTo doesn't relay video to YouTube/Twitch yet — for now, use free broadcasting software (OBS Studio or similar) pointed at your screen, with your own stream key pasted in there. This is free and doesn't use SunoTo credits.</p>
      <ol class="muted" style="padding-left:18px">
        <li>Install <a href="https://obsproject.com" target="_blank" rel="noopener">OBS Studio</a> (free).</li>
        <li>In OBS, add a "Display Capture" source for your screen.</li>
        <li>Go to Settings → Stream, choose YouTube or Twitch, and paste your stream key below into OBS.</li>
        <li>Click "Start Streaming" in OBS.</li>
      </ol>
      <div class="field">
        <label for="recording-stream-key">Your stream key (kept on this device only, never sent to SunoTo)</label>
        <input id="recording-stream-key" type="password" autocomplete="off" placeholder="Paste your YouTube/Twitch stream key">
      </div>
      <p class="muted">Tip: never share your stream key with anyone — treat it like a password.</p>
    </div>
  </div>`;
  document.body.append(modal);
  modal.addEventListener("click",event=>{if(event.target===modal)closeModal(modal);});
  modal.querySelector(".recording-modal-close").addEventListener("click",()=>closeModal(modal));
  for(const tabBtn of modal.querySelectorAll("[data-recording-tab]")){
    tabBtn.addEventListener("click",()=>{
      for(const btn of modal.querySelectorAll("[data-recording-tab]"))btn.setAttribute("aria-pressed",String(btn===tabBtn));
      for(const panel of modal.querySelectorAll("[data-recording-panel]"))panel.hidden=panel.getAttribute("data-recording-panel")!==tabBtn.getAttribute("data-recording-tab");
    });
  }
  const statusEl=modal.querySelector("#recording-status"),startBtn=modal.querySelector("#recording-start-btn"),stopBtn=modal.querySelector("#recording-stop-btn");
  startBtn.addEventListener("click",async()=>{
    if(!accountSession){statusEl.textContent="Please sign in to record.";return;}
    startBtn.disabled=true;statusEl.textContent="Charging Credits…";
    try{
      const accountApi=await loadAccountApi();
      const requestId=crypto.randomUUID();
      const result=await accountApi.startRecording(accountSession,requestId);
      onWalletUpdate?.(result.balance);
      await startScreenRecording(statusEl,startBtn,stopBtn);
    }catch(error){
      statusEl.textContent=friendlyError?.(error.message)||error.message||"Couldn't start recording.";
      startBtn.disabled=false;
    }
  });
  stopBtn.addEventListener("click",()=>{if(activeRecorder?.recorder.state==="recording")activeRecorder.recorder.stop();});
  return modal;
}
