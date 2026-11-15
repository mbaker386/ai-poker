// Pure decoding logic for AI Poker. No DOM, no state — fully testable.
//
// Each entered group of four self-classifies:
//   - contains a Joker            -> joker emergency (positional King)
//   - three distinct + one repeat -> repeat-King method (color + minor/major)
//   - 4-subset of a force config  -> force reveal (the fifth card)
//   - 4 of 5 consecutive in stack -> block reveal (the missing card)
//   - otherwise                   -> coded reveal (permutation + King rule)

import { FULL_DECK, SUIT_SEQ, type Card, type Entry, type Suit, type SuitOrder } from "./stacks";

const RANK_NAME: Record<string, string> = {
  A: "Ace", "2": "Two", "3": "Three", "4": "Four", "5": "Five", "6": "Six",
  "7": "Seven", "8": "Eight", "9": "Nine", "10": "Ten", J: "Jack", Q: "Queen", K: "King",
};
const SUIT_NAME: Record<string, string> = { C: "Clubs", H: "Hearts", S: "Spades", D: "Diamonds" };

export function parseCard(card: Card): { rank: string; suit: string } {
  return { rank: card.slice(0, -1), suit: card.slice(-1) };
}

export function formatFull(card: Card | null | undefined): string {
  if (!card || (card as string) === "JOKER") return "";
  const { rank, suit } = parseCard(card);
  return `${RANK_NAME[rank]} of ${SUIT_NAME[suit]}`;
}

export const isRed = (suit: string): boolean => suit === "H" || suit === "D";

export const positionMap = (stack: Card[]): Map<Card, number> =>
  new Map(stack.map((c, i) => [c, i + 1]));

// The coded suit encoding follows the selected suit order: label k -> the k-th
// suit of that order. CHaSeD: 1=C,2=H,3=S,4=D. SHoCkeD: 1=S,2=H,3=C,4=D.
const suitByLabel = (order: SuitOrder, label: number): Suit => SUIT_SEQ[order][label - 1];
const kingByLabel = (order: SuitOrder, label: number): Card => `K${SUIT_SEQ[order][label - 1]}` as Card;
const VALUE_PAIRS: [string, string][][] = [
  [["A", "7"], ["2", "8"]],
  [["3", "9"], ["4", "10"]],
  [["5", "J"], ["6", "Q"]],
];

export const labelVisible = (visible: Card[], pos: Map<Card, number>): Card[] =>
  [...visible].sort((a, b) => (pos.get(a) ?? 0) - (pos.get(b) ?? 0));

export const permutationOf = (entered: Card[], sortedVisible: Card[]): number[] => {
  const lbl = new Map(sortedVisible.map((c, i) => [c, i + 1]));
  return entered.map((c) => lbl.get(c) ?? 0);
};

export function decodeOrdinaryCandidates(perm: number[], suitOrder: SuitOrder): [Card, Card] {
  const first = perm[0];
  const suit = suitByLabel(suitOrder, first);
  const rem3 = [1, 2, 3, 4].filter((x) => x !== first);
  const row = rem3.indexOf(perm[1]);
  const rem2 = rem3.filter((x) => x !== perm[1]);
  const col = rem2.indexOf(perm[2]);
  const [a, b] = VALUE_PAIRS[row][col];
  return [`${a}${suit}` as Card, `${b}${suit}` as Card];
}

export function applySimpleKingRule(ordinary: Card[], sortedVisible: Card[], suitOrder: SuitOrder): Card[] {
  const vis = new Set(sortedVisible);
  const lbl = new Map(sortedVisible.map((c, i) => [c, i + 1]));
  const out: Card[] = [];
  for (const cand of ordinary) {
    if (!vis.has(cand)) { out.push(cand); continue; }
    const king = kingByLabel(suitOrder, lbl.get(cand)!);
    if (!vis.has(king)) out.push(king);
  }
  return [...new Set(out)];
}

export interface SpacingScore { maxGap: number; sumSquares: number }

export function spacingScore(card: Card, visible: Card[], pos: Map<Card, number>): SpacingScore {
  const p = [...visible, card].map((c) => pos.get(c)!).sort((a, b) => a - b);
  const gaps = p.map((v, i) => {
    const nx = p[(i + 1) % p.length];
    return i < p.length - 1 ? nx - v - 1 : nx + 52 - v - 1;
  });
  return { maxGap: Math.max(...gaps), sumSquares: gaps.reduce((s, g) => s + g * g, 0) };
}

