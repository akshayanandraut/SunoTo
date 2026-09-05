export const TEEN_PATTI_MIN_PLAYERS = 2;
export const TEEN_PATTI_MAX_PLAYERS = 6;
export const TEEN_PATTI_RAKE_BP = 1000;

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function rankValue(rank) {
  return RANKS.indexOf(rank) + 2;
}

export function buildDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ id: `${rank}${suit}`, rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function dealTeenPatti(turnOrder) {
  const deck = buildDeck();
  const hands = {};
  for (const id of turnOrder) hands[id] = [deck.pop(), deck.pop(), deck.pop()];
  return { hands, deck };
}

// Returns { category, tiebreak: number[] } where higher category/tiebreak wins.
// category: 5=trail, 4=pure sequence, 3=sequence, 2=color, 1=pair, 0=high card
export function rankHand(cards) {
  const values = cards.map(c => rankValue(c.rank)).sort((a, b) => b - a);
  const sameSuit = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
  const isTrail = values[0] === values[1] && values[1] === values[2];
  const uniqueSorted = [...new Set(values)].sort((a, b) => a - b);
  let isSequence = false;
  let seqHigh = values[0];
  if (uniqueSorted.length === 3) {
    if (uniqueSorted[2] - uniqueSorted[0] === 2) {
      isSequence = true;
      seqHigh = uniqueSorted[2];
    } else if (uniqueSorted[0] === 2 && uniqueSorted[1] === 3 && uniqueSorted[2] === 14) {
      isSequence = true;
      seqHigh = 3; // A-2-3 lowest sequence, ranked below 2-3-4
    }
  }
  if (isTrail) return { category: 5, tiebreak: [values[0]] };
  if (isSequence && sameSuit) return { category: 4, tiebreak: [seqHigh] };
  if (isSequence) return { category: 3, tiebreak: [seqHigh] };
  if (sameSuit) return { category: 2, tiebreak: values };
  const pairValue = values[0] === values[1] ? values[0] : values[1] === values[2] ? values[1] : null;
  if (pairValue) {
    const kicker = values.find(v => v !== pairValue);
    return { category: 1, tiebreak: [pairValue, kicker] };
  }
  return { category: 0, tiebreak: values };
}

// Returns 1 if a beats b, -1 if b beats a, 0 if exact tie.
export function compareHands(cardsA, cardsB) {
  const a = rankHand(cardsA);
  const b = rankHand(cardsB);
  if (a.category !== b.category) return a.category > b.category ? 1 : -1;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const av = a.tiebreak[i] || 0;
    const bv = b.tiebreak[i] || 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}
