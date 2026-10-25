import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CATEGORY_IDS } from "../src/categories.ts";
import type { CategoryId, WordEntry } from "../src/types.ts";

/** Where the private answer lists live. Override with WORDS_DIR. */
export const WORDS_DIR =
  process.env.WORDS_DIR ?? fileURLToPath(new URL("../../../private/words", import.meta.url));

export function hasWords(): boolean {
  return existsSync(WORDS_DIR);
}

export function wordFile(id: CategoryId): string {
  return `${WORDS_DIR}/${id}.json`;
}

export interface LoadedList {
  id: CategoryId;
  answers: WordEntry[];
}

export function loadLists(): LoadedList[] {
  return CATEGORY_IDS.map((id) => ({
    id,
    answers: JSON.parse(readFileSync(wordFile(id), "utf8")).answers as WordEntry[],
  }));
}
