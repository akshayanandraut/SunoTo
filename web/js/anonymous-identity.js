const ID_KEY = "random-chat.anonymous-identity.v1";
const ADJECTIVES = ["Quiet", "Bright", "Kind", "Misty", "Brave", "Sunny", "Calm", "Silver"];
const NOUNS = ["River", "Mango", "Kite", "Forest", "Monsoon", "Sparrow", "Lotus", "Comet"];

export function createFriendlyHandle(random = Math.random) {
  const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(random() * NOUNS.length)];
  const suffix = String(Math.floor(random() * 900) + 100);
  return `${adjective}${noun}${suffix}`;
}

export function getAnonymousIdentity(storage = localStorage, cryptoApi = crypto) {
  try {
    const existing = JSON.parse(storage.getItem(ID_KEY));
    if (existing?.id && existing?.secret && existing?.handle) return existing;
  } catch { /* Replace malformed local state. */ }
  const identity = {
    id: cryptoApi.randomUUID(),
    secret: cryptoApi.randomUUID(),
    handle: createFriendlyHandle(),
    createdAt: new Date().toISOString()
  };
  storage.setItem(ID_KEY, JSON.stringify(identity));
  return identity;
}
