// Embedded self-tests, runnable from the setup screen as a rehearsal aid.

import { evaluateGroup } from "./logic";
import { ARONSON, CHASED, FULL_DECK, MNEMONICA, PARTICLE, type Card, type Entry } from "./stacks";

export interface SelfTestResult { pass: number; fail: number; total: number; lines: string[] }

export function runSelfTests(): SelfTestResult {
  const F: Card[][] = [["AC", "4H", "7S", "10D", "KC"]];
  const lines: string[] = [];
  let pass = 0, fail = 0;
  const t = (n: string, c: boolean) => { if (c) pass++; else { fail++; lines.push("FAIL " + n); } };

  for (const s of [ARONSON, MNEMONICA, PARTICLE, CHASED])
    t("stack", s.length === 52 && new Set(s).size === 52 && s.every((c) => FULL_DECK.includes(c)));

  const ev = (e: Entry[]) => evaluateGroup(e, ARONSON, F);
  let r = ev(["AD", "4H", "4C", "AS"]);
  t("A", r.ok && r.mode === "ordinary" && r.answer === "10H" && r.alternate === "KS");
  r = ev(["KD", "9S", "AH", "10D"]);
  t("B", r.ok && r.mode === "ordinary" && r.answer === "KS");
  r = ev(["AH", "9S", "7H", "10D"]);
  t("C", r.ok && r.answer === "KS" && r.alternate === "KH");
  r = ev(["AH", "9S", "KH", "10D"]);
  t("D", r.ok && r.answer === "7H" && r.alternate === null);
  r = ev(["9S", "KD", "JOKER", "10D"]);
  t("E", r.ok && r.mode === "joker" && r.answer === "KS");
  r = ev(["KD", "9S", "JOKER", "10D"]);
  t("F", !r.ok && r.error === "joker-order");
  r = ev(["AS", "AS", "4H", "4C"]);
  t("dup", !r.ok);
  r = ev(["JH", "KH", "JC", "4D"]);
  t("block", r.ok && r.mode === "block" && r.answer === "10D");
  r = ev(["KH", "4D", "10D", "JC"]);
  t("ends", r.ok && r.mode === "block" && ["4H", "JH"].includes(r.answer));
  r = ev(["AC", "4H", "7S", "KC"]);
  t("force", r.ok && r.mode === "force" && r.answer === "10D");

  return { pass, fail, total: pass + fail, lines };
}
