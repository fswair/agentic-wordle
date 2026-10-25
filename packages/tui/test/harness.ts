import { type Api, createApi } from "@agentic-wordle/core";
import {
  ensureAllDictionaries,
  registerCategories,
  resetSequenceCache,
} from "@agentic-wordle/core/engine";
import { words } from "../../core/test/fixtures/words/index.ts";
import { createDb } from "../../web/test/d1.ts";
import { type ApiEnv, handleApi } from "../../web/worker/api.ts";

/** The real Worker API on an in-memory database, reachable through a fake fetch. */
export async function createBackend() {
  registerCategories(words);
  resetSequenceCache();
  await ensureAllDictionaries();
  const env: ApiEnv = { DB: createDb(), TOKEN_SECRET: "test-secret" };
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) =>
    handleApi(new Request(url, init), env)) as typeof fetch;

  const session: { key: string | null } = { key: null };
  const api: Api = createApi({
    baseUrl: "http://test",
    getKey: () => session.key,
    fetch: fakeFetch,
  });
  return { api, session, env };
}

export const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/** Waits until the rendered screen contains the text, or fails with the last frame. */
export async function waitForText(frame: () => string | undefined, text: string, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (frame()?.includes(text)) return;
    await tick(15);
  }
  throw new Error(`Timed out waiting for "${text}". Last screen:\n${frame()}`);
}
