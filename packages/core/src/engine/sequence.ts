import type { TierSummary } from "../api.ts";
import type { CategoryId, WordEntry } from "../types.ts";
import { getCategory } from "./categories.ts";

export interface SequenceItem {
  entry: WordEntry;
  /** 1-based position in the sequence. */
  number: number;
}

const cache = new Map<CategoryId, SequenceItem[]>();

/**
 * Everyone plays a category in the same order: shortest words first, and within a length in
 * the order they appear in the word file. Array.sort is stable, so file order is kept.
 */
export function sequence(category: CategoryId): SequenceItem[] {
  const hit = cache.get(category);
  if (hit) return hit;
  const sorted = [...getCategory(category).answers]
    .sort((a, b) => a.word.length - b.word.length)
    .map((entry, i) => ({ entry, number: i + 1 }));
  cache.set(category, sorted);
  return sorted;
}

/** Drop cached orders, for tests that swap the word lists. */
export function resetSequenceCache(): void {
  cache.clear();
}

/** The first word in the sequence the player has not played yet. */
export function nextInSequence(category: CategoryId, played: ReadonlySet<string>) {
  return sequence(category).find((item) => !played.has(item.entry.word)) ?? null;
}

export function tierSummary(category: CategoryId, played: ReadonlySet<string>): TierSummary[] {
  const byLength = new Map<number, TierSummary>();
  for (const { entry } of sequence(category)) {
    const length = entry.word.length;
    const tier = byLength.get(length) ?? { length, total: 0, solved: 0 };
    tier.total += 1;
    if (played.has(entry.word)) tier.solved += 1;
    byLength.set(length, tier);
  }
  return [...byLength.values()].sort((a, b) => a.length - b.length);
}
