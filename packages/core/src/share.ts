import type { GameView } from "./api.ts";
import { CATEGORY_TITLES } from "./categories.ts";
import { MAX_GUESSES } from "./constants.ts";
import type { LetterState } from "./types.ts";

const DEFAULT: Record<LetterState, string> = { correct: "🟩", present: "🟨", absent: "⬛" };
const CONTRAST: Record<LetterState, string> = { correct: "🟧", present: "🟦", absent: "⬛" };

export interface ShareOptions {
  url?: string;
  highContrast?: boolean;
}

/** Spoiler-free summary of a finished game: the colour grid, never the letters. */
export function buildShareText(game: GameView, opts: ShareOptions = {}): string {
  const emoji = opts.highContrast ? CONTRAST : DEFAULT;
  const score = game.status === "won" ? String(game.guesses.length) : "X";
  const tag = game.number !== null ? ` #${game.number}` : " free play";
  const hard = game.hardMode ? "*" : "";
  const head = `Agentic Wordle${tag} · ${CATEGORY_TITLES[game.category]} ${score}/${MAX_GUESSES}${hard}`;
  const rows = game.evaluations.map((row) => row.map((s) => emoji[s]).join(""));
  return [head, ...rows, ...(opts.url ? [opts.url] : [])].join("\n");
}
