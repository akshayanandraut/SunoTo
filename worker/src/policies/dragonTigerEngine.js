export const DRAGON_TIGER_MIN_PLAYERS = 1;
export const DRAGON_TIGER_MAX_PLAYERS = 10;
export const DRAGON_TIGER_RAKE_BP = 1000;

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function rankValue(rank) { return RANKS.indexOf(rank); }

export function buildDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ id: `${rank}${suit}`, rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function dealDragonTiger(deck) {
  const dragonCard = deck.pop();
  const tigerCard = deck.pop();
  const dragonValue = rankValue(dragonCard.rank);
  const tigerValue = rankValue(tigerCard.rank);
  const winningSide = dragonValue === tigerValue ? "tie" : dragonValue > tigerValue ? "dragon" : "tiger";
  return { dragonCard, tigerCard, winningSide };
}
