import { MAX_LENGTH, MIN_LENGTH } from "../constants.ts";
import { listCategories } from "./categories.ts";

// One JSON file per word length, loaded on demand so the web bundle only ships what is played.
const LOADERS: Record<number, () => Promise<{ default: string[] }>> = {
  4: () => import("../../words/dictionary/len-4.json", { with: { type: "json" } }),
  5: () => import("../../words/dictionary/len-5.json", { with: { type: "json" } }),
  6: () => import("../../words/dictionary/len-6.json", { with: { type: "json" } }),
  7: () => import("../../words/dictionary/len-7.json", { with: { type: "json" } }),
  8: () => import("../../words/dictionary/len-8.json", { with: { type: "json" } }),
  9: () => import("../../words/dictionary/len-9.json", { with: { type: "json" } }),
  10: () => import("../../words/dictionary/len-10.json", { with: { type: "json" } }),
  11: () => import("../../words/dictionary/len-11.json", { with: { type: "json" } }),
  12: () => import("../../words/dictionary/len-12.json", { with: { type: "json" } }),
};

const loaded = new Map<number, Set<string>>();
let answers: Set<string> | null = null;

function answerSet(): Set<string> {
  if (!answers) {
    answers = new Set(listCategories().flatMap((c) => c.answers.map((a) => a.word)));
  }
  return answers;
}

/** Loads the guess dictionary for one word length. Call before starting a game of that length. */
export async function ensureDictionary(length: number): Promise<void> {
  if (loaded.has(length)) return;
  const load = LOADERS[length];
  if (!load) throw new Error(`No dictionary for ${length}-letter words`);
  loaded.set(length, new Set((await load()).default));
}

export async function ensureAllDictionaries(): Promise<void> {
  const lengths = Object.keys(LOADERS).map(Number);
  await Promise.all(
    lengths.filter((n) => n >= MIN_LENGTH && n <= MAX_LENGTH).map(ensureDictionary),
  );
}

/**
 * A guess is valid if it is an English word of that length or any category answer. Until the
 * dictionary for that length is loaded, only category answers are accepted.
 */
export function isValidGuess(word: string): boolean {
  const w = word.toUpperCase();
  return answerSet().has(w) || (loaded.get(w.length)?.has(w) ?? false);
}
