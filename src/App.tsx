import { Component, Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  evaluateGroup, formatFull, isRed, parseCard, parseForceText, parseStackText,
  forceTextFrom, type EvalResult,
} from "./logic";
import { runSelfTests, type SelfTestResult } from "./selftest";
import { decodeSettings, encodeSettings, loadSettings, saveSettings, type Settings } from "./settings";
import { ARONSON, RANKS, STACKS, SUITS, type Card, type Entry } from "./stacks";
import { version as APP_VERSION } from "../package.json";

/* ---------------- audience-facing copy ---------------- */

const SUIT_SYMBOL: Record<string, string> = { C: "♣", H: "♥", S: "♠", D: "♦" };

// Display order of the suit buttons only; the encoding is always CHaSeD.
const SUIT_ORDERS: Record<string, readonly string[]> = {
  chased: ["C", "H", "S", "D"],
  shocked: ["S", "H", "C", "D"],
};

const NO_SCRIPTS = [
  "I’m sorry, I got distracted by a hilarious meme on Instagram. Your hole card is actually the",
  "I’m sorry, I got distracted by a cat video on TikTok. Your hole card is actually the",
  "I’m sorry, I got distracted learning a new magic trick on YouTube. Your hole card is actually the",
];
const NO_ALT = {
  ordinary: "I may have misunderstood one of the card names. Please enter all four cards again.",
  joker: "I may have misread that unusual card. Please enter the four entries again.",
};
const INVALID_MSG =
  "I didn’t understand four distinct complete card entries. Please enter all four again, including both rank and suit.";

const MODE_LABEL: Record<string, string> = {
  ordinary: "Phase 1/2 · coded order",
  joker: "Phase 1/2 · joker emergency",
  block: "Phase 3 · stack block",
  force: "Phase 3 · force list",
  "repeat-king": "King · three-card repeat",
};

type Phase = "collecting" | "reveal" | "correction" | "reenter";
interface Pending { rank: string | null; suit: string | null }
const NO_PENDING: Pending = { rank: null, suit: null };

/* ---------------- main app ---------------- */

