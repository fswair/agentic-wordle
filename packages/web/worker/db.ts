/** The small part of Cloudflare D1 the app uses. Lets tests run against a local SQLite. */
export interface Db {
  prepare(sql: string): Stmt;
}

export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface UserRow {
  id: string;
  username: string;
  timezone: string;
}

export interface GameRow {
  category: string;
  mode: "scored" | "free";
  day: number;
  word: string;
  number: number | null;
  guesses: string;
  status: "playing" | "won" | "lost";
  hard: number;
}
