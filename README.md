# Agentic Wordle

A daily word game for tech terms. Four categories, **Agentic AI**, **Machine Learning**, **Software Engineering** and **IT**, one scored word per category per day, in your terminal or in the browser.

- **Everyone plays the same sequence** in each category: shortest words first (4 letters, then 5, up to 12). Your position is yours: you start at word 1 and move one word per day.
- **Free play** deals extra words you have not seen. It is not scored.
- **Accounts have no email and no password.** You pick a username and get a secret login key once. The server keeps only a hash. Lose the key and the account is gone.
- **The answers never reach the client.** The server checks every guess, so the word lists are not in the repo, the web bundle or the terminal app.

## How it fits together

```
packages/
  core/   shared types + API client (client-safe) and the game engine (server-only)
  web/    Cloudflare Worker (API + static site) and the browser app (Vite, vanilla TS)
  tui/    terminal app (Ink); talks to the same API
private/
  words/  the answer lists (git-ignored, bundled into the Worker at deploy time)
```

- **Worker + D1** (Cloudflare's SQLite). Free tier is plenty. Scored games are stored per player; free play is stateless (the game state travels in an encrypted token).
- `@agentic-wordle/core` exports only client-safe code. The engine lives in `@agentic-wordle/core/engine` and is imported by the Worker alone.
- The page and the terminal app are thin: they send guesses and draw the colours the server returns.

## Development

Requires Node 22+ and pnpm. You also need the private word lists in `private/words/` (see below).

```sh
pnpm install
pnpm db:local           # create the local database (once)
pnpm web:dev            # build the site and run the Worker on http://localhost:8787
pnpm tui -- --api http://localhost:8787   # terminal app against it
pnpm check              # lint + typecheck + word validation + tests
```

`pnpm check` also runs without `private/words/`: word validation is skipped and tests use harmless fixture words.

The Worker needs a `TOKEN_SECRET` for free-play tokens. Locally it is read from `packages/web/.dev.vars` (git-ignored; create it with `TOKEN_SECRET=anything`).

### Terminal app

```sh
agentic-wordle                        # home screen
agentic-wordle --play machine-learning  # open today's word for a category
agentic-wordle --free random          # free play
agentic-wordle --logout               # forget the saved key
```

Flags: `--hard`, `--high-contrast`, `--no-animation`, `--api <url>` (or `AGENTIC_WORDLE_API`). `NO_COLOR=1` switches to a colourless mode that marks letters with brackets. The login key is saved in `~/.config/agentic-wordle/state.json` (owner-only permissions).

## Words

The answer lists are **private**: `private/words/<category>.json`, not committed. The format, rules and a prompt for generating lists with an LLM are in [packages/core/words/README.md](packages/core/words/README.md). Add words with:

```sh
pnpm add-words agentic-ai my-words.json --dry-run
pnpm add-words agentic-ai my-words.json
```

Everyone's sequence is each category sorted by length, then by position in the file. **Only append words:** inserting or reordering changes which word is next for players who are partway through. Guesses are checked against the public-domain ENABLE word list plus all answers (`packages/core/words/dictionary/`).

## Deploying

1. `pnpm --filter @agentic-wordle/web exec wrangler login`
2. `pnpm --filter @agentic-wordle/web exec wrangler d1 create agentic-wordle`, then put the printed `database_id` into `packages/web/wrangler.jsonc`.
3. `pnpm db:remote` to create the tables.
4. `pnpm --filter @agentic-wordle/web exec wrangler secret put TOKEN_SECRET` (any long random string).
5. `pnpm web:deploy`. This bundles `private/words/` into the Worker, so deploy from a machine that has it. There is no CI deploy for that reason.
6. Set `SITE_URL` in `packages/core/src/constants.ts` to the deployed address, and deploy again.

Publishing the terminal app: tag a version (`v0.1.0`); the release workflow runs the checks and `npm publish` (needs an `NPM_TOKEN` secret).

## Privacy

The server stores a username, a hash of the login key, the time zone, and the games played. No email, no IP logging of its own. `DELETE /api/me` (Account → Delete account) removes everything.
