// Builds words/dictionary/len-N.json from the ENABLE word list (public domain), one file per length.
// Run: pnpm --filter @agentic-wordle/core fetch-allowed
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const URL_ENABLE = "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt";
const MIN = 4;
const MAX = 12;

const res = await fetch(URL_ENABLE);
if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
const text = await res.text();
const all = text.split(/\r?\n/).map((w) => w.trim().toUpperCase());

for (let len = MIN; len <= MAX; len++) {
  const words = [...new Set(all.filter((w) => w.length === len && /^[A-Z]+$/.test(w)))].sort();
  // One compact line per file: these are data, not meant to be edited by hand.
  writeFileSync(
    fileURLToPath(new URL(`../words/dictionary/len-${len}.json`, import.meta.url)),
    `${JSON.stringify(words)}\n`,
  );
  console.log(`${len} letters: ${words.length} words`);
}
