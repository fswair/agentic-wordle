import type { LetterState } from "../types.ts";

/** Two-pass Wordle evaluation that handles repeated letters correctly. */
export function evaluateGuess(guess: string, answer: string): LetterState[] {
  const n = answer.length;
  const result: LetterState[] = new Array(n).fill("absent");
  const remaining = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
    } else {
      const a = answer[i] as string;
      remaining.set(a, (remaining.get(a) ?? 0) + 1);
    }
  }

  for (let i = 0; i < n; i++) {
    if (result[i] === "correct") continue;
    const g = guess[i] as string;
    const left = remaining.get(g) ?? 0;
    if (left > 0) {
      result[i] = "present";
      remaining.set(g, left - 1);
    }
  }

  return result;
}
