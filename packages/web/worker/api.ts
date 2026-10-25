import {
  type ApiErrorCode,
  CATEGORY_IDS,
  CATEGORY_TITLES,
  type CategoryId,
  type CategorySummary,
  type FreeGuessRequest,
  type FreeStartRequest,
  type GameResponse,
  type GuessRequest,
  isCategoryId,
  type MeResponse,
  type RegisterRequest,
  type RegisterResponse,
  type ScoredStartRequest,
  type TodayStatus,
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_RE,
} from "@agentic-wordle/core";
import {
  activeStreak,
  computeStats,
  emptyStats,
  ensureAllDictionaries,
  findEntry,
  isValidTimezone,
  localDay,
  newGame,
  nextInSequence,
  replay,
  type ScoredResult,
  sequence,
  submitGuess,
  tierSummary,
  toView,
} from "@agentic-wordle/core/engine";
import { authenticate, bearer, generateKey, hashKey } from "./auth.ts";
import type { Db, GameRow, UserRow } from "./db.ts";
import { openToken, sealToken } from "./token.ts";

export interface ApiEnv {
  DB: Db;
  /** Secret used to seal free-play tokens. Set with `wrangler secret put TOKEN_SECRET`. */
  TOKEN_SECRET: string;
}

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function fail(error: ApiErrorCode, status: number, message?: string): Response {
  return json({ error, ...(message ? { message } : {}) }, status);
}

async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

let dictionariesReady: Promise<void> | null = null;

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] as number) % max;
}

const SCORED_COLUMNS = "category, mode, day, word, number, guesses, status, hard";

function gameFromRow(row: GameRow) {
  const category = row.category as CategoryId;
  const entry = findEntry(category, row.word) ?? { word: row.word, definition: "" };
  const base = newGame(category, row.mode, entry, row.number, row.hard === 1);
  const state = replay(base, JSON.parse(row.guesses) as string[]);
  return { state, entry };
}

async function playedWords(db: Db, userId: string, category: CategoryId): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT word FROM games WHERE user_id = ? AND category = ?")
    .bind(userId, category)
    .all<{ word: string }>();
  return new Set(results.map((r) => r.word));
}

// ---------- handlers ----------

/** Accounts one network may create per day. Shared networks (a school, a company) fit well within it. */
export const MAX_SIGNUPS_PER_DAY = 5;
const MS_PER_DAY = 86_400_000;

