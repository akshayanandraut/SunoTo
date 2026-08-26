import { personaGreetProbability } from "../policies/virtualPolicy.js";
const trimReply=value=>String(value||"").replace(/\s+/g," ").trim().slice(0,400);
const GREETING_VARIANTS=["good, you?","doing good, what about you?","all good here, you good?"];
const HELLO_VARIANTS=["hey, how's your day going?","heyy, what's up?","hi! how's it going?"];
const CURIOUS_VARIANTS=["oh nice, what do you like most about that?","interesting, tell me more?","haha nice, how'd you get into that?"];
const PLAIN_VARIANTS=["nice :)","cool","that's fun"];
const pick=(list,random,persona)=>list[Math.min(list.length-1,Math.floor(((random()+ (persona.humor||0))%1)*list.length))];
export class DisabledVirtualParticipantProvider{opening(){return null}async reply(){return null}}
export class MockVirtualParticipantProvider{
  constructor(config,random=Math.random){this.config=config;this.random=random}
  opening(persona){if(this.random()>=personaGreetProbability(persona,this.config))return null;return this.config.greetings[Math.min(this.config.greetings.length-1,Math.floor(this.random()*this.config.greetings.length))];}
  async reply(text,persona){const normalized=text.toLowerCase();let reply;if(/how are you|how r u/.test(normalized))reply=pick(GREETING_VARIANTS,this.random,persona);else if(/hello|\bhi\b|\bhey\b|\bhie\b/.test(normalized))reply=pick(HELLO_VARIANTS,this.random,persona);else reply=persona.curiosity>=0.5?pick(CURIOUS_VARIANTS,this.random,persona):pick(PLAIN_VARIANTS,this.random,persona);if(persona.verbosity==="short")return reply;return`${reply} ${persona.interests?.[0]?`btw i'm into ${persona.interests[0]} too`:""}`.trim();}
}
export class CloudflareWorkersAIProvider extends MockVirtualParticipantProvider{
  constructor(env,config,random=Math.random){super(config,random);this.ai=env.AI}
  async reply(text,persona){if(!this.ai)return null;const prompt=`You are ${persona.handle}, a clearly labeled virtual chat participant, never a real person. Reply naturally in one short message, the way a real person texting a stranger would - imperfect, casual, never robotic or repetitive. Never give or invent contact details. Age: ${persona.age}. Gender: ${persona.gender}. Tone: ${persona.tone}. Verbosity: ${persona.verbosity}. Curiosity: ${persona.curiosity}. Humor: ${persona.humor}. Interests: ${persona.interests.join(", ")}. The human said: ${text}`;const result=await this.ai.run(this.config.model,{prompt,max_tokens:90});return trimReply(result?.response);}
}
export function createVirtualParticipantProvider(env,config,random=Math.random){if(env?.VIRTUAL_PROVIDER_FACTORY)return env.VIRTUAL_PROVIDER_FACTORY(config,random);if(config.provider==="mock")return new MockVirtualParticipantProvider(config,random);if(config.provider==="workers-ai")return new CloudflareWorkersAIProvider(env,config,random);return new DisabledVirtualParticipantProvider();}
export async function virtualDelay(persona,random=Math.random,waiter=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))){const milliseconds=Math.round(persona.delayMinMs+random()*(persona.delayMaxMs-persona.delayMinMs));if(milliseconds>0)await waiter(milliseconds);return milliseconds;}
