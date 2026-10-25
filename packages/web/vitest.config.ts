import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    alias: {
      // Tests run against harmless fixture words, never the private lists.
      "@words": fileURLToPath(new URL("../core/test/fixtures/words/index.ts", import.meta.url)),
    },
  },
});
