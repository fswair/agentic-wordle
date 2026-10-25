import { CATEGORY_IDS, CATEGORY_TITLES } from "../categories.ts";
import type { CategoryId, WordEntry } from "../types.ts";
import type { Category } from "./types.ts";

type WordFile = { answers: WordEntry[] };

let registry: Partial<Record<CategoryId, Category>> = {};
const entries = new Map<string, WordEntry>();

/**
 * The answer lists are private, so they are handed to the engine at startup (by the Worker or
 * a test) instead of being imported here.
 */
export function registerCategories(files: Record<CategoryId, WordFile>): void {
  registry = {};
  entries.clear();
  for (const id of CATEGORY_IDS) {
    registry[id] = { id, title: CATEGORY_TITLES[id], answers: files[id].answers };
    for (const entry of files[id].answers) entries.set(`${id}:${entry.word}`, entry);
  }
}

export function getCategory(id: CategoryId): Category {
  const category = registry[id];
  if (!category) throw new Error("Categories are not registered. Call registerCategories() first.");
  return category;
}

export function listCategories(): Category[] {
  return CATEGORY_IDS.map(getCategory);
}

export function findEntry(id: CategoryId, word: string): WordEntry | undefined {
  return entries.get(`${id}:${word}`);
}
