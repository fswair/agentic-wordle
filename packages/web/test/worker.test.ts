// @vitest-environment node
import type {
  ApiError,
  CategorySummary,
  GameResponse,
  MeResponse,
  RegisterResponse,
} from "@agentic-wordle/core";
import {
  ensureAllDictionaries,
  registerCategories,
  resetSequenceCache,
  sequence,
} from "@agentic-wordle/core/engine";
import { words } from "@words";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type ApiEnv, handleApi } from "../worker/api.ts";
import { createDb } from "./d1.ts";

const DAY1 = new Date("2026-10-27T12:00:00Z");
const DAY2 = new Date("2026-10-28T12:00:00Z");

let env: ApiEnv;

beforeAll(async () => {
  registerCategories(words);
  resetSequenceCache();
  await ensureAllDictionaries();
});

beforeEach(() => {
  env = { DB: createDb(), TOKEN_SECRET: "test-secret" };
});

async function call<T = unknown>(
  method: string,
  path: string,
  opts: { key?: string; body?: unknown; now?: Date } = {},
): Promise<{ status: number; body: T; raw: string }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  const request = new Request(`https://example.test${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const response = await handleApi(request, env, opts.now ?? DAY1);
  const raw = await response.text();
  return { status: response.status, body: JSON.parse(raw) as T, raw };
}

async function signUp(username = "ada", timezone = "UTC") {
  const r = await call<RegisterResponse>("POST", "/api/register", { body: { username, timezone } });
  return r.body.key;
}

const firstWord = (category: Parameters<typeof sequence>[0]) =>
  sequence(category)[0]?.entry.word as string;

describe("accounts", () => {
  it("registers with a chosen username and returns a one-time key", async () => {
    const r = await call<RegisterResponse>("POST", "/api/register", {
      body: { username: "Ada_1", timezone: "UTC" },
    });
    expect(r.status).toBe(201);
    expect(r.body.username).toBe("Ada_1");
    expect(r.body.key).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}-[A-Z2-9]$/);
  });

  it("stores only a hash of the key", async () => {
    const key = await signUp();
    const row = await env.DB.prepare("SELECT key_hash FROM users").first<{ key_hash: string }>();
    expect(row?.key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.key_hash).not.toContain(key.replace(/-/g, ""));
  });

  it("rejects bad and duplicate usernames, ignoring case", async () => {
    await signUp("Ada");
    const dup = await call<ApiError>("POST", "/api/register", { body: { username: "ADA" } });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("username_taken");
    for (const username of ["ab", "has space", "emoji😀", "x".repeat(21), ""]) {
      const r = await call<ApiError>("POST", "/api/register", { body: { username } });
      expect(r.body.error).toBe("invalid_username");
    }
  });

  it("logs in with the key, however it is typed", async () => {
    const key = await signUp("grace");
    const messy = key.toLowerCase().replace(/-/g, " ");
    const r = await call<MeResponse>("GET", "/api/me", { key: messy });
    expect(r.status).toBe(200);
    expect(r.body.username).toBe("grace");
    expect(r.body.categories).toHaveLength(4);
  });

  it("rejects missing or wrong keys", async () => {
    expect((await call("GET", "/api/me")).status).toBe(401);
    expect((await call("GET", "/api/me", { key: "WRONG-KEY-WRONG-KEY-WRONG-KEY" })).status).toBe(
      401,
    );
    expect(
      (await call("POST", "/api/scored/agentic-ai/start", { key: "WRONG-KEY-WRONG-KEY-WRONG-KEY" }))
        .status,
    ).toBe(401);
  });

  it("deletes an account and its games", async () => {
    const key = await signUp();
    await call("POST", "/api/scored/agentic-ai/start", { key });
    expect((await call("DELETE", "/api/me", { key })).status).toBe(200);
    expect((await call("GET", "/api/me", { key })).status).toBe(401);
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM games").first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});

describe("scored games", () => {
  it("deals the first word of the sequence and never reveals it", async () => {
    const key = await signUp();
    const r = await call<GameResponse>("POST", "/api/scored/agentic-ai/start", { key });
    expect(r.status).toBe(200);
    expect(r.body.game).toMatchObject({ mode: "scored", number: 1, length: 4, status: "playing" });
    expect(r.raw).not.toContain(firstWord("agentic-ai"));
  });

  it("allows one scored game per category per day, returning the same one", async () => {
    const key = await signUp();
    const a = await call<GameResponse>("POST", "/api/scored/agentic-ai/start", { key });
    const b = await call<GameResponse>("POST", "/api/scored/agentic-ai/start", { key });
    expect(b.body.game.number).toBe(a.body.game.number);
    const other = await call<GameResponse>("POST", "/api/scored/it/start", { key });
    expect(other.body.game.category).toBe("it");
  });

  it("keeps guesses on the server and resumes where the player left off", async () => {
    const key = await signUp();
    await call("POST", "/api/scored/agentic-ai/start", { key });
    await call("POST", "/api/scored/agentic-ai/guess", { key, body: { guess: "BOAT" } });
    const resumed = await call<GameResponse>("POST", "/api/scored/agentic-ai/start", { key });
    expect(resumed.body.game.guesses).toEqual(["BOAT"]);
  });

  it("rejects invalid guesses without using a try", async () => {
    const key = await signUp();
    await call("POST", "/api/scored/agentic-ai/start", { key });
    const short = await call<ApiError>("POST", "/api/scored/agentic-ai/guess", {
      key,
      body: { guess: "AB" },
    });
    expect(short.status).toBe(422);
    expect(short.body.error).toBe("too_short");
    const junk = await call<ApiError>("POST", "/api/scored/agentic-ai/guess", {
      key,
      body: { guess: "QQQQ" },
    });
    expect(junk.body.error).toBe("not_in_list");
    const state = await call<GameResponse>("POST", "/api/scored/agentic-ai/start", { key });
    expect(state.body.game.guesses).toEqual([]);
  });

  it("reveals the answer and definition only when the game is won", async () => {
    const key = await signUp();
    await call("POST", "/api/scored/agentic-ai/start", { key });
    const win = await call<GameResponse>("POST", "/api/scored/agentic-ai/guess", {
      key,
      body: { guess: firstWord("agentic-ai") },
    });
    expect(win.body.game).toMatchObject({ status: "won", answer: firstWord("agentic-ai") });
    expect(win.body.game.definition).toContain("Fixture");
    const again = await call<ApiError>("POST", "/api/scored/agentic-ai/guess", {
      key,
      body: { guess: "BOAT" },
    });
    expect(again.status).toBe(409);
  });

  it("moves to the next word on the next day and tracks stats and streak", async () => {
    const key = await signUp();
    for (const [i, now] of [DAY1, DAY2].entries()) {
      await call("POST", "/api/scored/agentic-ai/start", { key, now });
      const sequenceWord = sequence("agentic-ai")[i]?.entry.word as string;
      const r = await call<GameResponse>("POST", "/api/scored/agentic-ai/guess", {
        key,
        now,
        body: { guess: sequenceWord },
      });
      expect(r.body.game.number).toBe(i + 1);
      expect(r.body.game.status).toBe("won");
    }
    const me = await call<MeResponse>("GET", "/api/me", { key, now: DAY2 });
    const cat = me.body.categories.find((c) => c.id === "agentic-ai") as CategorySummary;
    expect(cat.stats).toMatchObject({ played: 2, wins: 2, currentStreak: 2 });
    expect(cat.today).toBe("won");
    expect(cat.solved).toBe(2);
    expect(cat.tiers[0]).toMatchObject({ length: 4, solved: 2 });
  });

  it("counts a game left unfinished on an earlier day as lost", async () => {
    const key = await signUp();
    await call("POST", "/api/scored/agentic-ai/start", { key, now: DAY1 });
    await call("POST", "/api/scored/agentic-ai/start", { key, now: DAY2 });
    const rows = await env.DB.prepare("SELECT status FROM games ORDER BY day").all<{
      status: string;
    }>();
    expect(rows.results.map((r) => r.status)).toEqual(["lost", "playing"]);
  });

  it("starts a new day at midnight in the player's own time zone", async () => {
    const utc = await signUp("utc_user", "UTC");
    const tokyo = await signUp("tokyo_user", "Asia/Tokyo");
    const evening = new Date("2026-10-27T20:00:00Z"); // already the 28th in Tokyo
    for (const key of [utc, tokyo]) {
      await call("POST", "/api/scored/agentic-ai/start", { key, now: DAY1 });
    }
    const after = { now: evening };
    const a = await call<GameResponse>("POST", "/api/scored/agentic-ai/start", {
      key: utc,
      ...after,
    });
    const b = await call<GameResponse>("POST", "/api/scored/agentic-ai/start", {
      key: tokyo,
      ...after,
    });
    expect(a.body.game.number).toBe(1);
    expect(b.body.game.number).toBe(2);
  });

  it("enforces hard mode chosen when the day's game starts", async () => {
    const key = await signUp();
    await call("POST", "/api/scored/agentic-ai/start", { key, body: { hardMode: true } });
    // The answer is KITE. ROCK gives a yellow K, which later guesses must reuse.
    const first = await call<GameResponse>("POST", "/api/scored/agentic-ai/guess", {
      key,
      body: { guess: "ROCK" },
    });
    expect(first.body.game.hardMode).toBe(true);
    const bad = await call<ApiError>("POST", "/api/scored/agentic-ai/guess", {
      key,
      body: { guess: "MOON" },
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toBe("hard_mode_violation");
    expect(bad.body.message).toContain("K");
  });

  it("reports an exhausted sequence", async () => {
    const key = await signUp();
    const all = sequence("it").length;
    for (let i = 0; i < all; i++) {
      const now = new Date(DAY1.getTime() + i * 86_400_000);
      await call("POST", "/api/scored/it/start", { key, now });
      await call("POST", "/api/scored/it/guess", {
        key,
        now,
        body: { guess: sequence("it")[i]?.entry.word },
      });
    }
    const end = new Date(DAY1.getTime() + all * 86_400_000);
    const r = await call<ApiError>("POST", "/api/scored/it/start", { key, now: end });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("sequence_complete");
    const me = await call<MeResponse>("GET", "/api/me", { key, now: end });
    expect(me.body.categories.find((c) => c.id === "it")?.today).toBe("complete");
  });
});

describe("free play", () => {
  it("works without an account and keeps the answer sealed", async () => {
    const start = await call<GameResponse>("POST", "/api/free/start", { body: { category: "it" } });
    expect(start.status).toBe(200);
    const { game } = start.body;
    expect(game).toMatchObject({ mode: "free", category: "it", number: null });
    expect(game.token).toBeTruthy();
    for (const entry of sequence("it")) expect(start.raw).not.toContain(entry.entry.word);
  });

  it("evaluates guesses statelessly through the token", async () => {
    const start = await call<GameResponse>("POST", "/api/free/start", { body: { category: "it" } });
    const guess = "A".repeat(start.body.game.length);
    const bad = await call<ApiError>("POST", "/api/free/guess", {
      body: { token: start.body.game.token, guess },
    });
    expect(bad.body.error).toBe("not_in_list");

    // Guess a real answer of the right length: either right (game over) or colours come back.
    const word = sequence("it").find((i) => i.entry.word.length === start.body.game.length)?.entry
      .word;
    const next = await call<GameResponse>("POST", "/api/free/guess", {
      body: { token: start.body.game.token, guess: word },
    });
    expect(next.body.game.guesses).toEqual([word]);
    expect(next.body.game.evaluations).toHaveLength(1);
  });

  it("rejects tampered tokens", async () => {
    const start = await call<GameResponse>("POST", "/api/free/start", { body: { category: "it" } });
    const token = `${(start.body.game.token as string).slice(0, -4)}AAAA`;
    const r = await call<ApiError>("POST", "/api/free/guess", { body: { token, guess: "GOLD" } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_token");
  });

  it("can draw from a random category", async () => {
    const r = await call<GameResponse>("POST", "/api/free/start", { body: { category: "random" } });
    expect(["agentic-ai", "machine-learning", "software-engineering", "it"]).toContain(
      r.body.game.category,
    );
  });

  it("uses up dealt words so the scored sequence skips them", async () => {
    const key = await signUp();
    const total = sequence("agentic-ai").length;
    for (let i = 0; i < total - 1; i++) {
      await call("POST", "/api/free/start", { key, body: { category: "agentic-ai" } });
    }
    const scored = await call<GameResponse>("POST", "/api/scored/agentic-ai/start", { key });
    expect(scored.status).toBe(200);
    const left = await call<ApiError>("POST", "/api/free/start", {
      key,
      body: { category: "agentic-ai" },
    });
    expect(left.body.error).toBe("no_words_left");
  });

  it("records a finished free game for a signed-in player but does not score it", async () => {
    const key = await signUp();
    const start = await call<GameResponse>("POST", "/api/free/start", {
      key,
      body: { category: "it" },
    });
    const answer = sequence("it").find((i) => i.entry.word.length === start.body.game.length);
    let game = start.body.game;
    // Cycle through same-length answers until the right one is found.
    for (const item of sequence("it").filter((i) => i.entry.word.length === game.length)) {
      const r = await call<GameResponse>("POST", "/api/free/guess", {
        body: { token: game.token, guess: item.entry.word },
      });
      game = r.body.game;
      if (game.status !== "playing") break;
    }
    expect(answer).toBeTruthy();
    const me = await call<MeResponse>("GET", "/api/me", { key });
    const cat = me.body.categories.find((c) => c.id === "it") as CategorySummary;
    expect(cat.stats.played).toBe(0);
    expect(cat.solved).toBe(1);
  });
});
