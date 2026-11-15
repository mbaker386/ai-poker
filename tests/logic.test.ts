import { describe, expect, it } from "vitest";
import { cardLess, decodeOrdinaryCandidates, evaluateGroup, forceTextFrom, parseForceText, parseStackText } from "../src/logic";
import { ARONSON, CHASED, DEFAULT_FORCE, FULL_DECK, MNEMONICA, NUMERICAL_SHOCKED, PARTICLE, SI_STEBBINS, SI_STEBBINS_SHOCKED, type Card, type Entry } from "../src/stacks";

const F: Card[][] = [["AC", "4H", "7S", "10D", "KC"]];
const ev = (entries: Entry[], stack: Card[] = ARONSON, force: Card[][] = F) =>
  evaluateGroup(entries, stack, force);

describe("stack validity", () => {
  const stacks: [string, Card[]][] = [
    ["Aronson", ARONSON], ["Mnemonica", MNEMONICA], ["Particle", PARTICLE],
    ["Si Stebbins (CHaSeD)", SI_STEBBINS], ["Si Stebbins (SHoCkeD)", SI_STEBBINS_SHOCKED],
    ["Numerical CHaSeD", CHASED], ["Numerical SHoCkeD", NUMERICAL_SHOCKED],
  ];
  it.each(stacks)("%s is a permutation of the 52-card deck", (_name, s) => {
    expect(s).toHaveLength(52);
    expect(new Set(s).size).toBe(52);
    for (const c of s) expect(FULL_DECK).toContain(c);
  });
  it("Si Stebbins (CHaSeD) follows +3 / CHaSeD", () => {
    expect(SI_STEBBINS.slice(0, 8)).toEqual(["AC", "4H", "7S", "10D", "KC", "3H", "6S", "9D"]);
  });
  it("Si Stebbins (SHoCkeD) follows +3 / SHoCkeD", () => {
    expect(SI_STEBBINS_SHOCKED.slice(0, 8)).toEqual(["AS", "4H", "7C", "10D", "KS", "3H", "6C", "9D"]);
  });
  it("Numerical SHoCkeD orders suits S,H,C,D within each rank", () => {
    expect(NUMERICAL_SHOCKED.slice(0, 8)).toEqual(["AS", "AH", "AC", "AD", "2S", "2H", "2C", "2D"]);
  });
  it("Mnemonica spot checks", () => {
    expect(MNEMONICA[0]).toBe("4C");
    expect(MNEMONICA[17]).toBe("KC");
    expect(MNEMONICA[22]).toBe("6H");
    expect(MNEMONICA[34]).toBe("KH");
    expect(MNEMONICA[51]).toBe("9D");
  });
  it("Particle spot checks", () => {
    expect(PARTICLE[0]).toBe("AH");
    expect(PARTICLE[25]).toBe("7S");
    expect(PARTICLE[27]).toBe("7C");
    expect(PARTICLE[49]).toBe("AS");
    expect(PARTICLE[51]).toBe("AC");
  });
  it("CHaSeD starts AC,AH,AS,AD and ends KC,KH,KS,KD", () => {
    expect(CHASED.slice(0, 4)).toEqual(["AC", "AH", "AS", "AD"]);
    expect(CHASED.slice(-4)).toEqual(["KC", "KH", "KS", "KD"]);
  });
});

describe("coded (Phase 1/2) decoding", () => {
  it("Test A: AD,4H,4C,AS -> 10H with alternate KS", () => {
    const r = ev(["AD", "4H", "4C", "AS"]);
    expect(r).toMatchObject({ ok: true, mode: "ordinary", answer: "10H", alternate: "KS" });
  });
  it("Test B: KD,9S,AH,10D -> KS", () => {
    const r = ev(["KD", "9S", "AH", "10D"]);
    expect(r).toMatchObject({ ok: true, mode: "ordinary", answer: "KS" });
  });
  it("Test C: AH,9S,7H,10D -> KS with alternate KH", () => {
    const r = ev(["AH", "9S", "7H", "10D"]);
    expect(r).toMatchObject({ ok: true, answer: "KS", alternate: "KH" });
  });
  it("Test D: AH,9S,KH,10D -> unique 7H, no alternate", () => {
    const r = ev(["AH", "9S", "KH", "10D"]);
    expect(r).toMatchObject({ ok: true, answer: "7H", alternate: null });
  });
  it("rejects a group with only two distinct cards", () => {
    // One repeat (three distinct) is now the repeat-King method; two distinct is invalid.
    expect(ev(["AS", "AS", "4H", "4H"]).ok).toBe(false);
  });
});

