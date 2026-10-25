// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CATEGORY_IDS } from "@agentic-wordle/core";
import {
  ensureAllDictionaries,
  registerCategories,
  resetSequenceCache,
  sequence,
} from "@agentic-wordle/core/engine";
import { words } from "@words";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type ApiEnv, handleApi } from "../worker/api.ts";
import { createDb } from "./d1.ts";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const bodyHtml =
  html.match(/<body>([\s\S]*)<\/body>/)?.[1]?.replace(/<script[\s\S]*?<\/script>/, "") ?? "";

let env: ApiEnv;
const listeners: [string, EventListenerOrEventListenerObject][] = [];

beforeAll(async () => {
  registerCategories(words);
  resetSequenceCache();
  await ensureAllDictionaries();
});

beforeEach(() => {
  // jsdom ships a partial crypto; the Worker code needs the real one.
  vi.stubGlobal("crypto", webcrypto);
  env = { DB: createDb(), TOKEN_SECRET: "test-secret" };
  // The page talks to the real Worker code on an in-memory database.
  vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) =>
    handleApi(new Request(new URL(String(url), "http://test"), init), env),
  );
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((type, fn, opts) => {
    listeners.push([type, fn as EventListenerOrEventListenerObject]);
    add(type, fn as EventListenerOrEventListenerObject, opts);
  });
  // Reduced motion makes tile reveals instant.
  window.matchMedia = ((q: string) => ({
    matches: q.includes("reduced-motion"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("aw:v2:seen-help", "true");
});

afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) document.removeEventListener(type, fn);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

async function boot(path = "/") {
  vi.resetModules();
  document.body.innerHTML = bodyHtml;
  history.replaceState(null, "", path);
  await import("../src/main.ts");
}

const press = (key: string) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
const typeWord = (word: string) => {
  for (const k of word) press(k);
  press("Enter");
};
const text = () => document.body.textContent ?? "";
const click = (selector: string, label?: string) => {
  const els = [...document.querySelectorAll<HTMLElement>(selector)];
  const el = label ? els.find((e) => e.textContent?.includes(label)) : els[0];
  if (!el) throw new Error(`No ${selector} ${label ?? ""}`);
  el.click();
};
const tilesOf = (row: number) =>
  document.querySelectorAll<HTMLElement>("#board .row")[row]?.querySelectorAll(".tile") ?? [];
const firstWord = (id: (typeof CATEGORY_IDS)[number]) => sequence(id)[0]?.entry.word as string;

async function signUp(username = "ada") {
  const { key } = await (
    await fetch("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, timezone: "UTC" }),
    })
  ).json();
  localStorage.setItem("aw:v2:session", JSON.stringify({ key, username }));
  return key as string;
}

describe("signed out", () => {
  it("offers sign-up, sign-in and free play", async () => {
    await boot();
    expect(text()).toContain("Create account");
    expect(text()).toContain("Sign in with a key");
    expect(text()).toContain("Free play");
    expect(document.getElementById("btn-account")?.textContent).toBe("Sign in");
  });

  it("shows the how-to-play dialog on a first visit only", async () => {
    localStorage.clear();
    await boot();
    expect(document.querySelector(".modal")?.textContent).toContain("How to play");
    await boot();
    expect(document.querySelector(".modal")).toBeNull();
  });
});

describe("accounts", () => {
  it("creates an account, shows the key once and stays signed in", async () => {
    await boot();
    click("#home button", "Create account");
    (document.getElementById("su-name") as HTMLInputElement).value = "grace";
    click(".modal button", "Create account");
    await vi.waitFor(() => expect(document.querySelector(".keybox")).not.toBeNull());
    const key = document.querySelector(".keybox")?.textContent as string;
    expect(key).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}-[A-Z2-9]$/);
    expect(text()).toContain("shown only once");
    const stored = JSON.parse(localStorage.getItem("aw:v2:session") ?? "{}");
    expect(stored).toEqual({ key, username: "grace" });

    click(".modal button", "Continue");
    expect(text()).toContain("Today's words");
    expect(document.getElementById("btn-account")?.textContent).toBe("grace");
  });

  it("reports a taken username", async () => {
    await signUp("ada");
    localStorage.removeItem("aw:v2:session");
    await boot();
    click("#home button", "Create account");
    (document.getElementById("su-name") as HTMLInputElement).value = "ADA";
    click(".modal button", "Create account");
    await vi.waitFor(() => expect(text()).toContain("That username is taken"));
  });

  it("signs in with a pasted key", async () => {
    const key = await signUp("linus");
    localStorage.removeItem("aw:v2:session");
    await boot();
    click("#home button", "Sign in with a key");
    (document.getElementById("si-key") as HTMLTextAreaElement).value = key.toLowerCase();
    click(".modal button", "Sign in");
    await vi.waitFor(() =>
      expect(document.getElementById("btn-account")?.textContent).toBe("linus"),
    );
    expect(JSON.parse(localStorage.getItem("aw:v2:session") ?? "{}").username).toBe("linus");
  });

  it("is signed in automatically when a key was saved", async () => {
    await signUp("ken");
    await boot();
    expect(document.getElementById("btn-account")?.textContent).toBe("ken");
    expect(document.querySelectorAll(".card")).toHaveLength(4);
  });

  it("drops a saved key the server no longer accepts", async () => {
    localStorage.setItem(
      "aw:v2:session",
      JSON.stringify({ key: "AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-A", username: "ghost" }),
    );
    await boot();
    expect(document.getElementById("btn-account")?.textContent).toBe("Sign in");
    expect(localStorage.getItem("aw:v2:session")).toBeNull();
  });
});

