import { MAX_GUESSES } from "../constants.ts";
import type { CategoryId, WordEntry } from "../types.ts";
import { isValidGuess } from "./dictionary.ts";
import { evaluateGuess } from "./evaluate.ts";
import type { GameState, Rejection } from "./types.ts";

export function newGame(
  category: CategoryId,
  mode: GameState["mode"],
  entry: WordEntry,
  number: number | null,
  hardMode = false,
): GameState {
  return {
    category,
    mode,
    number,
    answer: entry.word,
    guesses: [],
    evaluations: [],
    status: "playing",
    hardMode,
  };
}

const ORDINAL = [
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "9th",
  "10th",
  "11th",
  "12th",
];

/** Hard mode: revealed hints must be reused in later guesses. */
function hardModeViolation(state: GameState, guess: string): string | null {
  const prevGuess = state.guesses[state.guesses.length - 1];
  const prevEval = state.evaluations[state.evaluations.length - 1];
  if (!prevGuess || !prevEval) return null;
  for (let i = 0; i < guess.length; i++) {
    if (prevEval[i] === "correct" && guess[i] !== prevGuess[i]) {
      return `${ORDINAL[i]} letter must be ${prevGuess[i]}`;
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (prevEval[i] === "present") {
      const letter = prevGuess[i] as string;
      if (!guess.includes(letter)) return `Guess must contain ${letter}`;
    }
  }
  return null;
}

/** Applies one guess. Rejected guesses leave the game untouched and do not use up a try. */
export function submitGuess(
  state: GameState,
  rawGuess: string,
): { state: GameState; rejected?: Rejection } {
  if (state.status !== "playing") return { state };
  const guess = rawGuess.trim().toUpperCase();
  if (guess.length !== state.answer.length || !/^[A-Z]+$/.test(guess)) {
    return { state, rejected: { code: "too_short" } };
  }
  if (!isValidGuess(guess)) return { state, rejected: { code: "not_in_list" } };
  if (state.hardMode) {
    const message = hardModeViolation(state, guess);
    if (message) return { state, rejected: { code: "hard_mode_violation", message } };
  }
  const guesses = [...state.guesses, guess];
  const evaluations = [...state.evaluations, evaluateGuess(guess, state.answer)];
  const won = guess === state.answer;
  const status = won ? "won" : guesses.length >= MAX_GUESSES ? "lost" : "playing";
  return { state: { ...state, guesses, evaluations, status } };
}

/** Rebuilds a game from stored guesses, re-checking each against the answer. */
export function replay(base: GameState, guesses: string[]): GameState {
  let state = base;
  for (const g of guesses) state = submitGuess(state, g).state;
  return state;
}
