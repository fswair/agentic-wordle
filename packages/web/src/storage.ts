export interface Settings {
  hardMode: boolean;
  highContrast: boolean;
  light: boolean;
}

/** Who is signed in on this browser. The key is kept so the player stays signed in. */
export interface Session {
  key: string;
  username: string;
}

const SETTINGS_KEY = "aw:v2:settings";
const SESSION_KEY = "aw:v2:session";
const HELP_KEY = "aw:v2:seen-help";

// localStorage can throw or be unavailable (private windows, blocked storage). The game must
// still work, it just will not remember anything.
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadSettings(): Settings {
  return {
    hardMode: false,
    highContrast: false,
    light: false,
    ...read<Partial<Settings>>(SETTINGS_KEY),
  };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

export function loadSession(): Session | null {
  const s = read<Partial<Session>>(SESSION_KEY);
  return s?.key && s.username ? { key: s.key, username: s.username } : null;
}

export function saveSession(s: Session): void {
  write(SESSION_KEY, s);
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function helpSeen(): boolean {
  return read<boolean>(HELP_KEY) === true;
}

export function markHelpSeen(): void {
  write(HELP_KEY, true);
}
