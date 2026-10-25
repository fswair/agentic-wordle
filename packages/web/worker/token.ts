// Free play is stateless on the server: the game state travels with the client inside an
// encrypted token, so the client can neither read the answer nor forge a different game.

export interface FreeState {
  /** Category id. */
  c: string;
  /** The answer. */
  w: string;
  /** Guesses so far. */
  g: string[];
  /** Hard mode. */
  h: boolean;
  /** Player id when logged in, so a finished game can be recorded. */
  u: string | null;
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const unb64 = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function sealToken(state: FreeState, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(state));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), data),
  );
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv);
  out.set(cipher, iv.length);
  return b64(out);
}

export async function openToken(token: string, secret: string): Promise<FreeState | null> {
  try {
    const bytes = unb64(token);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await aesKey(secret),
      bytes.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as FreeState;
  } catch {
    return null;
  }
}
