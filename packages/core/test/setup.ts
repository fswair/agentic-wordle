import { registerCategories, resetSequenceCache } from "../src/engine/index.ts";
import { words } from "./fixtures/words/index.ts";

/** Load the harmless fixture lists so engine tests never depend on the private answers. */
export function useFixtureWords(): void {
  registerCategories(words as Parameters<typeof registerCategories>[0]);
  resetSequenceCache();
}
