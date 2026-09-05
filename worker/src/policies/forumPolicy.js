export const FORUM_TOPICS = [
  { id: "general", label: "General", description: "Anything goes — introduce yourself, ask questions." },
  { id: "music", label: "Music", description: "Share what you're listening to, radio requests, artists." },
  { id: "gaming", label: "Gaming", description: "Party Room games, strategy talk, looking-for-group." },
  { id: "support", label: "Support & feedback", description: "Report bugs, suggest features, ask for help." },
];
export const FORUM_TOPIC_IDS = FORUM_TOPICS.map((topic) => topic.id);
export function validForumTopicId(id) {
  return FORUM_TOPIC_IDS.includes(id);
}
export const FORUM_MESSAGE_HISTORY_LIMIT = 100;
export const FORUM_MAX_MESSAGE_LENGTH = 500;
