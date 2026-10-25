import type { CategoryId } from "./types.ts";

export const CATEGORY_IDS = [
  "agentic-ai",
  "machine-learning",
  "software-engineering",
  "it",
] as const satisfies readonly CategoryId[];

export const CATEGORY_TITLES: Record<CategoryId, string> = {
  "agentic-ai": "Agentic AI",
  "machine-learning": "Machine Learning",
  "software-engineering": "Software Engineering",
  it: "IT",
};

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}
