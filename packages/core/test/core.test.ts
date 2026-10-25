import { beforeAll, describe, expect, it } from "vitest";
import {
  computeStats,
  ensureAllDictionaries,
  evaluateGuess,
  getCategory,
  isValidGuess,
  localDay,
  newGame,
  nextInSequence,
  replay,
  sequence,
  submitGuess,
  tierSummary,
  toView,
} from "../src/engine/index.ts";
import { buildShareText, type GameView, keyboardStates } from "../src/index.ts";
import { useFixtureWords } from "./setup.ts";

beforeAll(async () => {
  useFixtureWords();
  await ensureAllDictionaries();
});

const E = (s: string) =>
  [...s].map((c) => (c === "c" ? "correct" : c === "p" ? "present" : "absent"));
const entry = (word: string) => ({ word, definition: "d", hint: "h" });
const game = (answer: string, hardMode = false) =>
  newGame("agentic-ai", "scored", entry(answer), 1, hardMode);

describe("evaluateGuess", () => {
  it("all correct", () => expect(evaluateGuess("GRAPH", "GRAPH")).toEqual(E("ccccc")));
  it("all absent", () => expect(evaluateGuess("BUILD", "AGENT")).toEqual(E("aaaaa")));
  it("repeated letter in guess, one in answer", () =>
    expect(evaluateGuess("TOOLS", "TOKEN")).toEqual(E("ccaaa")));
  it("repeated letters in both", () => expect(evaluateGuess("BABES", "ABBEY")).toEqual(E("ppcca")));
  it("exact match takes priority over present", () =>
    expect(evaluateGuess("LLAMA", "ALLOW")).toEqual(E("pcpaa")));
  it("works for long words", () =>
    expect(evaluateGuess("ABCDEFGHIJKL", "ABCDEFGHIJKL")).toEqual(E("c".repeat(12))));
});

describe("submitGuess", () => {
  it("rejects guesses of the wrong length", () => {
    expect(submitGuess(game("AGENT"), "AGE").rejected?.code).toBe("too_short");
  });
  it("rejects words not in the dictionary and keeps the tries", () => {
    const r = submitGuess(game("AGENT"), "QQQQQ");
    expect(r.rejected?.code).toBe("not_in_list");
    expect(r.state.guesses).toHaveLength(0);
  });
  it("accepts category answers even if no dictionary has them", () => {
    expect(isValidGuess("apple")).toBe(true);
    expect(isValidGuess("zzzzz")).toBe(false);
  });
  it("is case-insensitive and wins on the right answer", () => {
    const r = submitGuess(game("AGENT"), "agent");
    expect(r.state.status).toBe("won");
    expect(submitGuess(r.state, "AGENT").state).toBe(r.state);
  });
  it("loses after six wrong guesses", () => {
    let s = game("AGENT");
    for (const w of ["TOOLS", "STATE", "GRAPH", "CHAIN", "SHELL", "LOOPS"]) {
      s = submitGuess(s, w).state;
    }
    expect(s.status).toBe("lost");
  });
  it("hard mode enforces correct and present letters", () => {
    const afterOne = submitGuess(game("AGENT", true), "ALERT").state;
    expect(submitGuess(afterOne, "TOOLS").rejected?.code).toBe("hard_mode_violation");
    expect(submitGuess(afterOne, "AGENT").state.status).toBe("won");
  });
  it("replay rebuilds a game from stored guesses", () => {
    const s = replay(game("AGENT"), ["TOOLS", "AGENT"]);
    expect(s.status).toBe("won");
    expect(s.guesses).toEqual(["TOOLS", "AGENT"]);
  });
});

