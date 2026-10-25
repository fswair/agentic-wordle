import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Db, Stmt } from "../worker/db.ts";

/** An in-memory SQLite database shaped like D1, with the real migration applied. */
export function createDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  // Tests run from several packages, so look for the migrations relative to each.
  const dir = [
    resolve(process.cwd(), "migrations"),
    resolve(process.cwd(), "../web/migrations"),
  ].find(existsSync);
  if (!dir) throw new Error("migrations folder not found");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(resolve(dir, file), "utf8"));
  }

  const stmt = (sql: string, params: unknown[]): Stmt => ({
    bind: (...values) => stmt(sql, values),
    first: async <T>() =>
      (sqlite.prepare(sql).get(...(params as never[])) as T | undefined) ?? null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...(params as never[])) as T[] }),
    run: async () => sqlite.prepare(sql).run(...(params as never[])),
  });
  return { prepare: (sql) => stmt(sql, []) };
}
