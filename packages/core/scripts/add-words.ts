// Adds words from a JSON file to a category list, after checking every entry.
//
//   pnpm add-words <category> <file.json | -> [--dry-run]
//
// The input is a JSON array of { word, definition, hint? }, or an object with an "answers" array.
// Words are upper-cased. Bad or duplicate entries are reported and skipped, good ones are
// appended to the END of the category file (the daily order depends on the list, so existing
// words are never reordered).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { CATEGORY_IDS, isCategoryId } from "../src/categories.ts";
import { checkEntry, type RawEntry } from "./validation.ts";
import { hasWords, loadLists, WORDS_DIR, wordFile } from "./words-dir.ts";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const [categoryId, input] = args;

if (!hasWords()) {
  console.error(`No word lists at ${WORDS_DIR}. Set WORDS_DIR or create private/words.`);
  process.exit(1);
}
if (!categoryId || !input || !isCategoryId(categoryId)) {
  console.error(`Usage: pnpm add-words <${CATEGORY_IDS.join("|")}> <file.json | -> [--dry-run]`);
  process.exit(1);
}

const raw = readFileSync(input === "-" ? 0 : input, "utf8");
let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.error(`Input is not valid JSON: ${(e as Error).message}`);
  process.exit(1);
}
const incoming: RawEntry[] = Array.isArray(parsed)
  ? parsed
  : ((parsed as { answers?: RawEntry[] })?.answers ?? []);
if (incoming.length === 0) {
  console.error('No entries found. Expected an array, or an object with an "answers" array.');
  process.exit(1);
}

const taken = new Map<string, string>();
for (const list of loadLists()) for (const a of list.answers) taken.set(a.word, list.id);

const added: Record<string, unknown>[] = [];
const rejected: string[] = [];
for (const item of incoming) {
  const word = typeof item.word === "string" ? item.word.trim().toUpperCase() : item.word;
  const entry = { ...item, word } as RawEntry;
  const problems = checkEntry(entry);
  const where = typeof word === "string" ? word : JSON.stringify(item.word);
  const owner = typeof word === "string" ? taken.get(word) : undefined;
  if (owner) problems.push(`already exists in ${owner}`);
  if (problems.length > 0) {
    rejected.push(`  ${where}: ${problems.join("; ")}`);
    continue;
  }
  taken.set(word as string, categoryId);
  const clean: Record<string, unknown> = { word, definition: (entry.definition as string).trim() };
  if (entry.hint !== undefined) clean.hint = (entry.hint as string).trim();
  if (entry.tags !== undefined) clean.tags = entry.tags;
  added.push(clean);
}

console.log(
  `${added.length} added to ${categoryId}, ${rejected.length} rejected${dryRun ? " (dry run)" : ""}`,
);
if (rejected.length > 0) console.log(rejected.join("\n"));

if (!dryRun && added.length > 0) {
  const file = wordFile(categoryId);
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.answers.push(...added);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  spawnSync("pnpm", ["exec", "biome", "format", "--write", file], { stdio: "ignore" });
  console.log(
    "Run `pnpm validate-words` to double-check, and add dictionaries for new lengths if needed.",
  );
}
