export const ANDAR_BAHAR_MIN_PLAYERS = 1;
export const ANDAR_BAHAR_MAX_PLAYERS = 10;
export const ANDAR_BAHAR_RAKE_BP = 1000;

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function buildDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ id: `${rank}${suit}`, rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// Authentic rule: a red middle card (H/D) deals to Andar first; a black middle card (S/C) deals to Bahar first.
export function dealAndarBahar(deck, middleCard) {
  const isRed = middleCard.suit === "H" || middleCard.suit === "D";
  let side = isRed ? "andar" : "bahar";
  const andarPile = [];
  const baharPile = [];
  let winningSide = null;
  while (deck.length) {
    const card = deck.pop();
    if (side === "andar") andarPile.push(card); else baharPile.push(card);
    if (card.rank === middleCard.rank) { winningSide = side; break; }
    side = side === "andar" ? "bahar" : "andar";
  }
  return { andarPile, baharPile, winningSide };
}
