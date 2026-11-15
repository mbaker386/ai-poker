// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AIPoker from "../src/App";

const SY: Record<string, string> = { C: "♣", H: "♥", S: "♠", D: "♦" };

function tapRank(r: string) {
  const btn = screen.getAllByRole("button", { name: r }).find((b) => b.className.includes("rank"));
  fireEvent.click(btn!);
}
function tapSuit(s: string) {
  const btn = screen.getAllByRole("button", { name: SY[s] }).find((b) => b.className.includes("suit"));
  fireEvent.click(btn!);
}
function enterCard(tok: string) {
  if (tok === "JOKER") { fireEvent.click(screen.getByRole("button", { name: "JOKER" })); return; }
  tapRank(tok.slice(0, -1));
  tapSuit(tok.slice(-1));
}
function enterGroup(cards: string[]) { for (const c of cards) enterCard(c); }
function reveal() { fireEvent.click(screen.getByRole("button", { name: "Reveal" })); }

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("reveal flows", () => {
  it("block group JH,KH,JC,4D reveals Ten of Diamonds; No gives Instagram correction", () => {
    render(<AIPoker />);
    enterGroup(["JH", "KH", "JC", "4D"]);
    reveal();
    expect(screen.getByText(/Ten of Diamonds/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    const corr = screen.getByText(/Instagram/);
    expect(corr.textContent).toMatch(/Four of Hearts/);
    expect(corr.textContent).not.toMatch(/this time/);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Let’s begin.")).toBeTruthy();
  });

  it("corrections cycle Instagram -> TikTok on successive Nos", () => {
    render(<AIPoker />);
    enterGroup(["JH", "KH", "JC", "4D"]);
    reveal();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    enterGroup(["AD", "4H", "4C", "AS"]); // coded, has alternate
    reveal();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByText(/TikTok/)).toBeTruthy();
  });

  it("force group AC,4H,7S,KC reveals Ten of Diamonds; No leads to re-enter (no correction)", () => {
    render(<AIPoker />);
    enterGroup(["AC", "4H", "7S", "KC"]);
    reveal();
    expect(screen.getByText(/Ten of Diamonds/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByText(/misunderstood one of the card names/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enter again" }));
    expect(screen.getByText("Let’s begin.")).toBeTruthy();
  });

  it("joker group decodes; malformed joker order rejects without naming the method", () => {
    render(<AIPoker />);
    enterGroup(["9S", "KD", "JOKER", "10D"]);
    reveal();
    expect(screen.getByText(/King of Spades/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Correct" }));

    enterGroup(["AH", "JOKER", "9S", "4C"]); // impossible order
    reveal();
    const msg = screen.getByText(/misread that unusual card/);
    expect(msg.textContent).not.toMatch(/stack|order|position|consecutive|block|force|phase/i);
  });

  it("duplicate card entry is blocked with a hint", () => {
    render(<AIPoker />);
    enterCard("AS");
    enterCard("AS");
    expect(screen.getByText(/already in/)).toBeTruthy();
  });
});

describe("hidden setup gesture", () => {
  it("AAA opens setup; entering an Ace normally does not", () => {
    render(<AIPoker />);
    enterCard("AH"); // A then suit: counter must reset
    tapRank("A"); tapRank("A");
    expect(screen.queryByText("Setup")).toBeNull(); // only 2 in a row after reset
    tapRank("A");
    expect(screen.getByText("Setup")).toBeTruthy();
  });

  it("KK does NOT open setup (old gesture removed)", () => {
    render(<AIPoker />);
    tapRank("K"); tapRank("K"); tapRank("K");
    expect(screen.queryByText("Setup")).toBeNull();
  });

  it("stack switch takes effect immediately after Close", () => {
    render(<AIPoker />);
    tapRank("A"); tapRank("A"); tapRank("A");
    fireEvent.click(screen.getByRole("button", { name: "Numerical-CHaSeD" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    // CHaSeD wrap-around block 51,52,1,2 minus AC
    enterGroup(["KS", "KD", "AH", "AS"]);
    reveal();
    expect(screen.getByText(/Ace of Clubs/)).toBeTruthy();
  });
});

describe("persistence", () => {
  it("stack selection persists across a reload (fresh render)", () => {
    const first = render(<AIPoker />);
    tapRank("A"); tapRank("A"); tapRank("A");
    fireEvent.click(screen.getByRole("button", { name: "Mnemonica" }));
    first.unmount();

    render(<AIPoker />);
    tapRank("A"); tapRank("A"); tapRank("A");
    const btn = screen.getByRole("button", { name: "Mnemonica" });
    expect(btn.className).toContain("on");
  });

  it("joker toggle persists and hides the JOKER key", () => {
    const first = render(<AIPoker />);
    tapRank("A"); tapRank("A"); tapRank("A");
    expect(screen.getByRole("button", { name: "JOKER" }).className).toContain("joker-rank");
    fireEvent.click(screen.getByRole("switch", { name: "Joker button" })); // joker off
    first.unmount();

    render(<AIPoker />);
    expect(screen.queryByRole("button", { name: "JOKER" })).toBeNull();
  });
});

describe("double-tap reveal", () => {
  function openSetup() { tapRank("A"); tapRank("A"); tapRank("A"); }
  it("double tap reveals the higher candidate", () => {
    render(<AIPoker />);
    openSetup();
    fireEvent.click(screen.getByRole("switch", { name: "Double-tap Reveal" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    // AD,4H,4C,AS -> candidates {10H, KS}; double tap => higher = King of Spades
    enterGroup(["AD", "4H", "4C", "AS"]);
    const btn = screen.getByRole("button", { name: "Reveal" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.getByText(/King of Spades/)).toBeTruthy();
  });
});

describe("repeat-King method", () => {
  it("accepts a repeated fourth card and reveals a King", () => {
    const { container } = render(<AIPoker />);
    // AS,3H,6C,AS -> King of Clubs (black + minor); the 4th entry repeats AS.
    enterGroup(["AS", "3H", "6C", "AS"]);
    expect(container.querySelectorAll(".aip-slot.filled").length).toBe(4); // duplicate accepted
    reveal();
    expect(screen.getByText(/King of Clubs/)).toBeTruthy();
  });
  it("still blocks a duplicate that is not the fourth entry", () => {
    render(<AIPoker />);
    enterCard("AS");
    enterCard("AS"); // second entry duplicate -> rejected
    expect(screen.getByText(/already in/)).toBeTruthy();
  });
});

describe("suit order", () => {
  it("SHoCkeD toggle reorders the suit buttons to ♠ ♥ ♣ ♦", () => {
    render(<AIPoker />);
    tapRank("A"); tapRank("A"); tapRank("A");
    fireEvent.click(screen.getByRole("switch", { name: "SHoCkeD suit order" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const suits = screen.getAllByRole("button").filter((b) => b.className.includes("aip-key suit"));
    expect(suits.map((b) => b.textContent)).toEqual(["♠", "♥", "♣", "♦"]);
  });
});

describe("backup codes via UI", () => {
  it("import applies a pasted code", () => {
    render(<AIPoker />);
    tapRank("A"); tapRank("A"); tapRank("A");
    const code = "AIP1." + btoa(JSON.stringify({ v: 1, s: "particle", n: "X", c: null, f: "AC 4H 7S 10D KC", j: true }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    fireEvent.change(screen.getByPlaceholderText(/backup code/), { target: { value: code } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    const btn = screen.getByRole("button", { name: "Particle" });
    expect(btn.className).toContain("on");
  });

  it("bad code shows a friendly error", () => {
    render(<AIPoker />);
    tapRank("A"); tapRank("A"); tapRank("A");
    fireEvent.change(screen.getByPlaceholderText(/backup code/), { target: { value: "nonsense" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByText(/doesn't look like a backup code/)).toBeTruthy();
  });
});

describe("embedded self-tests", () => {
  it("all pass from the setup screen", () => {
    render(<AIPoker />);
    tapRank("A"); tapRank("A"); tapRank("A");
    fireEvent.click(screen.getByRole("button", { name: "Run self-tests" }));
    expect(screen.getByText(/15\/15 passed/)).toBeTruthy();
  });
});
