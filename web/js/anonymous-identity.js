const ID_KEY = "random-chat.anonymous-identity.v1";
const ADJECTIVES = ["Quiet", "Bright", "Kind", "Misty", "Brave", "Sunny", "Calm", "Silver"];
const NOUNS = ["River", "Mango", "Kite", "Forest", "Monsoon", "Sparrow", "Lotus", "Comet"];
const OPAQUE_ID = /^[a-zA-Z0-9_-]{8,100}$/;
const HANDLE = /^[a-zA-Z0-9_]{3,24}$/;

export function createFriendlyHandle(random = Math.random) {
  const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(random() * NOUNS.length)];
  const suffix = String(Math.floor(random() * 900) + 100);
  return `${adjective}${noun}${suffix}`;
}

export function getAnonymousIdentity(storage = localStorage, cryptoApi = crypto) {
  try {
    const existing = JSON.parse(storage.getItem(ID_KEY));
    if (OPAQUE_ID.test(existing?.id || "") && OPAQUE_ID.test(existing?.secret || "") && HANDLE.test(existing?.handle || "")) return existing;
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
