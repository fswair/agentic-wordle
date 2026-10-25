import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Settings {
  hardMode: boolean;
  highContrast: boolean;
}

/** All that stays on this machine: who you are and your display settings. Progress lives on the server. */
export interface SavedState {
  schemaVersion: 2;
  /** The login key. Stored so the player stays signed in. */
  key: string | null;
  username: string | null;
  settings: Settings;
}

export function defaultState(): SavedState {
  return {
    schemaVersion: 2,
    key: null,
    username: null,
    settings: { hardMode: false, highContrast: false },
  };
}

export function statePath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "agentic-wordle", "state.json");
}

export function loadState(path = statePath()): SavedState {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return defaultState();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    if (parsed.schemaVersion !== 2) throw new Error("older or unknown format");
    return {
      ...defaultState(),
      ...parsed,
      settings: { ...defaultState().settings, ...parsed.settings },
    };
  } catch {
    // Older versions kept progress locally. Keep a copy and start fresh.
    try {
      renameSync(path, `${path}.bak`);
    } catch {}
    return defaultState();
  }
}

/** Atomic write with owner-only permissions, since the file holds the login key. */
export function saveState(state: SavedState, path = statePath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(tmp, path);
    chmodSync(path, 0o600);
  } catch {}
}
