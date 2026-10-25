import type { KeyState, LetterState } from "./types.ts";

const RANK: Record<KeyState, number> = { unused: 0, absent: 1, present: 2, correct: 3 };

/** Best known state for each letter A-Z (only letters that were guessed are present). */
export function keyboardStates(game: { guesses: string[]; evaluations: LetterState[][] }) {
  const map: Record<string, KeyState> = {};
  game.guesses.forEach((guess, row) => {
    const evaluation = game.evaluations[row] ?? [];
    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i] as string;
      const s = evaluation[i] ?? "unused";
      if (RANK[s] > RANK[map[letter] ?? "unused"]) map[letter] = s;
    }
  });
  return map;
}