describe("toView", () => {
  it("never reveals the answer while playing", () => {
    const v = toView(submitGuess(game("AGENT"), "TOOLS").state, entry("AGENT"));
    expect(v.answer).toBeUndefined();
    expect(v.definition).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain("AGENT");
  });
  it("shows the hint after three guesses and the answer when over", () => {
    let s = game("AGENT");
    for (const w of ["TOOLS", "STATE", "GRAPH"]) s = submitGuess(s, w).state;
    expect(toView(s, entry("AGENT")).hint).toBe("h");
    const won = submitGuess(s, "AGENT").state;
    const v = toView(won, entry("AGENT"));
    expect(v.answer).toBe("AGENT");
    expect(v.definition).toBe("d");
    expect(v.hint).toBeUndefined();
  });
});

describe("sequence", () => {
  it("orders by length, then by position in the file", () => {
    const seq = sequence("agentic-ai");
    const lengths = seq.map((i) => i.entry.word.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(seq.map((i) => i.number)).toEqual(seq.map((_, i) => i + 1));
    const fourLetter = getCategory("agentic-ai").answers.filter((a) => a.word.length === 4);
    expect(seq.slice(0, fourLetter.length).map((i) => i.entry.word)).toEqual(
      fourLetter.map((a) => a.word),
    );
  });
  it("serves the first word the player has not played", () => {
    const first = sequence("agentic-ai")[0];
    expect(nextInSequence("agentic-ai", new Set())?.entry.word).toBe(first?.entry.word);
    const played = new Set([first?.entry.word as string]);
    expect(nextInSequence("agentic-ai", played)?.number).toBe(2);
  });
  it("returns null once everything is played", () => {
    const all = new Set(sequence("agentic-ai").map((i) => i.entry.word));
    expect(nextInSequence("agentic-ai", all)).toBeNull();
  });
  it("summarises progress per length", () => {
    const first = sequence("agentic-ai")[0]?.entry.word as string;
    const tiers = tierSummary("agentic-ai", new Set([first]));
    expect(tiers[0]).toMatchObject({ length: 4, total: 4, solved: 1 });
    expect(tiers.map((t) => t.length)).toEqual([4, 5, 6]);
  });
});

describe("localDay", () => {
  it("uses the player's calendar, not UTC", () => {
    const t = new Date("2026-10-27T22:30:00Z");
    expect(localDay(t, "UTC") + 1).toBe(localDay(t, "Europe/Istanbul")); // already Oct 28 in Turkey
  });
});

describe("stats", () => {
  const r = (day: number, won: boolean, guessCount = 3) => ({ day, won, guessCount });
  it("counts streaks across consecutive days", () => {
    const s = computeStats([r(1, true, 3), r(2, true, 4)]);
    expect(s).toMatchObject({ played: 2, wins: 2, currentStreak: 2, maxStreak: 2 });
    expect(s.distribution[2]).toBe(1);
    expect(s.distribution[3]).toBe(1);
  });
  it("breaks the streak after a gap or a loss, keeping the best", () => {
    expect(computeStats([r(1, true), r(5, true)]).currentStreak).toBe(1);
    const lost = computeStats([r(1, true), r(2, true), r(3, false)]);
    expect(lost.currentStreak).toBe(0);
    expect(lost.maxStreak).toBe(2);
  });
});

describe("client helpers", () => {
  const view: GameView = {
    category: "agentic-ai",
    mode: "scored",
    length: 5,
    number: 7,
    guesses: ["TOOLS", "AGENT"],
    evaluations: [evaluateGuess("TOOLS", "AGENT"), evaluateGuess("AGENT", "AGENT")],
    status: "won",
    hardMode: false,
  };
  it("builds a spoiler-free share text", () => {
    const text = buildShareText(view, { url: "https://x.test" });
    expect(text).toBe("Agentic Wordle #7 · Agentic AI 2/6\n🟨⬛⬛⬛⬛\n🟩🟩🟩🟩🟩\nhttps://x.test");
    expect(text).not.toMatch(/AGENT|TOOLS/);
  });
  it("keeps the best state per letter on the keyboard", () => {
    expect(keyboardStates(view).A).toBe("correct");
    expect(keyboardStates(view).O).toBe("absent");
  });
});
