import type { Db, UserRow } from "./db.ts";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no I, L, O, U, 0, 1: easy to copy by eye

/** A random 128-bit secret shown once to the player, e.g. K7QM2-X9PBR-.... */
export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(26));
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[(bytes[i] as number) % ALPHABET.length];
    if (i % 5 === 4 && i < bytes.length - 1) out += "-";
  }
  return out;
}

/** Keys are matched ignoring case, dashes and spaces so pasted keys always work. */
export function normalizeKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeKey(key));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? (match[1] as string) : null;
}

/** The player behind the request's key, or null if there is none or it is unknown. */
export async function authenticate(db: Db, request: Request): Promise<UserRow | null> {
  const key = bearer(request);
  if (!key || normalizeKey(key).length < 20) return null;
  return db
    .prepare("SELECT id, username, timezone FROM users WHERE key_hash = ?")
    .bind(await hashKey(key))
    .first<UserRow>();
}
