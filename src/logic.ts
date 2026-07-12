// Pure decoding logic for AI Poker. No DOM, no state — fully testable.
//
// Each entered group of four self-classifies:
//   - contains a Joker            -> joker emergency (positional King)
//   - 4-subset of a force config  -> force reveal (the fifth card)
//   - 4 of 5 consecutive in stack -> block reveal (the missing card)
//   - otherwise                   -> coded reveal (permutation + King rule)

import { FULL_DECK, type Card, type Entry } from "./stacks";

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

const SUIT_BY_FIRST_LABEL: Record<number, string> = { 1: "C", 2: "H", 3: "S", 4: "D" };
const KING_BY_LABEL: Record<number, Card> = { 1: "KC", 2: "KH", 3: "KS", 4: "KD" };
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

export function decodeOrdinaryCandidates(perm: number[]): [Card, Card] {
  const first = perm[0];
  const suit = SUIT_BY_FIRST_LABEL[first];
  const rem3 = [1, 2, 3, 4].filter((x) => x !== first);
  const row = rem3.indexOf(perm[1]);
  const rem2 = rem3.filter((x) => x !== perm[1]);
  const col = rem2.indexOf(perm[2]);
  const [a, b] = VALUE_PAIRS[row][col];
  return [`${a}${suit}` as Card, `${b}${suit}` as Card];
}

export function applySimpleKingRule(ordinary: Card[], sortedVisible: Card[]): Card[] {
  const vis = new Set(sortedVisible);
  const lbl = new Map(sortedVisible.map((c, i) => [c, i + 1]));
  const out: Card[] = [];
  for (const cand of ordinary) {
    if (!vis.has(cand)) { out.push(cand); continue; }
    const king = KING_BY_LABEL[lbl.get(cand)!];
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

function decodeJokerEmergency(entries: Entry[], pos: Map<Card, number>): { king: Card; slot: number } {
  const jIdx = entries.map((e, i) => (e === "JOKER" ? i : -1)).filter((i) => i >= 0);
  if (jIdx.length !== 1) throw new Error("count");
  const reals = entries.filter((e): e is Card => e !== "JOKER");
  if (new Set(reals).size !== 3) throw new Error("distinct");
  const rp = reals.map((c) => pos.get(c)!);
  if (!rp.every((p, i) => i === 0 || rp[i - 1] < p)) throw new Error("not-ascending");
  return { king: KING_BY_LABEL[jIdx[0] + 1], slot: jIdx[0] + 1 };
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

export type Mode = "ordinary" | "joker" | "block" | "force";

export interface EvalDiag {
  slot?: number;
  detail?: "exact" | "ends";
  sortedVisible?: Card[];
  permutation?: number[];
  ordinary?: Card[];
  finals?: Card[];
}

export type EvalResult =
  | { ok: true; answer: Card; alternate: Card | null; mode: Mode; diag?: EvalDiag }
  | { ok: false; error: "invalid" | "joker-order" };

export function evaluateGroup(entries: Entry[], stack: Card[], forceConfigs: Card[][]): EvalResult {
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
      const { king, slot } = decodeJokerEmergency(entries, pos);
      return { ok: true, answer: king, alternate: null, mode: "joker", diag: { slot } };
    } catch (e) {
      return { ok: false, error: (e as Error).message === "not-ascending" ? "joker-order" : "invalid" };
    }
  }

  if (new Set(reals).size !== 4) return { ok: false, error: "invalid" };

  // --- Phase 3 auto-detection: force list first, then stack block ---
  const force = checkForce(reals, forceConfigs);
  if (force) return { ok: true, ...force, mode: "force" };

  const inputPos = reals.map((c) => pos.get(c)!);
  const exact = findExactBlocks(inputPos);
  if (exact.length === 1) {
    const answer = stack[exact[0].missingPos - 1];
    const ranked = rankedBlockCandidates(inputPos, stack);
    const alternate = ranked.find((c) => c !== answer) ?? null;
    return { ok: true, answer, alternate, mode: "block", diag: { detail: "exact" } };
  }
  if (exact.length >= 2) {
    const cands = exact.map((e) => stack[e.missingPos - 1]);
    const byPos = [...cands].sort((a, b) => pos.get(a)! - pos.get(b)!);
    const total = inputPos.reduce((s, p) => s + p, 0) + 3;
    const answer = total % 2 === 0 ? byPos[0] : byPos[1];
    return {
      ok: true, answer,
      alternate: answer === byPos[0] ? byPos[1] : byPos[0],
      mode: "block", diag: { detail: "ends" },
    };
  }

  // --- Coded (Phase 1/2) permutation decode ---
  const sortedVisible = labelVisible(reals, pos);
  const permutation = permutationOf(reals, sortedVisible);
  const ordinary = decodeOrdinaryCandidates(permutation);
  const finals = applySimpleKingRule(ordinary, sortedVisible);
  if (finals.length === 0) return { ok: false, error: "invalid" };
  const diag: EvalDiag = { sortedVisible, permutation, ordinary, finals };
  if (finals.length === 1) return { ok: true, answer: finals[0], alternate: null, mode: "ordinary", diag };
  const { answer, alternate } = chooseWithSpacing(finals, reals, pos, 1);
  return { ok: true, answer, alternate, mode: "ordinary", diag };
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
