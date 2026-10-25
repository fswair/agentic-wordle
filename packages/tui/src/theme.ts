import type { KeyState, LetterState } from "@agentic-wordle/core";

export interface Theme {
  noColor: boolean;
  highContrast: boolean;
}

const NORMAL = { correct: "#538d4e", present: "#b59f3b", absent: "#3a3a3c", unused: "#818384" };
const CONTRAST = { correct: "#f5793a", present: "#85c0f9", absent: "#3a3a3c", unused: "#818384" };

export function detectNoColor(): boolean {
  return process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";
}

export function stateColor(theme: Theme, state: KeyState): string {
  return (theme.highContrast ? CONTRAST : NORMAL)[state];
}

/** Without colour, the state is encoded in the delimiters around the letter. */
export function plainTile(letter: string, state: LetterState): string {
  if (state === "correct") return `[${letter}]`;
  if (state === "present") return `(${letter})`;
  return ` ${letter.toLowerCase()} `;
}

export const ACCENT = "#6cb2eb";
