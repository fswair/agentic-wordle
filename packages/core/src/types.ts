export type CategoryId = "agentic-ai" | "machine-learning" | "software-engineering" | "it";

export type LetterState = "correct" | "present" | "absent";
export type KeyState = LetterState | "unused";
export type GameStatus = "playing" | "won" | "lost";

export interface WordEntry {
  /** Uppercase A-Z, MIN_LENGTH to MAX_LENGTH letters. */
  word: string;
  /** Shown after the game ends. */
  definition: string;
  hint?: string;
  tags?: string[];
}

export interface Stats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  /** distribution[i] = wins in i+1 guesses. */
  distribution: number[];
  lastCompletedDay: number | null;
}
