const trimReply=value=>String(value||"").replace(/\s+/g," ").trim().slice(0,400);
export class DisabledVirtualParticipantProvider{opening(){return null}async reply(){return null}}
export class MockVirtualParticipantProvider{
  constructor(config,random=Math.random){this.config=config;this.random=random}
  opening(){if(this.random()>=this.config.greetProbability)return null;return this.config.greetings[Math.min(this.config.greetings.length-1,Math.floor(this.random()*this.config.greetings.length))];}
  async reply(text,persona){const normalized=text.toLowerCase();if(/how are you|how r u/.test(normalized))return"good, you?";if(/hello|\bhi\b|\bhey\b|\bhie\b/.test(normalized))return"hey, how's your day going?";return persona.curiosity>=0.5?"oh nice, what do you like most about that?":"nice :)";}
}
export class CloudflareWorkersAIProvider extends MockVirtualParticipantProvider{
  constructor(env,config,random=Math.random){super(config,random);this.ai=env.AI}
  async reply(text,persona){if(!this.ai)return null;const prompt=`You are ${persona.handle}, a clearly labeled virtual chat participant, never a real person. Reply naturally in one short message. Never give or invent contact details. Tone: ${persona.tone}. Interests: ${persona.interests.join(", ")}. The human said: ${text}`;const result=await this.ai.run(this.config.model,{prompt,max_tokens:90});return trimReply(result?.response);}
}
export function createVirtualParticipantProvider(env,config,random=Math.random){if(env?.VIRTUAL_PROVIDER_FACTORY)return env.VIRTUAL_PROVIDER_FACTORY(config,random);if(config.provider==="mock")return new MockVirtualParticipantProvider(config,random);if(config.provider==="workers-ai")return new CloudflareWorkersAIProvider(env,config,random);return new DisabledVirtualParticipantProvider();}
export async function virtualDelay(persona,random=Math.random,waiter=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))){const milliseconds=Math.round(persona.delayMinMs+random()*(persona.delayMaxMs-persona.delayMinMs));if(milliseconds>0)await waiter(milliseconds);return milliseconds;}
