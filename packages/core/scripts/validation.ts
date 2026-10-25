import { MAX_LENGTH, MIN_LENGTH } from "../src/constants.ts";

const WORD_RE = new RegExp(`^[A-Z]{${MIN_LENGTH},${MAX_LENGTH}}$`);
export const MAX_DEFINITION = 200;
export const MAX_HINT = 80;

export interface RawEntry {
  word?: unknown;
  definition?: unknown;
  hint?: unknown;
  tags?: unknown;
}

/** Returns the problems with one entry, or an empty list when it is fine. */
export function checkEntry(entry: RawEntry): string[] {
  const errors: string[] = [];
  const word = entry.word;
  if (typeof word !== "string" || !WORD_RE.test(word)) {
    errors.push(`word must be ${MIN_LENGTH}-${MAX_LENGTH} uppercase letters A-Z`);
  }
  const def = entry.definition;
  if (typeof def !== "string" || !def.trim()) errors.push("missing definition");
  else if (def.length > MAX_DEFINITION) errors.push(`definition over ${MAX_DEFINITION} characters`);

  if (entry.hint !== undefined) {
    if (typeof entry.hint !== "string" || !entry.hint.trim()) errors.push("hint must be text");
    else {
      if (entry.hint.length > MAX_HINT) errors.push(`hint over ${MAX_HINT} characters`);
      if (typeof word === "string" && entry.hint.toUpperCase().includes(word)) {
        errors.push("hint contains the answer");
      }
    }
  }
  if (
    entry.tags !== undefined &&
    !(Array.isArray(entry.tags) && entry.tags.every((t) => typeof t === "string"))
  ) {
    errors.push("tags must be a list of strings");
  }
  return errors;
}
