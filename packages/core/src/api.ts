import type { CategoryId, GameStatus, LetterState, Stats } from "./types.ts";

/** What a client is allowed to know about a game. The answer is only present once it is over. */
export interface GameView {
  category: CategoryId;
  mode: "scored" | "free";
  length: number;
  /** 1-based position in the category's sequence. Null in free play. */
  number: number | null;
  guesses: string[];
  evaluations: LetterState[][];
  status: GameStatus;
  hardMode: boolean;
  /** Present once the player has made three guesses. */
  hint?: string;
  /** Present once the game is over. */
  answer?: string;
  definition?: string;
  /** Free play only: opaque state the client sends back with its next guess. */
  token?: string;
}

export interface TierSummary {
  length: number;
  total: number;
  solved: number;
}

export type TodayStatus = "available" | "playing" | "won" | "lost" | "complete";

export interface CategorySummary {
  id: CategoryId;
  title: string;
  total: number;
  solved: number;
  tiers: TierSummary[];
  /** "complete" means the player has finished every word in the sequence. */
  today: TodayStatus;
  stats: Stats;
}

export interface MeResponse {
  username: string;
  timezone: string;
  categories: CategorySummary[];
}

export interface RegisterRequest {
  username: string;
  timezone: string;
}

export interface RegisterResponse {
  username: string;
  /** Shown once. The server only keeps a hash, so a lost key cannot be recovered. */
  key: string;
}

export interface ScoredStartRequest {
  /** Fixed when the day's game starts. */
  hardMode?: boolean;
}

export interface GuessRequest {
  guess: string;
}

export interface FreeStartRequest {
  /** A category, or "random" to draw from any of them. */
  category: CategoryId | "random";
  hardMode?: boolean;
}

export interface FreeGuessRequest extends GuessRequest {
  token: string;
}

export interface GameResponse {
  game: GameView;
}

export type ApiErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_token"
  | "username_taken"
  | "invalid_username"
  | "invalid_request"
  | "unknown_category"
  | "sequence_complete"
  | "too_short"
  | "not_in_list"
  | "hard_mode_violation"
  | "game_over"
  | "no_words_left"
  | "rate_limited";

export interface ApiError {
  error: ApiErrorCode;
  message?: string;
}
