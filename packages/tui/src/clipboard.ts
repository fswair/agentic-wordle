import { spawnSync } from "node:child_process";

const COMMANDS: [string, string[]][] = [
  ["pbcopy", []],
  ["wl-copy", []],
  ["xclip", ["-selection", "clipboard"]],
  ["clip.exe", []],
];

/** Copies text via a system tool, falling back to OSC 52 (works over SSH in most modern terminals). */
export function copyToClipboard(text: string, write: (s: string) => void): boolean {
  for (const [cmd, args] of COMMANDS) {
    const r = spawnSync(cmd, args, { input: text });
    if (!r.error && r.status === 0) return true;
  }
  try {
    write(`\u001b]52;c;${Buffer.from(text).toString("base64")}\u0007`);
    return true;
  } catch {
    return false;
  }
}
