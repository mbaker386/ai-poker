// Built-in reference stacks and defaults.

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const SUITS = ["C", "H", "S", "D"] as const; // CHaSeD

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = `${Rank}${Suit}`;
export type Entry = Card | "JOKER";

// Which suit ordering the coded encoding uses: CHaSeD (C,H,S,D) or SHoCkeD (S,H,C,D).
export type SuitOrder = "chased" | "shocked";
export const SUIT_SEQ: Record<SuitOrder, Suit[]> = {
  chased: ["C", "H", "S", "D"],
  shocked: ["S", "H", "C", "D"],
};

export const ARONSON: Card[] = [
  "JS", "KC", "5C", "2H", "9S", "AS", "3H", "6C", "8D", "AC",
  "10S", "5H", "2D", "KD", "7D", "8C", "3S", "AD", "7S", "5S",
  "QD", "AH", "8S", "3D", "7H", "QH", "5D", "7C", "4H", "KH",
  "4D", "10D", "JC", "JH", "10C", "JD", "4S", "10H", "6H", "3C",
  "2S", "9H", "KS", "6S", "4C", "8H", "9C", "QS", "6D", "QC",
  "2C", "9D",
];

export const MNEMONICA: Card[] = [
  "4C", "2H", "7D", "3C", "4H", "6D", "AS", "5H", "9S", "2S",
  "QH", "3D", "QC", "8H", "6S", "5S", "9H", "KC", "2D", "JH",
  "3S", "8S", "6H", "10C", "5D", "KD", "2C", "3H", "8D", "5C",
  "KS", "JD", "8C", "10S", "KH", "JC", "7S", "10H", "AD", "4S",
  "7H", "4D", "AC", "9C", "JS", "QD", "7C", "QS", "10D", "6C",
  "AH", "9D",
];

export const PARTICLE: Card[] = [
  "AH", "KS", "AD", "KC", "2H", "QS", "2D", "QC", "3H", "JS",
  "3D", "JC", "4H", "10S", "4D", "10C", "5H", "9S", "5D", "9C",
  "6H", "8S", "6D", "8C", "7H", "7S", "7D", "7C", "8H", "6S",
  "8D", "6C", "9H", "5S", "9D", "5C", "10H", "4S", "10D", "4C",
  "JH", "3S", "JD", "3C", "QH", "2S", "QD", "2C", "KH", "AS",
  "KD", "AC",
];

export const buildChased = (): Card[] =>
  RANKS.flatMap((r) => SUITS.map((s) => `${r}${s}` as Card));

// Si Stebbins: start at A♣, add 3 to the rank each step (A=1 … K=13, mod 13),
// and cycle the suits C, H, S, D. Produces AC, 4H, 7S, 10D, KC, 3H, 6S, 9D, …
export const buildSiStebbins = (): Card[] => {
  const suitCycle: Suit[] = ["C", "H", "S", "D"];
  const out: Card[] = [];
  let rankIdx = 0; // 0-based into RANKS: 0 = A … 12 = K
  for (let i = 0; i < 52; i++) {
    out.push(`${RANKS[rankIdx]}${suitCycle[i % 4]}` as Card);
    rankIdx = (rankIdx + 3) % 13;
  }
  return out;
};

export const CHASED: Card[] = buildChased();
export const SI_STEBBINS: Card[] = buildSiStebbins();
export const FULL_DECK: Card[] = buildChased();

export interface BuiltInStack {
  id: string;
  name: string;
  cards: Card[];
}

export const STACKS: BuiltInStack[] = [
  { id: "aronson", name: "Aronson", cards: ARONSON },
  { id: "mnemonica", name: "Mnemonica", cards: MNEMONICA },
  { id: "particle", name: "Particle", cards: PARTICLE },
  { id: "sistebbins", name: "Si Stebbins", cards: SI_STEBBINS },
  { id: "chased", name: "Numerical-CHaSeD", cards: CHASED },
];

export const DEFAULT_FORCE: Card[][] = [
  ["AC", "4H", "7S", "10D", "KC"],
  ["JS", "KC", "5C", "2H", "9S"],
  ["10H", "10D", "2S", "2C", "7D"],
  ["KH", "KD", "JC", "JS", "2S"],
];
export const DEFAULT_FORCE_TEXT =
  "AC 4H 7S 10D KC\nJS KC 5C 2H 9S\n10H 10D 2S 2C 7D\nKH KD JC JS 2S";
