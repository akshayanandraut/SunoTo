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
]);
export const DUEL_EXPERIENCE_TYPES = Object.freeze(["dad_joke_duel", "statue_duel", "staring_contest"]);
const EXPERIENCE_TYPE_IDS = new Set(EXPERIENCE_TYPES.map(item => item.id));
export function validExperienceType(value) {
  return EXPERIENCE_TYPE_IDS.has(value) ? value : null;
}
export function experienceRequiresVideo(experienceType) {
  return Boolean(EXPERIENCE_TYPES.find(item => item.id === experienceType)?.video);
}
