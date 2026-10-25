import type { CategoryId, GameStatus, LetterState, WordEntry } from "../types.ts";

export interface Category {
  id: CategoryId;
  title: string;
  answers: WordEntry[];
}

/** Server-side game: knows the answer. Clients only ever see a GameView. */
export interface GameState {
  category: CategoryId;
  mode: "scored" | "free";
  /** 1-based position in the category sequence, null in free play. */
  number: number | null;
  answer: string;
  guesses: string[];
  evaluations: LetterState[][];
  status: GameStatus;
  hardMode: boolean;
}

export type RejectionCode = "too_short" | "not_in_list" | "hard_mode_violation";
export interface Rejection {
  code: RejectionCode;
  message?: string;
}