/** A per-day, non-reversible label for a network. Missing outside Cloudflare, where no limit applies. */
async function signupBucket(request: Request, secret: string, day: number): Promise<string | null> {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return null;
  const data = new TextEncoder().encode(`${ip}|${secret}|${day}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function register(request: Request, env: ApiEnv, now: Date): Promise<Response> {
  const body = await readJson<RegisterRequest>(request);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (
    username.length < USERNAME_MIN ||
    username.length > USERNAME_MAX ||
    !USERNAME_RE.test(username)
  ) {
    return fail(
      "invalid_username",
      400,
      `Use ${USERNAME_MIN}-${USERNAME_MAX} letters, digits or underscores.`,
    );
  }
  const timezone =
    typeof body.timezone === "string" && isValidTimezone(body.timezone) ? body.timezone : "UTC";

  const day = Math.floor(now.getTime() / MS_PER_DAY);
  const bucket = await signupBucket(request, env.TOKEN_SECRET, day);
  if (bucket) {
    const used = await env.DB.prepare("SELECT n FROM signups WHERE bucket = ?")
      .bind(bucket)
      .first<{ n: number }>();
    if ((used?.n ?? 0) >= MAX_SIGNUPS_PER_DAY) {
      return fail(
        "rate_limited",
        429,
        "Too many accounts were created from this network today. Please try again tomorrow.",
      );
    }
  }

  const taken = await env.DB.prepare("SELECT 1 AS x FROM users WHERE username_lower = ?")
    .bind(username.toLowerCase())
    .first();
  if (taken) return fail("username_taken", 409);

  const key = generateKey();
  try {
    await env.DB.prepare(
      "INSERT INTO users (id, username, username_lower, key_hash, timezone, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        username,
        username.toLowerCase(),
        await hashKey(key),
        timezone,
        Date.now(),
      )
      .run();
  } catch {
    return fail("username_taken", 409); // lost a race with another sign-up
  }
  if (bucket) {
    // Only successful sign-ups count. Old counters are dropped as we go.
    await env.DB.prepare(
      "INSERT INTO signups (bucket, day, n) VALUES (?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET n = n + 1",
    )
      .bind(bucket, day)
      .run();
    await env.DB.prepare("DELETE FROM signups WHERE day < ?")
      .bind(day - 1)
      .run();
  }
  return json({ username, key } satisfies RegisterResponse, 201);
}

/** Stats with the streak a player should see today: it is broken if yesterday was missed. */
function liveStats(scored: ScoredResult[], today: number) {
  const stats = scored.length > 0 ? computeStats(scored) : emptyStats();
  return { ...stats, currentStreak: activeStreak(stats, today) };
}

async function me(user: UserRow, env: ApiEnv, now: Date): Promise<Response> {
  const today = localDay(now, user.timezone);
  const categories: CategorySummary[] = [];
  for (const id of CATEGORY_IDS) {
    const { results } = await env.DB.prepare(
      `SELECT ${SCORED_COLUMNS} FROM games WHERE user_id = ? AND category = ?`,
    )
      .bind(user.id, id)
      .all<GameRow>();
    const played = new Set(results.map((r) => r.word));
    const scored: ScoredResult[] = results
      .filter((r) => r.mode === "scored" && r.status !== "playing")
      .map((r) => ({
        day: r.day,
        won: r.status === "won",
        guessCount: (JSON.parse(r.guesses) as string[]).length,
      }));
    const todayRow = results.find((r) => r.mode === "scored" && r.day === today);
    const status: TodayStatus = todayRow
      ? todayRow.status
      : nextInSequence(id, played)
        ? "available"
        : "complete";
    categories.push({
      id,
      title: CATEGORY_TITLES[id],
      total: sequence(id).length,
      solved: played.size,
      tiers: tierSummary(id, played),
      today: status,
      stats: liveStats(scored, today),
    });
  }
  return json({
    username: user.username,
    timezone: user.timezone,
    categories,
  } satisfies MeResponse);
}

async function startScored(
  request: Request,
  env: ApiEnv,
  user: UserRow,
  category: CategoryId,
  now: Date,
) {
  const day = localDay(now, user.timezone);
  const find = () =>
    env.DB.prepare(
      `SELECT ${SCORED_COLUMNS} FROM games WHERE user_id = ? AND category = ? AND mode = 'scored' AND day = ?`,
    )
      .bind(user.id, category, day)
      .first<GameRow>();

  let row = await find();
  if (!row) {
    // A game left unfinished on an earlier day counts as lost.
    await env.DB.prepare(
      "UPDATE games SET status = 'lost' WHERE user_id = ? AND category = ? AND mode = 'scored' AND status = 'playing' AND day < ?",
    )
      .bind(user.id, category, day)
      .run();

    const next = nextInSequence(category, await playedWords(env.DB, user.id, category));
    if (!next) return fail("sequence_complete", 409);
    const body = await readJson<ScoredStartRequest>(request);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO games (user_id, category, mode, day, word, number, guesses, status, hard, created_at) VALUES (?, ?, 'scored', ?, ?, ?, '[]', 'playing', ?, ?)",
    )
      .bind(user.id, category, day, next.entry.word, next.number, body.hardMode ? 1 : 0, Date.now())
      .run();
    row = await find();
  }
  if (!row) return fail("invalid_request", 500);
  const { state, entry } = gameFromRow(row);
  return json({ game: toView(state, entry) } satisfies GameResponse);
}

async function guessScored(
  request: Request,
  env: ApiEnv,
  user: UserRow,
  category: CategoryId,
  now: Date,
) {
  const day = localDay(now, user.timezone);
  const row = await env.DB.prepare(
    `SELECT ${SCORED_COLUMNS} FROM games WHERE user_id = ? AND category = ? AND mode = 'scored' AND day = ?`,
  )
    .bind(user.id, category, day)
    .first<GameRow>();
  if (!row) return fail("not_found", 404, "Start today's game first.");
  const { state, entry } = gameFromRow(row);
  if (state.status !== "playing") return fail("game_over", 409);

  const body = await readJson<GuessRequest>(request);
  const { state: next, rejected } = submitGuess(state, String(body.guess ?? ""));
  if (rejected) return fail(rejected.code, 422, rejected.message);

  await env.DB.prepare("UPDATE games SET guesses = ?, status = ? WHERE user_id = ? AND word = ?")
    .bind(JSON.stringify(next.guesses), next.status, user.id, row.word)
    .run();
  return json({ game: toView(next, entry) } satisfies GameResponse);
}

async function startFree(request: Request, env: ApiEnv, user: UserRow | null, now: Date) {
  const body = await readJson<FreeStartRequest>(request);
  const wanted = body.category ?? "random";
  if (wanted !== "random" && !isCategoryId(wanted)) return fail("unknown_category", 400);
  const categories: readonly CategoryId[] = wanted === "random" ? CATEGORY_IDS : [wanted];

  // Words the player has not been dealt yet. Anonymous players can get any word.
  const pool: { category: CategoryId; word: string }[] = [];
  for (const category of categories) {
    const played = user ? await playedWords(env.DB, user.id, category) : new Set<string>();
    for (const { entry } of sequence(category)) {
      if (!played.has(entry.word)) pool.push({ category, word: entry.word });
    }
  }
  if (pool.length === 0) return fail("no_words_left", 409);

  const pick = pool[randomInt(pool.length)] as { category: CategoryId; word: string };
  const entry = findEntry(pick.category, pick.word);
  const hard = body.hardMode === true;
  if (user) {
    // Dealt words are used up, even if the player walks away, so they cannot be farmed.
    await env.DB.prepare(
      "INSERT OR IGNORE INTO games (user_id, category, mode, day, word, number, guesses, status, hard, created_at) VALUES (?, ?, 'free', ?, ?, NULL, '[]', 'playing', ?, ?)",
    )
      .bind(
        user.id,
        pick.category,
        localDay(now, user.timezone),
        pick.word,
        hard ? 1 : 0,
        Date.now(),
      )
      .run();
  }
  const state = newGame(
    pick.category,
    "free",
    entry ?? { word: pick.word, definition: "" },
    null,
    hard,
  );
  const token = await sealToken(
    { c: pick.category, w: pick.word, g: [], h: hard, u: user?.id ?? null },
    env.TOKEN_SECRET,
  );
  return json({ game: toView(state, entry, token) } satisfies GameResponse);
}

async function guessFree(request: Request, env: ApiEnv) {
  const body = await readJson<FreeGuessRequest>(request);
  const sealed =
    typeof body.token === "string" ? await openToken(body.token, env.TOKEN_SECRET) : null;
  if (!sealed || !isCategoryId(sealed.c)) return fail("invalid_token", 400);

  const category = sealed.c;
  const entry = findEntry(category, sealed.w) ?? { word: sealed.w, definition: "" };
  const state = replay(newGame(category, "free", entry, null, sealed.h), sealed.g);
  if (state.status !== "playing") return fail("game_over", 409);

  const { state: next, rejected } = submitGuess(state, String(body.guess ?? ""));
  if (rejected) return fail(rejected.code, 422, rejected.message);

  if (next.status !== "playing" && sealed.u) {
    await env.DB.prepare(
      "UPDATE games SET guesses = ?, status = ? WHERE user_id = ? AND word = ? AND mode = 'free'",
    )
      .bind(JSON.stringify(next.guesses), next.status, sealed.u, sealed.w)
      .run();
  }
  const token = await sealToken({ ...sealed, g: next.guesses }, env.TOKEN_SECRET);
  return json({ game: toView(next, findEntry(category, sealed.w), token) } satisfies GameResponse);
}

async function deleteAccount(env: ApiEnv, user: UserRow) {
  await env.DB.prepare("DELETE FROM games WHERE user_id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();
  return json({ ok: true });
}

// ---------- router ----------

export async function handleApi(
  request: Request,
  env: ApiEnv,
  now = new Date(),
): Promise<Response> {
  dictionariesReady ??= ensureAllDictionaries();
  await dictionariesReady;

  const { pathname } = new URL(request.url);
  const parts = pathname
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean);
  const method = request.method;
  const route = `${method} /${parts[0] ?? ""}`;

  if (route === "POST /register") return register(request, env, now);

  // Everything below can use a key. A key that is sent but wrong is an error, not "anonymous".
  const user = await authenticate(env.DB, request);
  if (bearer(request) && !user) return fail("unauthorized", 401);

  if (parts[0] === "free" && method === "POST") {
    if (parts[1] === "start") return startFree(request, env, user, now);
    if (parts[1] === "guess") return guessFree(request, env);
  }

  if (!user) return fail("unauthorized", 401);

  if (parts[0] === "me" && parts.length === 1) {
    if (method === "GET") return me(user, env, now);
    if (method === "DELETE") return deleteAccount(env, user);
  }

  if (parts[0] === "scored" && method === "POST" && parts.length === 3) {
    const category = parts[1] as string;
    if (!isCategoryId(category)) return fail("unknown_category", 400);
    if (parts[2] === "start") return startScored(request, env, user, category, now);
    if (parts[2] === "guess") return guessScored(request, env, user, category, now);
  }

  return fail("not_found", 404);
}