describe("joker emergency", () => {
  it("Test E: 9S,KD,JOKER,10D -> KS (slot 3), no alternate", () => {
    const r = ev(["9S", "KD", "JOKER", "10D"]);
    expect(r).toMatchObject({ ok: true, mode: "joker", answer: "KS", alternate: null });
  });
  it("Test F: KD,9S,JOKER,10D -> rejected, non-ascending", () => {
    const r = ev(["KD", "9S", "JOKER", "10D"]);
    expect(r).toMatchObject({ ok: false, error: "joker-order" });
  });
  it("two jokers rejected", () => {
    expect(ev(["9S", "JOKER", "JOKER", "10D"]).ok).toBe(false);
  });
});

describe("block (Phase 3) auto-detection", () => {
  it("Aronson 30-34 minus 10D -> block, answer 10D, with best-different alternate", () => {
    const r = ev(["JH", "KH", "JC", "4D"]);
    expect(r).toMatchObject({ ok: true, mode: "block", answer: "10D" });
    if (r.ok) { expect(r.alternate).not.toBeNull(); expect(r.alternate).not.toBe("10D"); }
  });
  it("four consecutive (30-33) -> ends tie-break within {4H, JH}", () => {
    const r = ev(["KH", "4D", "10D", "JC"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mode).toBe("block");
      expect(["4H", "JH"]).toContain(r.answer);
      expect(["4H", "JH"]).toContain(r.alternate);
      expect(r.answer).not.toBe(r.alternate);
    }
  });
  it("interior gap after first card (30,32,33,34) -> 4D", () => {
    const r = ev(["KH", "10D", "JC", "JH"]);
    expect(r).toMatchObject({ ok: true, mode: "block", answer: "4D" });
  });
  it("Mnemonica exact middle (2,3,4,6) -> 4H", () => {
    const r = ev(["2H", "7D", "3C", "6D"], MNEMONICA);
    expect(r).toMatchObject({ ok: true, mode: "block", answer: "4H" });
  });
  it("wrap-around block: CHaSeD 51,52,1,2 + missing 1st? KS,KD,AH,AS -> AC", () => {
    const r = ev(["KS", "KD", "AH", "AS"], CHASED);
    expect(r).toMatchObject({ ok: true, mode: "block", answer: "AC" });
  });
  it("two separated gaps is NOT a block -> coded", () => {
    const r = ev(["KH", "4D", "JH", "10C"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe("ordinary");
  });
});

describe("force list", () => {
  const five: Card[] = ["AC", "4H", "7S", "10D", "KC"];
  it.each([0, 1, 2, 3, 4])("leave-one-out %i reveals the missing card", (i) => {
    const four = five.filter((_, j) => j !== i);
    const r = ev(four);
    expect(r).toMatchObject({ ok: true, mode: "force", answer: five[i] });
  });
  it("with empty force list, same input is neither force nor block", () => {
    const r = ev(["AC", "4H", "7S", "KC"], ARONSON, []);
    if (r.ok) expect(["force", "block"]).not.toContain(r.mode);
  });
  it("default force config never forms a stack block in any built-in stack", () => {
    for (const stack of [ARONSON, MNEMONICA, PARTICLE, CHASED]) {
      for (let i = 0; i < 5; i++) {
        const four = five.filter((_, j) => j !== i);
        const r = evaluateGroup(four, stack, []);
        if (r.ok) expect(r.mode).not.toBe("block");
      }
    }
  });
  it("force takes precedence over stack blocks", () => {
    // Craft a stack where the force cards ARE consecutive, then confirm force still wins.
    const rest = FULL_DECK.filter((c) => !five.includes(c));
    const crafted = [...five, ...rest];
    const r = evaluateGroup(["AC", "4H", "7S", "10D"], crafted, F);
    expect(r).toMatchObject({ ok: true, mode: "force", answer: "KC" });
  });
});

describe("default force list (v1.1 — four configs)", () => {
  it("every default config resolves to its held-out fifth card", () => {
    for (const config of DEFAULT_FORCE) {
      for (let i = 0; i < 5; i++) {
        const four = config.filter((_, j) => j !== i) as Card[];
        const r = evaluateGroup(four, ARONSON, DEFAULT_FORCE);
        expect(r).toMatchObject({ ok: true, mode: "force", answer: config[i] });
      }
    }
  });
  it("no two default configs share four cards (no ambiguous subset)", () => {
    for (let a = 0; a < DEFAULT_FORCE.length; a++) {
      for (let b = a + 1; b < DEFAULT_FORCE.length; b++) {
        const shared = DEFAULT_FORCE[a].filter((c) => DEFAULT_FORCE[b].includes(c));
        expect(shared.length).toBeLessThan(4);
      }
    }
  });
});

describe("SHoCkeD encoding", () => {
  it("first-card suit map differs: label 1 = ♣ (CHaSeD) vs ♠ (SHoCkeD)", () => {
    // perm [1,2,3,4] -> pair A/7 on the label-1 suit
    expect(decodeOrdinaryCandidates([1, 2, 3, 4], "chased")).toEqual(["AC", "7C"]);
    expect(decodeOrdinaryCandidates([1, 2, 3, 4], "shocked")).toEqual(["AS", "7S"]);
  });
  it("labels 2 and 4 are ♥ and ♦ in both orders; label 3 swaps ♠↔♣", () => {
    expect(decodeOrdinaryCandidates([2, 1, 3, 4], "chased")[0].slice(-1)).toBe("H");
    expect(decodeOrdinaryCandidates([2, 1, 3, 4], "shocked")[0].slice(-1)).toBe("H");
    expect(decodeOrdinaryCandidates([3, 1, 2, 4], "chased")[0].slice(-1)).toBe("S");
    expect(decodeOrdinaryCandidates([3, 1, 2, 4], "shocked")[0].slice(-1)).toBe("C");
  });
  it("joker slot 3 names K♠ under CHaSeD, K♣ under SHoCkeD", () => {
    const chased = evaluateGroup(["9S", "KD", "JOKER", "10D"], ARONSON, F, undefined, "chased");
    const shocked = evaluateGroup(["9S", "KD", "JOKER", "10D"], ARONSON, F, undefined, "shocked");
    expect(chased).toMatchObject({ ok: true, answer: "KS" });
    expect(shocked).toMatchObject({ ok: true, answer: "KC" });
  });
});

describe("repeat-King method (three distinct + one repeat)", () => {
  // Aronson positions: AS=6 (A), 3H=7 (B), 6C=8 (C).
  it.each([
    [["AS", "3H", "6C", "AS"], "KC"], // A,B,C  black+minor
    [["AS", "6C", "3H", "AS"], "KS"], // A,C,B  black+major
    [["3H", "AS", "6C", "3H"], "KD"], // B,A,C  red+minor
    [["3H", "6C", "AS", "3H"], "KH"], // B,C,A  red+major
  ] as [string[], string][])("%j -> %s", (entries, king) => {
    const r = evaluateGroup(entries as Card[], ARONSON, F);
    expect(r).toMatchObject({ ok: true, mode: "repeat-king", answer: king, alternate: null });
  });
  it("the repeated card's identity does not matter (order of the three does)", () => {
    for (const rep of ["AS", "3H", "6C"]) {
      const r = evaluateGroup(["AS", "3H", "6C", rep] as Card[], ARONSON, F);
      expect(r).toMatchObject({ ok: true, mode: "repeat-king", answer: "KC" });
    }
  });
  it("first card = highest position is not a valid code -> invalid", () => {
    const r = evaluateGroup(["6C", "AS", "3H", "6C"], ARONSON, F);
    expect(r.ok).toBe(false);
  });
  it("is detected even when the three cards are consecutive in the stack", () => {
    // AS,3H,6C are Aronson 6,7,8 — repeat shape wins over block detection.
    const r = evaluateGroup(["AS", "3H", "6C", "AS"], ARONSON, F);
    if (r.ok) expect(r.mode).toBe("repeat-king");
  });
  it("four distinct cards are NOT treated as repeat-King", () => {
    const r = evaluateGroup(["AS", "3H", "6C", "9D"], ARONSON, F);
    if (r.ok) expect(r.mode).not.toBe("repeat-king");
  });
});

describe("double-tap selection (low / high)", () => {
  it("cardLess orders by rank, then suit", () => {
    expect(cardLess("10H", "KS")).toBe(true); // 10 < K
    expect(cardLess("AC", "7C")).toBe(true);  // A < 7
    expect(cardLess("KH", "KS")).toBe(true);  // rank tie, H before S
  });
  it("picks the lower / higher of the two coded candidates", () => {
    // AD,4H,4C,AS on Aronson yields candidates {10H, KS}
    const lo = evaluateGroup(["AD", "4H", "4C", "AS"], ARONSON, F, "low");
    const hi = evaluateGroup(["AD", "4H", "4C", "AS"], ARONSON, F, "high");
    expect(lo).toMatchObject({ ok: true, answer: "10H", alternate: "KS" });
    expect(hi).toMatchObject({ ok: true, answer: "KS", alternate: "10H" });
  });
  it("leaves single-candidate results unchanged", () => {
    const r = evaluateGroup(["AH", "9S", "KH", "10D"], ARONSON, F, "high");
    expect(r).toMatchObject({ ok: true, answer: "7H", alternate: null });
  });
});

describe("misclassification rate", () => {
  it("random 4-card draws read as block well under 0.1%", () => {
    let blocks = 0;
    const total = 20000;
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < total; t++) {
      const idx = new Set<number>();
      while (idx.size < 4) idx.add(Math.floor(rnd() * 52));
      const cards = [...idx].map((i) => ARONSON[i]);
      const r = evaluateGroup(cards, ARONSON, []);
      if (r.ok && r.mode === "block") blocks++;
    }
    expect(blocks / total).toBeLessThan(0.001);
  });
});

describe("parsers", () => {
  it("parseStackText accepts commas/spaces/newlines and T-notation", () => {
    const text = ARONSON.join(", ").replace("10S", "TS");
    const parsed = parseStackText(text);
    expect("stack" in parsed && parsed.stack).toEqual(ARONSON);
  });
  it("parseStackText rejects wrong count, bad card, duplicate", () => {
    expect("error" in parseStackText("AS KH")).toBe(true);
    expect("error" in parseStackText(ARONSON.join(" ").replace("9D", "9X"))).toBe(true);
    expect("error" in parseStackText(ARONSON.join(" ").replace("9D", "JS"))).toBe(true);
  });
  it("parseForceText round-trips through forceTextFrom", () => {
    const parsed = parseForceText("AC 4H 7S 10D KC\n2C 3D 4S 5H 6C");
    expect("configs" in parsed).toBe(true);
    if ("configs" in parsed) {
      expect(parsed.configs).toHaveLength(2);
      expect(forceTextFrom(parsed.configs)).toBe("AC 4H 7S 10D KC\n2C 3D 4S 5H 6C");
    }
  });
  it("parseForceText rejects short lines and duplicates", () => {
    expect("error" in parseForceText("AC 4H 7S")).toBe(true);
    expect("error" in parseForceText("AC AC 7S 10D KC")).toBe(true);
  });
});
