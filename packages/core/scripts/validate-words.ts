import { registerCategories } from "../src/engine/categories.ts";
import { ensureDictionary } from "../src/engine/dictionary.ts";
import { checkEntry, type RawEntry } from "./validation.ts";
import { hasWords, loadLists, WORDS_DIR } from "./words-dir.ts";

if (!hasWords()) {
  console.log(`skipped: no word lists at ${WORDS_DIR} (they are private and not in the repo)`);
  process.exit(0);
}

const lists = loadLists();
const errors: string[] = [];
const seen = new Map<string, string>();
const lengths = new Set<number>();
let total = 0;

for (const list of lists) {
  for (const entry of list.answers) {
    total++;
    const where = `${list.id}/${entry.word}`;
    for (const problem of checkEntry(entry as RawEntry)) errors.push(`${where}: ${problem}`);
    const prev = seen.get(entry.word);
    if (prev) errors.push(`${where}: duplicate, already in "${prev}"`);
    seen.set(entry.word, list.id);
    lengths.add(entry.word.length);
  }
}

// Every word length in use needs a guess dictionary.
registerCategories(
  Object.fromEntries(lists.map((l) => [l.id, { answers: l.answers }])) as Parameters<
    typeof registerCategories
  >[0],
);
for (const length of lengths) {
  try {
    await ensureDictionary(length);
  } catch {
    errors.push(`no dictionary for ${length}-letter words (words/dictionary/len-${length}.json)`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

for (const list of lists) {
  const counts = new Map<number, number>();
  for (const a of list.answers) counts.set(a.word.length, (counts.get(a.word.length) ?? 0) + 1);
  const summary = [...counts].sort((a, b) => a[0] - b[0]).map(([len, n]) => `${len}:${n}`);
  console.log(`${list.id.padEnd(22)} ${summary.join("  ")}`);
}
console.log(`ok: ${total} words across ${lists.length} categories`);