export function chooseWithSpacing(
  finals: Card[], visible: Card[], pos: Map<Card, number>, parityConst: number,
): { answer: Card; alternate: Card } {
  const [x, y] = finals;
  const sx = spacingScore(x, visible, pos);
  const sy = spacingScore(y, visible, pos);
  let answer: Card, alternate: Card;
  if (sx.maxGap !== sy.maxGap) [answer, alternate] = sx.maxGap < sy.maxGap ? [x, y] : [y, x];
  else if (sx.sumSquares !== sy.sumSquares) [answer, alternate] = sx.sumSquares < sy.sumSquares ? [x, y] : [y, x];
  else {
    const byPos = [x, y].sort((a, b) => pos.get(a)! - pos.get(b)!);
    const total = visible.reduce((s, c) => s + pos.get(c)!, 0) + parityConst;
    answer = total % 2 === 0 ? byPos[0] : byPos[1];
    alternate = answer === byPos[0] ? byPos[1] : byPos[0];
  }
  return { answer, alternate };
}

function decodeJokerEmergency(
  entries: Entry[], pos: Map<Card, number>, suitOrder: SuitOrder,
): { king: Card; slot: number } {
  const jIdx = entries.map((e, i) => (e === "JOKER" ? i : -1)).filter((i) => i >= 0);
  if (jIdx.length !== 1) throw new Error("count");
  const reals = entries.filter((e): e is Card => e !== "JOKER");
  if (new Set(reals).size !== 3) throw new Error("distinct");
  const rp = reals.map((c) => pos.get(c)!);
  if (!rp.every((p, i) => i === 0 || rp[i - 1] < p)) throw new Error("not-ascending");
  return { king: kingByLabel(suitOrder, jIdx[0] + 1), slot: jIdx[0] + 1 };
}

// Repeat-King method: three distinct cards (one repeated as the fourth entry).
// The ENTRY ORDER of the three distinct cards names a King, independent of the
// suit-order setting:
//   - 1st card = lowest stack position (A) -> black; middle (B) -> red; (C unused)
//   - of the remaining two (by position), the lower -> minor suit, higher -> major
//   - black: minor = Clubs, major = Spades ; red: minor = Diamonds, major = Hearts
export function decodeRepeatKing(reals: Card[], pos: Map<Card, number>): EvalResult {
  const seen = new Set<Card>();
  const order: Card[] = [];
  for (const c of reals) { if (!seen.has(c)) { seen.add(c); order.push(c); } }
  if (order.length !== 3) return { ok: false, error: "invalid" };
  const sorted = [...order].sort((a, b) => pos.get(a)! - pos.get(b)!); // [A, B, C]
  const e1 = order[0], e2 = order[1];

  let color: "black" | "red";
  if (e1 === sorted[0]) color = "black";
  else if (e1 === sorted[1]) color = "red";
  else return { ok: false, error: "invalid" }; // first card was the highest — not a valid code

  const remaining = sorted.filter((c) => c !== e1); // two cards, position-sorted
  let rank: "minor" | "major";
  if (e2 === remaining[0]) rank = "minor";
  else if (e2 === remaining[1]) rank = "major";
  else return { ok: false, error: "invalid" };

  const suit: Suit = color === "black" ? (rank === "minor" ? "C" : "S") : (rank === "minor" ? "D" : "H");
  return { ok: true, answer: `K${suit}` as Card, alternate: null, mode: "repeat-king", diag: { color, rankClass: rank } };
}

export const cyclicPosition = (p: number): number => (((p - 1) % 52) + 52) % 52 + 1;
export const blockFrom = (start: number): number[] =>
  [0, 1, 2, 3, 4].map((o) => cyclicPosition(start + o));

export function findExactBlocks(inputPos: number[]): { missingPos: number; missingIndex: number }[] {
  const inputSet = new Set(inputPos);
  const out: { missingPos: number; missingIndex: number }[] = [];
  for (let start = 1; start <= 52; start++) {
    const block = blockFrom(start);
    if (block.filter((p) => inputSet.has(p)).length === 4) {
      const idx = block.findIndex((p) => !inputSet.has(p));
      out.push({ missingPos: block[idx], missingIndex: idx });
    }
  }
  return out;
}

