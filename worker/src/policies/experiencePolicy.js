// "Surprise Match" experience types: a premium-only filter dimension layered on top of the
// existing random/preference matchmaking engine — not a separate matching system. Hardcoded like
// GENDERS/RADII in preferencePolicy.js rather than DB-driven, since this is a small fixed catalog
// for v1; can be moved to an admin-editable table later if the roster needs to grow or change often.
export const EXPERIENCE_TYPES = Object.freeze([
  { id: "surprise_me", label: "Surprise Me", icon: "🎲", description: "Completely random pairing, on us.", video: false },
  { id: "speed_date", label: "Speed Date", icon: "⏱️", description: "A quick video intro, no pressure.", video: true },
  { id: "candlelit_dinner", label: "Candlelit Dinner", icon: "🕯️", description: "A slow, cozy video date — pour a drink and vibe.", video: true },
  { id: "deep_talk", label: "Deep Talk", icon: "🌙", description: "Real conversations, no small talk.", video: false },
  { id: "flirty_fun", label: "Flirty & Fun", icon: "😏", description: "Playful, lighthearted energy.", video: false },
  { id: "adventure_chat", label: "Adventure Chat", icon: "🌍", description: "Swap travel stories and bucket lists.", video: false },
  { id: "night_owl", label: "Night Owl", icon: "🌃", description: "For the ones still up late.", video: false },
  { id: "weekend_plans", label: "Weekend Plans", icon: "📅", description: "Looking for someone to make weekend plans with.", video: false },
  { id: "blind_video_date", label: "Blind Video Date", icon: "🎭", description: "Video from the first second — no text warmup.", video: true },
  { id: "podcast_interview", label: "Podcast Interview", icon: "🎙️", description: "A 7-minute video Q&A — one of you interviews, the other spills.", video: true },
  { id: "dad_joke_duel", label: "Dad Joke Duel", icon: "😂", description: "Trade dad jokes on video — first one to laugh loses.", video: true },
  { id: "statue_duel", label: "Statue Duel", icon: "🗿", description: "Freeze on video — first one to move loses.", video: true },
  { id: "staring_contest", label: "Staring Contest", icon: "👀", description: "Lock eyes on video — first one to blink loses.", video: true },
  { id: "sleep_duel", label: "Sleep Duel", icon: "😴", description: "Stay up together on video — first one to doze off loses.", video: true },
  { id: "logout_duel", label: "Logout Duel", icon: "🚪", description: "Last one still connected wins — whoever closes the chat first loses.", video: false },
  { id: "roleplay", label: "Roleplay", icon: "🎭", description: "You'll each be given a random role — play it out and see where it goes.", video: false },
  { id: "guess_duel", label: "Guess Duel", icon: "❓", description: "You'll each get a secret word — ask questions, then risk a guess every 10 seconds. First to nail the other's word wins.", video: false },
  { id: "charades_duel", label: "Dumb Charades", icon: "🎬", description: "One of you gets a secret word to act out on video, no talking. The other guesses, one try every 10 seconds.", video: true },
]);
export const DUEL_EXPERIENCE_TYPES = Object.freeze(["dad_joke_duel", "statue_duel", "staring_contest", "sleep_duel"]);

// Loosely-related pairs read funnier than random shuffles of a flat role list (e.g. Doctor+Patient
// beats Doctor+Astronaut), but a few wildcards are mixed in since the request was "whatever, keep it
// interesting" -- not everything needs a straight-faced professional logic to it.
export const ROLEPLAY_PAIRS = Object.freeze([
  { a: "Doctor", b: "Patient with a mystery symptom" },
  { a: "Plumber", b: "Homemaker with a flooding kitchen" },
  { a: "Therapist", b: "Client who won't stop deflecting" },
  { a: "Mobile Repair Guy", b: "Customer whose phone is 'possessed'" },
  { a: "Eccentric Millionaire", b: "Brand-new Butler" },
  { a: "Ninja", b: "Accountant doing their taxes" },
  { a: "Detective", b: "Prime Suspect" },
  { a: "Chef", b: "Ruthless Food Critic" },
  { a: "Teacher", b: "Student who forgot the homework" },
  { a: "Astronaut", b: "Mission Control on a bad day" },
  { a: "Vampire", b: "Door-to-door Salesperson" },
  { a: "Alien on its first day on Earth", b: "Very confused Local" },
  { a: "Superhero, off duty", b: "Nosy Neighbour" },
  { a: "Wedding Planner", b: "Bridezilla" },
  { a: "Pirate Captain", b: "Nervous New Recruit" },
  { a: "Time Traveler from 2150", b: "Skeptical Barista" },
  { a: "Landlord", b: "Tenant with a broken tap since forever" },
  { a: "Fortune Teller", b: "Total Skeptic" },
  { a: "Robot learning to be human", b: "Its exhausted Trainer" },
  { a: "Food Delivery Rider", b: "Person who ordered 10 minutes ago" },
]);
export function randomRoleplayPair(random = Math.random) {
  return ROLEPLAY_PAIRS[Math.floor(random() * ROLEPLAY_PAIRS.length)];
}

// Deliberately a flat mix of people, events and objects (per the ask: "guess the event, guess the
// person -- have some sense of relevance but keep it interesting"), not paired like ROLEPLAY_PAIRS,
// since each player's word is independent here rather than part of a matched scenario.
export const GUESS_DUEL_WORDS = Object.freeze([
  "Albert Einstein", "Cleopatra", "Sherlock Holmes", "Dracula", "Napoleon", "Batman",
  "The Moon Landing", "The Olympics", "Halloween", "New Year's Eve", "Diwali", "World Cup Final",
  "A Toothbrush", "A Refrigerator", "A Guitar", "A Bicycle", "A Coffee Mug", "A Rubik's Cube",
  "The Great Wall of China", "Shakespeare",
]);
export function randomGuessDuelWords(random = Math.random) {
  const a = GUESS_DUEL_WORDS[Math.floor(random() * GUESS_DUEL_WORDS.length)];
  let b = a;
  while (b === a) b = GUESS_DUEL_WORDS[Math.floor(random() * GUESS_DUEL_WORDS.length)];
  return [a, b];
}

// Classic dumb-charades prompts: mimeable actions/things rather than abstract nouns, since the
// performer can't talk and has to physically act it out.
export const CHARADES_WORDS = Object.freeze([
  "Riding a bicycle", "Brushing teeth", "Titanic", "Superman", "Cooking pasta", "Playing guitar",
  "Swimming underwater", "Elephant", "Robot", "Sleeping", "Fishing", "Basketball", "Yoga pose",
  "Vampire", "Snake charmer", "Ice skating", "Boxing match", "Cutting a cake", "Taking a selfie",
  "Skydiving",
]);
export function randomCharadesWord(random = Math.random) {
  return CHARADES_WORDS[Math.floor(random() * CHARADES_WORDS.length)];
}
const EXPERIENCE_TYPE_IDS = new Set(EXPERIENCE_TYPES.map(item => item.id));
export function validExperienceType(value) {
  return EXPERIENCE_TYPE_IDS.has(value) ? value : null;
}
export function experienceRequiresVideo(experienceType) {
  return Boolean(EXPERIENCE_TYPES.find(item => item.id === experienceType)?.video);
}
