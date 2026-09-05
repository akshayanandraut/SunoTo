export const RUMMY_MIN_PLAYERS = 2;
export const RUMMY_MAX_PLAYERS = 6;
export const RUMMY_HAND_SIZE = 13;
export const RUMMY_RAKE_BP = 1000;

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function cardId(rank, suit) {
  return `${rank}${suit}`;
}

// Two standard 52-card decks plus 4 printed jokers, matching classic Indian 13-card rummy for 2-6 players.
export function buildShoe() {
  const cards = [];
  for (let deck = 0; deck < 2; deck++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ id: `${cardId(rank, suit)}-${deck}`, rank, suit });
    cards.push({ id: `JOKER-${deck}-1`, rank: "JOKER", suit: "JOKER" });
    cards.push({ id: `JOKER-${deck}-2`, rank: "JOKER", suit: "JOKER" });
  }
  return shuffleCards(cards);
}

function shuffleCards(cards) {
  const copy = cards.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dealRummy(turnOrder) {
  const shoe = buildShoe();
  const hands = {};
  for (const id of turnOrder) hands[id] = [];
  for (let round = 0; round < RUMMY_HAND_SIZE; round++) {
    for (const id of turnOrder) hands[id].push(shoe.pop());
  }
  let wildcardCard = shoe.pop();
  while (wildcardCard.rank === "JOKER") { shoe.unshift(wildcardCard); wildcardCard = shoe.pop(); }
  const discardPile = [shoe.pop()];
  return { hands, closedDeck: shoe, discardPile, wildcardRank: wildcardCard.rank };
}

function isWild(card, wildcardRank) {
  return card.rank === "JOKER" || card.rank === wildcardRank;
}

function isValidSet(group, wildcardRank) {
  if (group.length < 3 || group.length > 4) return false;
  const naturals = group.filter(c => !isWild(c, wildcardRank));
  if (!naturals.length) return false;
  const rank = naturals[0].rank;
  if (naturals.some(c => c.rank !== rank)) return false;
  const suits = new Set(naturals.map(c => c.suit));
  if (suits.size !== naturals.length) return false; // no duplicate suits among naturals
  return true;
}

function rankIndex(rank) {
  return RANKS.indexOf(rank);
}

function isValidSequence(group, wildcardRank) {
  if (group.length < 3) return false;
  const naturals = group.filter(c => !isWild(c, wildcardRank));
  const wildCount = group.length - naturals.length;
  if (!naturals.length) return false;
  const suit = naturals[0].suit;
  if (naturals.some(c => c.suit !== suit)) return false;
  const indexes = naturals.map(c => rankIndex(c.rank)).sort((a, b) => a - b);
  if (new Set(indexes).size !== indexes.length) return false; // no duplicate ranks
  // try to fit naturals (in order) plus wilds into a consecutive run of length group.length,
  // sliding the low-anchor across the valid range (A can only be low in this simplified engine)
  const span = group.length;
  const minAnchor = Math.max(0, indexes[indexes.length - 1] - span + 1);
  const maxAnchor = indexes[0];
  for (let anchor = minAnchor; anchor <= maxAnchor; anchor++) {
    if (anchor < 0 || anchor + span - 1 > RANKS.length - 1) continue;
    if (indexes.every(idx => idx >= anchor && idx <= anchor + span - 1)) return true;
  }
  return wildCount > 0 && indexes[indexes.length - 1] - indexes[0] < span; // fallback: gaps fit within span
}

function isPureSequence(group, wildcardRank) {
  return isValidSequence(group, wildcardRank) && group.every(c => !isWild(c, wildcardRank));
}

// groups: array of arrays of card ids the player claims form their meld; unusedCardId is the 14th card discarded to finish.
export function validateDeclaration(hand, groups, unusedCardId, wildcardRank) {
  const handIds = new Set(hand.map(c => c.id));
  if (!handIds.has(unusedCardId)) return { valid: false, reason: "unused_card_not_in_hand" };
  const byId = new Map(hand.map(c => [c.id, c]));
  const claimedIds = groups.flat();
  if (claimedIds.length !== RUMMY_HAND_SIZE) return { valid: false, reason: "wrong_card_count" };
  const seen = new Set();
  for (const id of claimedIds) {
    if (id === unusedCardId || !handIds.has(id) || seen.has(id)) return { valid: false, reason: "invalid_card_reference" };
    seen.add(id);
  }
  if (!groups.length || groups.some(g => g.length < 3)) return { valid: false, reason: "invalid_group_size" };
  const resolvedGroups = groups.map(g => g.map(id => byId.get(id)));
  let sequenceCount = 0, pureCount = 0;
  for (const group of resolvedGroups) {
    const set = isValidSet(group, wildcardRank);
    const seq = !set && isValidSequence(group, wildcardRank);
    if (!set && !seq) return { valid: false, reason: "invalid_group" };
    if (seq) { sequenceCount += 1; if (isPureSequence(group, wildcardRank)) pureCount += 1; }
  }
  if (pureCount < 1) return { valid: false, reason: "no_pure_sequence" };
  if (sequenceCount < 2) return { valid: false, reason: "needs_two_sequences" };
  return { valid: true };
}
