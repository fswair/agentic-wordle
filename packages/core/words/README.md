# Word data

The game's word data is plain JSON. No code changes are needed to add words.

**The answer lists are private** and live in `private/words/` at the repo root (git-ignored). Only the public guess dictionaries, the schema and this document are in this folder.

| File                                      | What it is                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `private/words/*.json` (one per category) | The **answers** for each category (private, not committed)                       |
| `dictionary/len-4.json` … `len-12.json`   | Words accepted as **guesses**, one list per length (generated, do not edit)      |
| `words.schema.json`                       | JSON Schema for the category files. Editors that support it validate as you type |

## Category file format

```json
{
  "$schema": "../../packages/core/words/words.schema.json",
  "version": 1,
  "category": "agentic-ai",
  "title": "Agentic AI",
  "answers": [
    {
      "word": "EXAMPLE",
      "definition": "An illustration of how an entry looks.",
      "hint": "Shows the format."
    }
  ]
}
```

| Field        | Rules                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| `word`       | Uppercase `A-Z`, 4 to 12 letters. Unique across **all** categories                         |
| `definition` | Required, at most 200 characters. Shown after the game                                     |
| `hint`       | Optional, at most 80 characters. Unlocked after three guesses. Must not contain the answer |
| `tags`       | Optional list of strings                                                                   |

### How lengths work

Words are grouped by length. Each category is played as one sequence: shortest words first, and within a length in the order they appear in the file. Every player moves through it one scored word per day, so the number of words per length decides how long each stage lasts. Free play draws unseen words of any length.

## Adding words

Put new words in a JSON file (an array, or an object with an `answers` array) and run:

```sh
pnpm add-words agentic-ai my-words.json --dry-run   # check first
pnpm add-words agentic-ai my-words.json             # append for real
cat my-words.json | pnpm add-words it -             # or read from stdin
```

Every entry is checked. Bad entries (wrong length, duplicate, missing definition, hint that gives the answer away) are reported and skipped, good ones are appended to the **end** of the category file.

Then run `pnpm check`. Do not reorder or delete words after launch: the daily puzzle is chosen from the list, so changing it changes which word falls on which day.

## Generating words with an LLM

Paste something like this, then save the reply as a `.json` file and feed it to `add-words`:

```text
Write 40 words for a Wordle-style game about <CATEGORY>. Output only a JSON array.
Each item: {"word": "...", "definition": "...", "hint": "..."}.
Rules:
- "word": uppercase A-Z only, exactly <N> letters (4 to 12), a real term from this field.
  Single words only, no spaces or hyphens. Avoid: <PASTE EXISTING WORDS OR "see list below">.
- "definition": 1-2 clear sentences, at most 200 characters, explaining the term in this field.
- "hint": at most 80 characters, a nudge that does NOT contain the word.
Prefer terms people in the field actually use. No brand names.
```

Tips: ask for one length at a time, and include the current words (`jq -r '.answers[].word' private/words/it.json`) so the model avoids repeats. `add-words` rejects wrong lengths, so double-check the count it reports.

## Guess dictionaries

`dictionary/len-N.json` holds every ordinary English word of that length, taken from the public-domain ENABLE list. A guess is valid if it is in there **or** is an answer in any category, so technical terms are always guessable. Regenerate with `pnpm --filter @agentic-wordle/core fetch-allowed`. To support another length, extend `MIN_LENGTH` and `MAX_LENGTH` in `src/constants.ts`, the loader table in `src/dictionary.ts` and `fetch-allowed.ts`.
