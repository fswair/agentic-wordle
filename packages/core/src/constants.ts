/** Shortest and longest answers the game supports. Every length needs a dictionary. */
export const MIN_LENGTH = 4;
export const MAX_LENGTH = 12;
export const MAX_GUESSES = 6;
/** Public address of the deployed site. Used in shared results. */
export const SITE_URL = "https://agentic-wordle.workers.dev";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
/** Letters, digits and underscores. Compared case-insensitively. */
export const USERNAME_RE = /^[A-Za-z0-9_]+$/;