// Ranking used only to supply an alternate for an exact block answer.
export function rankedBlockCandidates(inputPos: number[], stack: Card[]): Card[] {
  const inputSet = new Set(inputPos);
  const circ = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, 52 - d); };
  interface Hyp { card: Card; holePos: number; matches: number; middleBonus: number; distancePenalty: number }
  const hyps: Hyp[] = [];
  for (let start = 1; start <= 52; start++) {
    const block = blockFrom(start);
    for (let mi = 0; mi < 5; mi++) {
      const holePos = block[mi];
      if (inputSet.has(holePos)) continue;
      const expected = block.filter((_, i) => i !== mi);
      const eSet = new Set(expected);
      const matches = inputPos.filter((p) => eSet.has(p)).length;
      const middleBonus = mi >= 1 && mi <= 3 ? 1 : 0;
      const distancePenalty = inputPos.reduce(
        (s, p) => s + Math.min(...expected.map((e) => circ(p, e))), 0,
      );
      hyps.push({ card: stack[holePos - 1], holePos, matches, middleBonus, distancePenalty });
    }
  }
  hyps.sort((a, b) =>
    b.matches - a.matches || b.middleBonus - a.middleBonus ||
    a.distancePenalty - b.distancePenalty || a.holePos - b.holePos);
  const ranked: Card[] = [];
  for (const h of hyps) if (!ranked.includes(h.card)) ranked.push(h.card);
  return ranked;
}

export function checkForce(cards: Card[], forceConfigs: Card[][]): { answer: Card; alternate: Card | null } | null {
  const set = new Set(cards);
  const missing: Card[] = [];
  for (const config of forceConfigs) {
    if (cards.every((c) => config.includes(c))) {
      const m = config.find((c) => !set.has(c));
      if (m) missing.push(m);
    }
  }
  const uniq = [...new Set(missing)];
  if (!uniq.length) return null;
  return { answer: uniq[0], alternate: uniq[1] ?? null };
}

export type Mode = "ordinary" | "joker" | "block" | "force" | "repeat-king";

export interface EvalDiag {
  slot?: number;
  detail?: "exact" | "ends";
  sortedVisible?: Card[];
  permutation?: number[];
  ordinary?: Card[];
  finals?: Card[];
  color?: "black" | "red";
  rankClass?: "minor" | "major";
}

export type EvalResult =
  | { ok: true; answer: Card; alternate: Card | null; mode: Mode; diag?: EvalDiag }
  | { ok: false; error: "invalid" | "joker-order" };

// Total order on cards used by the double-tap feature: by rank (A low … K high),
// then by suit (C, H, S, D). "Lower"/"higher of the two possibilities" use this.
const RANK_VALUE: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};
const SUIT_VALUE: Record<string, number> = { C: 0, H: 1, S: 2, D: 3 };
export function cardLess(a: Card, b: Card): boolean {
  const pa = parseCard(a), pb = parseCard(b);
  if (RANK_VALUE[pa.rank] !== RANK_VALUE[pb.rank]) return RANK_VALUE[pa.rank] < RANK_VALUE[pb.rank];
  return SUIT_VALUE[pa.suit] < SUIT_VALUE[pb.suit];
}

export type SelectMode = "low" | "high";

// When the double-tap feature is active, the estimation heuristic is bypassed:
// a single tap ("low") reveals the lower of the two candidates, a double tap
// ("high") the higher. Single-candidate results are unaffected.
function finalize(result: EvalResult, select?: SelectMode): EvalResult {
  if (!select || !result.ok || result.alternate == null) return result;
  const lo = cardLess(result.answer, result.alternate) ? result.answer : result.alternate;
  const hi = result.answer === lo ? result.alternate : result.answer;
  const answer = select === "low" ? lo : hi;
  return { ...result, answer, alternate: answer === lo ? hi : lo };
}

