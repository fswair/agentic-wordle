declare module "@words" {
  import type { WordEntry } from "@agentic-wordle/core";
  export const words: Record<
    "agentic-ai" | "machine-learning" | "software-engineering" | "it",
    { answers: WordEntry[] }
  >;
}
