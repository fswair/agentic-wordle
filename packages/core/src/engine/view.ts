import type { GameView } from "../api.ts";
import type { WordEntry } from "../types.ts";
import type { GameState } from "./types.ts";

/** Strips a game down to what the client may see. The answer appears only when the game ends. */
export function toView(state: GameState, entry: WordEntry | undefined, token?: string): GameView {
  const over = state.status !== "playing";
  const view: GameView = {
    category: state.category,
    mode: state.mode,
    length: state.answer.length,
    number: state.number,
    guesses: state.guesses,
    evaluations: state.evaluations,
    status: state.status,
    hardMode: state.hardMode,
  };
  if (!over && state.guesses.length >= 3 && entry?.hint) view.hint = entry.hint;
  if (over) {
    view.answer = state.answer;
    if (entry) view.definition = entry.definition;
  }
  if (token) view.token = token;
  return view;
}