function AIPokerApp() {
  const init = useMemo(loadSettings, []);

  const [stackId, setStackId] = useState(init.stackId);
  const [customStack, setCustomStack] = useState<Card[] | null>(init.customStack);
  const [customName, setCustomName] = useState(init.customName);
  const [forceConfigs, setForceConfigs] = useState<Card[][]>(init.forceConfigs);
  const [jokerEnabled, setJokerEnabled] = useState(init.jokerEnabled);
  const [doubleTap, setDoubleTap] = useState(init.doubleTap);
  const [suitOrder, setSuitOrder] = useState(init.suitOrder);
  const [diagnostics, setDiagnostics] = useState(init.diagnostics);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, setPending] = useState<Pending>(NO_PENDING);
  const [phase, setPhase] = useState<Phase>("collecting");
  const [result, setResult] = useState<EvalResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [noCount, setNoCount] = useState(0);
  const [correctionScript, setCorrectionScript] = useState(NO_SCRIPTS[0]);
  const [reenterMsg, setReenterMsg] = useState(NO_ALT.ordinary);

  const [setupOpen, setSetupOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(init.customStack?.join(" ") ?? "");
  const [customError, setCustomError] = useState<string | null>(null);
  const [forceDraft, setForceDraft] = useState(forceTextFrom(init.forceConfigs));
  const [forceError, setForceError] = useState<string | null>(null);
  const [importDraft, setImportDraft] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [setupNote, setSetupNote] = useState<string | null>(null);
  const [selfTest, setSelfTest] = useState<SelfTestResult | null>(null);

  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // double-tap window
  const aaaCount = useRef(0); // consecutive bare-A taps for the hidden setup gesture

  const builtIn = STACKS.find((s) => s.id === stackId);
  const activeStack = builtIn ? builtIn.cards : (customStack || ARONSON);
  const activeStackName = builtIn ? builtIn.name : customName;

  const currentSettings = (): Settings =>
    ({ stackId, customStack, customName, forceConfigs, jokerEnabled, doubleTap, suitOrder, diagnostics });

  // Persist settings whenever they change.
  useEffect(() => {
    saveSettings({ stackId, customStack, customName, forceConfigs, jokerEnabled, doubleTap, suitOrder, diagnostics });
  }, [stackId, customStack, customName, forceConfigs, jokerEnabled, doubleTap, suitOrder, diagnostics]);

  const flash = useCallback((text: string) => {
    setMessage(text);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  const note = useCallback((text: string) => {
    setSetupNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setSetupNote(null), 2500);
  }, []);

  useEffect(() => () => {
    [clearTimer, msgTimer, noteTimer, revealTimer].forEach((r) => { if (r.current) clearTimeout(r.current); });
  }, []);

  const slotsFull = entries.length >= 4;
  const jokerInGroup = entries.includes("JOKER");

  const commit = useCallback((card: Entry) => {
    aaaCount.current = 0;
    setEntries((prev) => {
      if (prev.length >= 4) return prev;
      if (card !== "JOKER" && prev.includes(card)) {
        // Allow one repeat as the fourth entry (the repeat-King method): three
        // distinct real cards already down, and this duplicates one of them.
        const fourthRepeat = prev.length === 3 && new Set(prev).size === 3 && !prev.includes("JOKER");
        if (!fourthRepeat) {
          flash(`${formatFull(card as Card)} is already in. Backspace to change it.`);
          return prev;
        }
      }
      return [...prev, card];
    });
    setPending(NO_PENDING);
  }, [flash]);

  const handleRank = (r: string) => {
    if (phase !== "collecting" || slotsFull) return;
    // Hidden setup gesture: three A taps in a row (no suit in between).
    if (r === "A" && !pending.suit) {
      aaaCount.current += 1;
      if (aaaCount.current >= 3) {
        aaaCount.current = 0;
        setPending(NO_PENDING);
        setSetupOpen(true);
        return;
      }
      setPending({ rank: "A", suit: null });
      return;
    }
    aaaCount.current = 0;
    if (pending.suit) { commit((r + pending.suit) as Card); return; }
    setPending({ rank: r, suit: null });
  };
  const handleSuit = (s: string) => {
    if (phase !== "collecting" || slotsFull) return;
    aaaCount.current = 0;
    if (pending.rank) { commit((pending.rank + s) as Card); return; }
    setPending({ rank: null, suit: s });
  };
  const handleJoker = () => {
    if (phase !== "collecting" || !jokerEnabled || slotsFull) return;
    if (jokerInGroup) { flash("Only one joker per group."); return; }
    commit("JOKER");
  };
  const backspace = () => {
    if (phase !== "collecting") return;
    aaaCount.current = 0;
    if (pending.rank || pending.suit) { setPending(NO_PENDING); return; }
    setEntries((prev) => prev.slice(0, -1));
  };
  const clearAll = () => {
    if (phase !== "collecting") return;
    aaaCount.current = 0;
    if (!confirmClear) {
      setConfirmClear(true);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setConfirmClear(false), 2500);
      return;
    }
    setConfirmClear(false);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setEntries([]); setPending(NO_PENDING);
  };

  const revealValid = entries.length === 4;
  const doReveal = (select?: "low" | "high") => {
    aaaCount.current = 0;
    const r = evaluateGroup(entries, activeStack, forceConfigs, select, suitOrder);
    if (!r.ok) {
      flash(r.error === "joker-order" ? NO_ALT.joker : INVALID_MSG);
      setEntries([]); setPending(NO_PENDING);
      return;
    }
    setResult(r); setPhase("reveal");
  };
  // Double-tap feature: one tap reveals the lower candidate, two the higher.
  // When off, a tap reveals immediately with the estimation heuristic.
  const onRevealTap = () => {
    if (phase !== "collecting" || !revealValid) return;
    if (!doubleTap) { doReveal(); return; }
    if (revealTimer.current) {
      clearTimeout(revealTimer.current);
      revealTimer.current = null;
      doReveal("high");
    } else {
      revealTimer.current = setTimeout(() => {
        revealTimer.current = null;
        doReveal("low");
      }, 280);
    }
  };
  const nextGroup = () => {
    setEntries([]); setPending(NO_PENDING); setResult(null); setPhase("collecting");
  };
  const onCorrect = () => nextGroup();
  const onNo = () => {
    if (result?.ok && result.alternate) {
      setCorrectionScript(NO_SCRIPTS[noCount % 3]);
      setNoCount((n) => n + 1);
      setPhase("correction");
      return;
    }
    setReenterMsg(result?.ok && result.mode === "joker" ? NO_ALT.joker : NO_ALT.ordinary);
    setPhase("reenter");
  };
  const onContinue = () => nextGroup();
  const resetPerformance = () => { setNoCount(0); nextGroup(); };

  /* ---------------- setup actions ---------------- */

  const applyCustom = () => {
    const parsed = parseStackText(customDraft);
    if ("error" in parsed) { setCustomError(parsed.error); return; }
    setCustomStack(parsed.stack); setStackId("custom"); setCustomError(null);
    note("Saved.");
  };
  const applyForce = () => {
    const parsed = parseForceText(forceDraft);
    if ("error" in parsed) { setForceError(parsed.error); return; }
    setForceConfigs(parsed.configs); setForceError(null);
    note("Saved.");
  };
  const copyBackup = async () => {
    const code = encodeSettings(currentSettings());
    try {
      await navigator.clipboard.writeText(code);
      note("Backup code copied.");
    } catch {
      setImportDraft(code);
      note("Copy the code from the box below.");
    }
  };
  const doImport = () => {
    const decoded = decodeSettings(importDraft);
    if ("error" in decoded) { setImportError(decoded.error); return; }
    const s = decoded.settings;
    setStackId(s.stackId);
    setCustomStack(s.customStack);
    setCustomName(s.customName);
    setForceConfigs(s.forceConfigs);
    setJokerEnabled(s.jokerEnabled);
    setDoubleTap(s.doubleTap);
    setSuitOrder(s.suitOrder);
    setCustomDraft(s.customStack?.join(" ") ?? "");
    setForceDraft(forceTextFrom(s.forceConfigs));
    setImportError(null); setImportDraft("");
    note("Imported.");
  };

  const liveEval = useMemo<EvalResult | null>(() => {
    if (entries.length !== 4) return null;
    return evaluateGroup(entries, activeStack, forceConfigs, undefined, suitOrder);
  }, [entries, activeStack, forceConfigs, suitOrder]);

  /* ---------------- render ---------------- */

  return (
    <div className="aip-root">
      {/* ---------- audience screen ---------- */}
      <header className="aip-head">
        <h1 className="aip-title">AI&nbsp;Poker</h1>
        <div className="aip-rule" aria-hidden><span className="aip-rule-gem">♦</span></div>
      </header>

      <section className="aip-slots">
        {[0, 1, 2, 3].map((i) => {
          const e = entries[i];
          const isPendingSlot = i === entries.length && (pending.rank || pending.suit);
          if (e === "JOKER") {
            return <div key={i} className="aip-slot filled joker"><span className="aip-joker-label">JOKER</span></div>;
          }
          if (e) {
            const { rank, suit } = parseCard(e);
            return (
              <div key={i} className="aip-slot filled">
                <span className="aip-slot-rank">{rank}</span>
                <span className={"aip-slot-suit" + (isRed(suit) ? " red" : "")}>{SUIT_SYMBOL[suit]}</span>
              </div>
            );
          }
          if (isPendingSlot) {
            return (
              <div key={i} className="aip-slot pending">
                <span className="aip-slot-rank dim">{pending.rank || "·"}</span>
                <span className={"aip-slot-suit dim" + (pending.suit && isRed(pending.suit) ? " red" : "")}>
                  {pending.suit ? SUIT_SYMBOL[pending.suit] : ""}
                </span>
              </div>
            );
          }
          return <div key={i} className="aip-slot empty" />;
        })}
      </section>

      <div className="aip-msg-wrap">
        {message
          ? <div className="aip-msg">{message}</div>
          : (entries.length === 0 && phase === "collecting"
            ? <div className="aip-begin">Let’s begin.</div>
            : <div className="aip-msg-spacer" />)}
      </div>

      {/* ---------- keypad ---------- */}
      <section className="aip-pad">
        <div className="aip-ranks">
          {RANKS.map((r) => (
            <button key={r} className="aip-key rank" onClick={() => handleRank(r)}
              disabled={phase !== "collecting" || slotsFull}>{r}</button>
          ))}
          {jokerEnabled && (
            <button key="JOKER" className="aip-key joker-rank" onClick={handleJoker}
              disabled={phase !== "collecting" || slotsFull}>JOKER</button>
          )}
        </div>

        <div className="aip-suits">
          {(SUIT_ORDERS[suitOrder] ?? SUITS).map((s) => (
            <button key={s} className={"aip-key suit" + (isRed(s) ? " red" : "")}
              onClick={() => handleSuit(s)}>{SUIT_SYMBOL[s]}</button>
          ))}
        </div>

        <div className="aip-edit">
          <button className="aip-key edit" onClick={backspace}
            disabled={phase !== "collecting" || (entries.length === 0 && !pending.rank && !pending.suit)}>⌫</button>
          <button className={"aip-key edit" + (confirmClear ? " warn" : "")} onClick={clearAll}
            disabled={phase !== "collecting" || entries.length === 0}>
            {confirmClear ? "Clear all?" : "Clear"}
          </button>
        </div>
        <button className="aip-key reveal" onClick={onRevealTap}
          disabled={!revealValid || phase !== "collecting"}>Reveal</button>
      </section>

      {/* ---------- rehearsal diagnostics ---------- */}
      {diagnostics && (
        <div className="aip-diag">
          <div className="aip-diag-tag">REHEARSAL — not shown to the audience</div>
          <div className="aip-diag-row"><b>Stack</b> {activeStackName} · <b>force configs</b> {forceConfigs.length}</div>
          <DiagBody entries={entries} evalR={phase !== "collecting" ? result : liveEval} />
          {result?.ok && phase !== "collecting" && (
            <div className="aip-diag-row">
              <b>Answer</b> {formatFull(result.answer)}
              {result.alternate ? ` · alt ${formatFull(result.alternate)}` : " · no alt"}
            </div>
          )}
        </div>
      )}

      {/* ---------- reveal overlay ---------- */}
      {(phase === "reveal" || phase === "correction" || phase === "reenter") && (
        <div className="aip-overlay" role="dialog" aria-modal>
          {phase === "reveal" && result?.ok && (
            <>
              <p className="aip-reveal">
                The hole card is the <span className="aip-cardname">{formatFull(result.answer)}</span>.
              </p>
              <div className="aip-verdict">
                <button className="aip-vbtn correct" onClick={onCorrect}>Correct</button>
                <button className="aip-vbtn no" onClick={onNo}>No</button>
              </div>
            </>
          )}
          {phase === "correction" && result?.ok && (
            <>
              <p className="aip-correction">
                {correctionScript} <span className="aip-cardname">{formatFull(result.alternate)}</span>.
              </p>
              <div className="aip-verdict">
                <button className="aip-vbtn correct" onClick={onContinue}>Continue</button>
              </div>
            </>
          )}
          {phase === "reenter" && (
            <>
              <p className="aip-correction">{reenterMsg}</p>
              <div className="aip-verdict">
                <button className="aip-vbtn correct" onClick={onContinue}>Enter again</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------- hidden setup ---------- */}
      {setupOpen && (
        <div className="aip-setup" role="dialog" aria-modal>
          <div className="aip-setup-card">
            <div className="aip-setup-head">
              <span>Setup</span>
              <button className="aip-x" onClick={() => setSetupOpen(false)}>Close</button>
            </div>

            <div className="aip-setup-body">
            {setupNote && <div className="aip-note">{setupNote}</div>}

            <div className="aip-field">
              <label>Reference stack</label>
              <div className="aip-seg">
                {STACKS.map((s) => (
                  <button key={s.id} className={"aip-segbtn" + (stackId === s.id ? " on" : "")}
                    onClick={() => setStackId(s.id)}>{s.name}</button>
                ))}
                <button className={"aip-segbtn" + (stackId === "custom" ? " on" : "")}
                  disabled={!customStack} onClick={() => setStackId("custom")}>
                  {customStack ? customName : "Custom"}
                </button>
              </div>
            </div>

            <div className="aip-field">
              <label>Load a custom stack (52 cards, any separators — e.g. <code>AS, KH, 10D, 2C …</code>)</label>
              <input className="aip-input" placeholder="Optional name" value={customName}
                onChange={(e) => setCustomName(e.target.value)} />
              <textarea className="aip-textarea" rows={4} placeholder="Paste 52 cards…" value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)} />
              {customError && <div className="aip-err">{customError}</div>}
              <button className="aip-setup-action" onClick={applyCustom}>Load stack</button>
            </div>

            <div className="aip-field">
              <label>Force list — one configuration per line, five cards each. A group of four entries matching any line reveals the fifth card. Leave empty for none.</label>
              <textarea className="aip-textarea" rows={2} placeholder="e.g. AC 4H 7S 10D KC" value={forceDraft}
                onChange={(e) => setForceDraft(e.target.value)} />
              {forceError && <div className="aip-err">{forceError}</div>}
              <button className="aip-setup-action" onClick={applyForce}>Save force list</button>
            </div>

            <div className="aip-field">
              <label>Backup — copy a code that captures your stack, force list, and settings; paste one below to restore or to clone another performer’s setup.</label>
              <button className="aip-setup-action" onClick={copyBackup}>Copy backup code</button>
              <textarea className="aip-textarea" rows={2} placeholder="Paste a backup code…" value={importDraft}
                onChange={(e) => setImportDraft(e.target.value)} />
              {importError && <div className="aip-err">{importError}</div>}
              <button className="aip-setup-action" onClick={doImport}>Import</button>
            </div>

            <div className="aip-field row">
              <label>Joker button</label>
              <Toggle on={jokerEnabled} set={setJokerEnabled} label="Joker button" />
            </div>
            <div className="aip-field row">
              <label>Double-tap Reveal (one tap = lower card, two taps = higher)</label>
              <Toggle on={doubleTap} set={setDoubleTap} label="Double-tap Reveal" />
            </div>
            <div className="aip-field row">
              <label>Suit buttons in SHoCkeD order (♠ ♥ ♣ ♦)</label>
              <Toggle on={suitOrder === "shocked"} set={(v) => setSuitOrder(v ? "shocked" : "chased")} label="SHoCkeD suit order" />
            </div>
            <div className="aip-field row">
              <label>Rehearsal diagnostics</label>
              <Toggle on={diagnostics} set={setDiagnostics} label="Rehearsal diagnostics" />
            </div>

            <div className="aip-field">
              <button className="aip-setup-action" onClick={() => { resetPerformance(); setSetupOpen(false); }}>
                Reset performance
              </button>
              <button className="aip-setup-action ghost" onClick={() => setSelfTest(runSelfTests())}>
                Run self-tests
              </button>
              {selfTest && (
                <div className={"aip-test" + (selfTest.fail ? " bad" : " good")}>
                  {selfTest.pass}/{selfTest.total} passed{selfTest.fail ? " — " + selfTest.lines.join(", ") : ""}
                </div>
              )}
            </div>

            <p className="aip-setup-note">
              To open this later: tap A three times in a row (with no suit in between). · v{APP_VERSION}
            </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label?: string }) {
  return (
    <button className={"aip-toggle" + (on ? " on" : "")} onClick={() => set(!on)}
      role="switch" aria-checked={on} aria-label={label}>
      <span className="aip-knob" />
    </button>
  );
}

function DiagBody({ entries, evalR }: { entries: Entry[]; evalR: EvalResult | null }) {
  if (entries.length !== 4 || !evalR) {
    return <div className="aip-diag-row aip-dim">Enter four items to see the decode.</div>;
  }
  if (!evalR.ok) return <div className="aip-diag-row aip-dim">Would reject: {evalR.error}</div>;
  const modeLine = (
    <div className="aip-diag-row">
      <b>Detected</b> {MODE_LABEL[evalR.mode]}{evalR.diag?.detail ? ` (${evalR.diag.detail})` : ""}
    </div>
  );
  if (evalR.mode === "joker") {
    return <>{modeLine}<div className="aip-diag-row">Joker slot {evalR.diag?.slot} → {formatFull(evalR.answer)}</div></>;
  }
  if (evalR.mode === "block" || evalR.mode === "force") {
    return <>{modeLine}<div className="aip-diag-row">Missing card → {formatFull(evalR.answer)}</div></>;
  }
  if (evalR.mode === "repeat-king") {
    return <>{modeLine}<div className="aip-diag-row">{evalR.diag?.color} · {evalR.diag?.rankClass} → {formatFull(evalR.answer)}</div></>;
  }
  const d = evalR.diag ?? {};
  const labels = (d.sortedVisible ?? []).map((c, i) => `${c}=${i + 1}`).join("  ");
  return (
    <>
      {modeLine}
      <div className="aip-diag-row"><b>Labels</b> {labels}</div>
      <div className="aip-diag-row">
        <b>Perm</b> {(d.permutation ?? []).join("")} · <b>pair</b> {(d.ordinary ?? []).join(" / ")} · <b>finals</b> {(d.finals ?? []).join(" / ")}
      </div>
    </>
  );
}

/* Error boundary: a render crash degrades to a calm, recoverable screen
   instead of blanking the whole app mid-performance. */
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; key: number }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, key: 0 };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="aip-crash">
          <p>Let me reset the display.</p>
          <button onClick={() => this.setState((s) => ({ hasError: false, key: s.key + 1 }))}>Restart</button>
        </div>
      );
    }
    return <Fragment key={this.state.key}>{this.props.children}</Fragment>;
  }
}

export default function AIPoker() {
  return (
    <ErrorBoundary>
      <AIPokerApp />
    </ErrorBoundary>
  );
}
