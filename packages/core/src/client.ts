import type {
  ApiError,
  ApiErrorCode,
  FreeGuessRequest,
  FreeStartRequest,
  GameResponse,
  GameView,
  GuessRequest,
  MeResponse,
  RegisterRequest,
  RegisterResponse,
  ScoredStartRequest,
} from "./api.ts";
import type { CategoryId } from "./types.ts";

export class ApiRequestError extends Error {
  // Plain fields, not constructor parameter properties: this file is also loaded by Node's
  // type stripping, which does not support them.
  code: ApiErrorCode | "network";
  status: number;

  constructor(code: ApiErrorCode | "network", status: number, message?: string) {
    super(message ?? code);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

export interface ApiOptions {
  baseUrl: string;
  /** The player's login key, if signed in. Read on every request so it can change. */
  getKey?: () => string | null;
  fetch?: typeof fetch;
}

export function createApi(options: ApiOptions) {
  const doFetch: typeof fetch = (...args) => (options.fetch ?? fetch)(...args);

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    keyOverride?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const key = keyOverride ?? options.getKey?.() ?? null;
    if (key) headers.authorization = `Bearer ${key}`;

    let response: Response;
    try {
      response = await doFetch(`${options.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError("network", 0, "Cannot reach the server. Check your connection.");
    }
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // fall through to the generic error below
    }
    if (!response.ok) {
      const err = (data ?? {}) as Partial<ApiError>;
      throw new ApiRequestError(err.error ?? "invalid_request", response.status, err.message);
    }
    return data as T;
  }

  return {
    register: (username: string, timezone: string) =>
      request<RegisterResponse>("POST", "/api/register", {
        username,
        timezone,
      } satisfies RegisterRequest),
    /** Pass a key to check it before saving it. */
    me: (key?: string) => request<MeResponse>("GET", "/api/me", undefined, key),
    deleteAccount: () => request<{ ok: true }>("DELETE", "/api/me"),
    startScored: async (category: CategoryId, hardMode = false): Promise<GameView> =>
      (
        await request<GameResponse>("POST", `/api/scored/${category}/start`, {
          hardMode,
        } satisfies ScoredStartRequest)
      ).game,
    guessScored: async (category: CategoryId, guess: string): Promise<GameView> =>
      (
        await request<GameResponse>("POST", `/api/scored/${category}/guess`, {
          guess,
        } satisfies GuessRequest)
      ).game,
    startFree: async (category: CategoryId | "random", hardMode = false): Promise<GameView> =>
      (
        await request<GameResponse>("POST", "/api/free/start", {
          category,
          hardMode,
        } satisfies FreeStartRequest)
      ).game,
    guessFree: async (token: string, guess: string): Promise<GameView> =>
      (
        await request<GameResponse>("POST", "/api/free/guess", {
          token,
          guess,
        } satisfies FreeGuessRequest)
      ).game,
  };
}

export type Api = ReturnType<typeof createApi>;