export function evaluateGroup(
  entries: Entry[], stack: Card[], forceConfigs: Card[][],
  select?: SelectMode, suitOrder: SuitOrder = "chased",
): EvalResult {
  const pos = positionMap(stack);
  const deckSet = new Set(stack);
  const hasJoker = entries.includes("JOKER");
  const reals = entries.filter((e): e is Card => e !== "JOKER");

  if (entries.length !== 4) return { ok: false, error: "invalid" };
  if (!reals.every((c) => deckSet.has(c))) return { ok: false, error: "invalid" };

  if (hasJoker) {
    if (entries.filter((e) => e === "JOKER").length !== 1 || new Set(reals).size !== 3)
      return { ok: false, error: "invalid" };
    try {
      const { king, slot } = decodeJokerEmergency(entries, pos, suitOrder);
      return { ok: true, answer: king, alternate: null, mode: "joker", diag: { slot } };
    } catch (e) {
      return { ok: false, error: (e as Error).message === "not-ascending" ? "joker-order" : "invalid" };
    }
  }

  // Repeat-King method: four entries, three distinct (one repeated). Always
  // available, regardless of the Joker toggle.
  const distinctReals = new Set(reals).size;
  if (distinctReals === 3) return decodeRepeatKing(reals, pos);

  if (distinctReals !== 4) return { ok: false, error: "invalid" };

  // --- Phase 3 auto-detection: force list first, then stack block ---
  const force = checkForce(reals, forceConfigs);
  if (force) return finalize({ ok: true, ...force, mode: "force" }, select);

  const inputPos = reals.map((c) => pos.get(c)!);
  const exact = findExactBlocks(inputPos);
  if (exact.length === 1) {
    const answer = stack[exact[0].missingPos - 1];
    const ranked = rankedBlockCandidates(inputPos, stack);
    const alternate = ranked.find((c) => c !== answer) ?? null;
    return finalize({ ok: true, answer, alternate, mode: "block", diag: { detail: "exact" } }, select);
  }
  if (exact.length >= 2) {
    const cands = exact.map((e) => stack[e.missingPos - 1]);
    const byPos = [...cands].sort((a, b) => pos.get(a)! - pos.get(b)!);
    const total = inputPos.reduce((s, p) => s + p, 0) + 3;
    const answer = total % 2 === 0 ? byPos[0] : byPos[1];
    return finalize({
      ok: true, answer,
      alternate: answer === byPos[0] ? byPos[1] : byPos[0],
      mode: "block", diag: { detail: "ends" },
    }, select);
  }

  // --- Coded (Phase 1/2) permutation decode ---
  const sortedVisible = labelVisible(reals, pos);
  const permutation = permutationOf(reals, sortedVisible);
  const ordinary = decodeOrdinaryCandidates(permutation, suitOrder);
  const finals = applySimpleKingRule(ordinary, sortedVisible, suitOrder);
  if (finals.length === 0) return { ok: false, error: "invalid" };
  const diag: EvalDiag = { sortedVisible, permutation, ordinary, finals };
  if (finals.length === 1) return { ok: true, answer: finals[0], alternate: null, mode: "ordinary", diag };
  const { answer, alternate } = chooseWithSpacing(finals, reals, pos, 1);
  return finalize({ ok: true, answer, alternate, mode: "ordinary", diag }, select);
}

/* ---------------- parsing for setup screens ---------------- */

export const tokenizeCards = (text: string): string[] =>
  text.toUpperCase().split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)
    .map((t) => t.replace(/^T(?=[CHSD]$)/, "10"));

export function parseStackText(text: string): { stack: Card[] } | { error: string } {
  const tokens = tokenizeCards(text);
  if (tokens.length !== 52) return { error: `Expected 52 cards, found ${tokens.length}.` };
  const bad = tokens.find((t) => !(FULL_DECK as string[]).includes(t));
  if (bad) return { error: `"${bad}" isn't a valid card.` };
  if (new Set(tokens).size !== 52) return { error: "That list has a duplicate card." };
  return { stack: tokens as Card[] };
}

export function parseForceText(text: string): { configs: Card[][] } | { error: string } {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const configs: Card[][] = [];
  for (const line of lines) {
    const toks = tokenizeCards(line);
    if (toks.length !== 5) return { error: `Each line needs exactly 5 cards ("${line}" has ${toks.length}).` };
    const bad = toks.find((t) => !(FULL_DECK as string[]).includes(t));
    if (bad) return { error: `"${bad}" isn't a valid card.` };
    if (new Set(toks).size !== 5) return { error: `Duplicate card in "${line}".` };
    configs.push(toks as Card[]);
  }
  return { configs };
}

export const forceTextFrom = (configs: Card[][]): string =>
  configs.map((c) => c.join(" ")).join("\n");
