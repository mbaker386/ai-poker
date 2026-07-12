# AI Poker

A performance prop for card magic: a sleek dark-casino web app that plays the
role of a card-reading AI. The spectator sees an elegant machine that studies
four cards and names a hidden fifth. The performer sees nothing on screen that
betrays the method.

> **Note.** This README, and the source code, necessarily describe the method.
> If this repository is public, anyone can read it. The deployed app itself
> shows nothing.

---

## Performing

### The screen

Ranks A–K, suits ♣ ♥ ♠ ♦, an optional **JOKER** button, backspace, **Clear**
(asks twice), and a gold **Reveal** button that lights when four entries are in.
Cards can be entered rank-then-suit or suit-then-rank, one-handed.

After **Reveal**, the machine names a card. Tap **Correct** to continue to a
fresh group, or **No** for the machine's charming self-correction ("I'm sorry,
I got distracted by a hilarious meme on Instagram…"), which names the stored
second candidate. The excuses rotate: Instagram → TikTok → YouTube → repeat.
If a reveal has no second candidate, **No** instead asks for the group to be
re-entered — in character, blaming its own hearing.

### How each group is read

There are no rounds. Every group of four self-classifies, checked in this
order:

1. **Joker emergency.** A group containing one Joker plus three cards entered
   in ascending stack order names a King: the Joker's slot (1–4) gives the
   suit in CHaSeD order (♣ ♥ ♠ ♦). Any other Joker arrangement is rejected in
   character.
2. **Force reveal.** If the four cards are four of the five in any line of the
   force list, the answer is the fifth card of that line. Default force list:
   `AC 4H 7S 10D KC`.
3. **Block reveal.** If the four cards occupy four of five *cyclically
   consecutive* positions in the active stack — either four straight cards, or
   four with a single interior gap — the answer is the missing card. Best
   practice: have the spectator remove one of the **middle three** of five
   consecutive cards, which makes the answer unique. If they take an end card
   (four straight cards remain), the machine picks between predecessor and
   successor by a parity rule; press **No** to flip to the other.
4. **Coded reveal.** Otherwise the entry *order* of the four cards encodes
   the hole card (see below).

### The coded order (Phase 1/2)

Sort the four visible cards by stack position; call them 1, 2, 3, 4 (lowest
position = 1). Enter them in the order that encodes the target:

- **First entry** = suit, in CHaSeD order: label 1 → ♣, 2 → ♥, 3 → ♠, 4 → ♦.
- **Second and third entries** select a rank pair from the remaining three
  labels (in increasing label order, `low/mid/high` = the three unused labels):

  | 2nd entry | 3rd entry | pair    |
  |-----------|-----------|---------|
  | low       | mid       | A / 7   |
  | low       | high      | 2 / 8   |
  | mid       | low       | 3 / 9   |
  | mid       | high      | 4 / 10  |
  | high      | low       | 5 / J   |
  | high      | mid       | 6 / Q   |

- The machine chooses between the two pair-mates by a spacing heuristic on
  stack positions (the candidate that fills the largest gap among the four
  visible cards more evenly wins). When spectators draw from five different
  parts of a spread, this guess is right more often than not; when it's wrong,
  **No** delivers the correction bit.
- **Kings** are reached by the Simple King Rule: to name a King, encode a card
  that is *already visible on the table*; the machine then substitutes the
  King whose CHaSeD index matches that card's label (label 1 → K♣, 2 → K♥,
  3 → K♠, 4 → K♦). If exactly one of the two decoded pair-mates is visible,
  the answer is unique and **No** asks for re-entry.

### The secret setup screen

Tap **A three times in a row** (no suit in between). Entering a real Ace
(A then a suit) never triggers it. Inside:

- **Reference stack** — Aronson (default), Mnemonica, Particle,
  Numerical-CHaSeD (A♣ A♥ A♠ A♦ 2♣ … K♠ K♦), or a pasted custom stack.
  Selection takes effect immediately; **Close** is enough.
- **Custom stack** — paste 52 cards in compact notation (`AS, KH, 10D, 2C …`
  or `TD` for ten), any separators. Validated as a true permutation.
- **Force list** — one five-card configuration per line, editable, clearable.
- **Backup** — copy a code capturing your stack, force list, and settings;
  paste a code to restore or to clone another performer's setup. Codes look
  like `AIP1.eyJ2IjoxLCJz…`.
- **Joker button** on/off, **rehearsal diagnostics** (a clearly-labeled panel
  showing the detected mode and decode — never enable in performance),
  **Reset performance** (clears the current group and restarts the correction
  rotation), and **Run self-tests**.

All settings persist on the device (`localStorage`) and survive reloads.
Because iOS can evict a long-unused web app's storage, keep a backup code
somewhere safe.

### Rejections stay in character

Malformed input — duplicates, an impossible Joker arrangement — is refused
with lines like "I may have misread that unusual card," never with anything
that hints at stacks, order, or method. If the app ever hits an internal
error, it shows a calm "Let me reset the display" screen with a Restart
button rather than going blank.

---

## Install as an iPhone app (PWA)

1. Open the deployed link in **Safari**:
   `https://<your-username>.github.io/ai-poker/`
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch from the home screen icon: full screen, no browser chrome, gold
   poker-chip icon, and fully **offline** after the first load (the service
   worker precaches everything).

Updates deploy automatically when the repo changes; the installed app picks
them up next time it launches with a connection.

---

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # vitest: logic, settings, and UI suites (57 tests)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
npm run icons      # regenerate public/ icons from scripts/make-icons.mjs
```

Layout:

```
src/logic.ts      pure decoding: mode detection, coded/block/force/joker
src/stacks.ts     built-in stacks (Aronson, Mnemonica, Particle, CHaSeD)
src/settings.ts   localStorage persistence + AIP1 backup codes
src/selftest.ts   the in-app self-tests behind the setup screen
src/App.tsx       the UI
tests/            vitest suites mirroring all of the above
```

The decoding logic is pure and fully covered by tests — including the
published acceptance tests, wrap-around blocks, force precedence over stack
blocks, and a misclassification-rate bound for the mode auto-detection.

## Deployment (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`: install → test →
build → deploy to GitHub Pages. One-time setup after creating the repo:

1. Push this code to `main`.
2. In the repo: **Settings → Pages → Source → GitHub Actions**.
3. The site appears at `https://<your-username>.github.io/ai-poker/`
   after the first workflow run (watch the **Actions** tab).

The Vite `base` is `/ai-poker/`; if you fork under a different repo name,
change `base` in `vite.config.ts` to match.
