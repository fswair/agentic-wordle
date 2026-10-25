import { parseArgs } from "node:util";
import { type CategoryId, createApi, isCategoryId, SITE_URL } from "@agentic-wordle/core";
import { render } from "ink";
import { App } from "./app.js";
import { defaultState, loadState, saveState } from "./storage.js";

const VERSION = "0.1.0";

const HELP = `agentic-wordle ${VERSION} — Wordle for tech terms

Usage: agentic-wordle [options]

  -p, --play <category>  open today's word for a category
  -f, --free [category]  start a free-play word (a category, or random)
      --hard             hard mode: revealed hints must be reused
      --high-contrast    orange/blue instead of green/yellow
      --no-animation     skip the tile reveal animation
      --logout           forget the saved login key and exit
      --api <url>        server address (default: ${SITE_URL})
  -h, --help
  -v, --version

Categories: agentic-ai, machine-learning, software-engineering, it
`;

const { values } = parseArgs({
  options: {
    play: { type: "string", short: "p" },
    free: { type: "string", short: "f" },
    hard: { type: "boolean" },
    "high-contrast": { type: "boolean" },
    "no-animation": { type: "boolean" },
    logout: { type: "boolean" },
    api: { type: "string" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}
if (values.version) {
  console.log(VERSION);
  process.exit(0);
}
if (values.logout) {
  saveState(defaultState());
  console.log("Signed out. The saved key was removed from this computer.");
  process.exit(0);
}

const category = (name: string | undefined): CategoryId | undefined => {
  if (name === undefined) return undefined;
  if (!isCategoryId(name)) {
    console.error(
      `Unknown category "${name}". Try: agentic-ai, machine-learning, software-engineering, it`,
    );
    process.exit(1);
  }
  return name;
};

if (!process.stdin.isTTY) {
  console.error("agentic-wordle needs an interactive terminal.");
  process.exit(1);
}

const saved = loadState();
const session = { key: saved.key };
const api = createApi({
  baseUrl: (values.api ?? process.env.AGENTIC_WORDLE_API ?? SITE_URL).replace(/\/$/, ""),
  getKey: () => session.key,
});

const freeArg = values.free;
const free =
  freeArg === undefined
    ? undefined
    : freeArg === "" || freeArg === "random" || (process.argv.includes("--free") && !freeArg)
      ? "random"
      : category(freeArg);

render(
  <App
    api={api}
    session={session}
    saved={saved}
    hardMode={values.hard ?? false}
    highContrast={values["high-contrast"] ?? false}
    animate={!(values["no-animation"] ?? false) && !process.env.CI}
    start={{ play: category(values.play), free }}
  />,
  { exitOnCtrlC: true },
);