describe("scored games", () => {
  it("plays today's word of a category, hiding the answer until it ends", async () => {
    await signUp();
    await boot();
    click(".card", "Agentic AI");
    await vi.waitFor(() => expect(tilesOf(0)).toHaveLength(firstWord("agentic-ai").length));
    expect(document.getElementById("subtitle")?.textContent).toContain("#1");
    expect(document.body.innerHTML).not.toContain(firstWord("agentic-ai"));

    typeWord(firstWord("agentic-ai"));
    await vi.waitFor(
      () => expect(document.querySelector(".modal")?.textContent).toContain("Nice!"),
      {
        timeout: 3000,
      },
    );
    expect(text()).toContain("Fixture word");
    await vi.waitFor(() => expect(text()).toContain("1 played"));
    expect([...tilesOf(0)].every((t) => (t as HTMLElement).dataset.state === "correct")).toBe(true);
  });

  it("rejects a word that is not in the dictionary", async () => {
    await signUp();
    await boot("/agentic-ai");
    await vi.waitFor(() => expect(tilesOf(0).length).toBeGreaterThan(0));
    typeWord("QQQQ");
    await vi.waitFor(() =>
      expect(document.querySelector(".toast")?.textContent).toBe("Not in word list"),
    );
  });

  it("opens a category directly from its address", async () => {
    await signUp();
    await boot("/machine-learning");
    await vi.waitFor(() =>
      expect(document.getElementById("subtitle")?.textContent).toContain("Machine Learning"),
    );
  });

  it("unlocks the hint after three guesses", async () => {
    await signUp();
    await boot("/agentic-ai");
    await vi.waitFor(() => expect(tilesOf(0).length).toBeGreaterThan(0));
    const hintRow = () => document.getElementById("hint-row") as HTMLElement;
    expect(hintRow().hidden).toBe(true);
    for (const w of ["LAMP", "MOON", "ROCK"]) {
      typeWord(w);
      await vi.waitFor(() =>
        expect(tilesOf(["LAMP", "MOON", "ROCK"].indexOf(w))[0]?.textContent).toBe(w[0]),
      );
      await new Promise((r) => setTimeout(r, 40));
    }
    await vi.waitFor(() => expect(hintRow().hidden).toBe(false));
    click("#btn-hint");
    expect(document.getElementById("hint-text")?.textContent).toBe("Hint: Test fixture.");
  });

  it("moves to the next category from the result dialog", async () => {
    await signUp();
    await boot("/agentic-ai");
    await vi.waitFor(() => expect(tilesOf(0).length).toBeGreaterThan(0));
    typeWord(firstWord("agentic-ai"));
    await vi.waitFor(() => expect(document.querySelector(".modal")).not.toBeNull(), {
      timeout: 3000,
    });
    click(".modal button", "Next category");
    await vi.waitFor(() =>
      expect(document.getElementById("subtitle")?.textContent).toContain("Machine Learning"),
    );
  });

  it("shows today's result on the home cards", async () => {
    await signUp();
    await boot("/agentic-ai");
    await vi.waitFor(() => expect(tilesOf(0).length).toBeGreaterThan(0));
    typeWord(firstWord("agentic-ai"));
    await vi.waitFor(() => expect(document.querySelector(".modal")).not.toBeNull(), {
      timeout: 3000,
    });
    click(".modal button", "Home");
    expect(document.querySelector(".card .status.won")?.textContent).toContain("Solved");
  });
});

describe("free play", () => {
  it("works without an account", async () => {
    await boot();
    click("#home button", "Free play");
    click(".modal button", "Agentic AI");
    await vi.waitFor(() =>
      expect(document.getElementById("subtitle")?.textContent).toContain("Free play"),
    );
    expect(tilesOf(0).length).toBeGreaterThan(0);
  });
});
