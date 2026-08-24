import { adDecision } from "../../worker/src/policies/adPolicy.js";
const base=import.meta.env.VITE_API_BASE_URL||"http://127.0.0.1:8787/api/v1";

class HouseAdProvider{
  mount(slot){const card=document.createElement("div");card.className="ad-card";card.setAttribute("aria-label","Advertisement");const label=document.createElement("span");label.textContent="Advertisement";const message=document.createElement("strong");message.textContent="Your ad could be here";card.append(label,message);slot.replaceChildren(card);}
}
class DisabledAdProvider{mount(slot){slot.remove();}}
const providers={house:()=>new HouseAdProvider(),disabled:()=>new DisabledAdProvider()};
export function adProviderFor(name){return(providers[name]||providers.disabled)();}
export async function loadPublicAdConfig(fetcher=fetch){const response=await fetcher(`${base}/config/public`),data=await response.json();if(!response.ok)throw new Error(data.error||"public_config_failed");return data.ads;}
export function mountAds(root,{config,registered=false,balance=0,scanCount=0}={}){root.querySelectorAll("[data-ad-slot]").forEach(slot=>slot.remove());const decision=adDecision({registered,balance,scanCount,config});if(!decision.placements.length)return decision;const main=root.querySelector("main");if(!main)return decision;const provider=adProviderFor(decision.provider);for(const placement of decision.placements){if(placement==="interstitial"){const key=`random-chat.ad-scan.${scanCount}`;if(sessionStorage.getItem(key))continue;sessionStorage.setItem(key,"shown");const overlay=document.createElement("aside"),content=document.createElement("div");overlay.className="ad-interstitial";overlay.dataset.adSlot=placement;const close=document.createElement("button");close.className="btn btn-ghost";close.textContent="Continue";close.addEventListener("click",()=>overlay.remove());provider.mount(content);overlay.append(content,close);document.body.append(overlay);continue;}const slot=document.createElement("aside");slot.className=`ad-slot ad-slot-${placement}`;slot.dataset.adSlot=placement;if(placement==="top")main.prepend(slot);else main.append(slot);provider.mount(slot);}return decision;}
