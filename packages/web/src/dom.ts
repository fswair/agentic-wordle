export type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function countdownText(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.floor((next.getTime() - now.getTime()) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
