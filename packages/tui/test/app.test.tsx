import { CATEGORY_IDS, type CategoryId } from "@agentic-wordle/core";
import { sequence } from "@agentic-wordle/core/engine";
import { render } from "ink-testing-library";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/app.js";
import { defaultState, type SavedState } from "../src/storage.js";
import { createBackend, tick, waitForText } from "./harness.js";

type Backend = Awaited<ReturnType<typeof createBackend>>;
let backend: Backend;

beforeEach(async () => {
  backend = await createBackend();
});

const firstWord = (category: CategoryId) => sequence(category)[0]?.entry.word as string;

function start(
  opts: { saved?: Partial<SavedState>; start?: Parameters<typeof App>[0]["start"] } = {},
) {
  let persisted = { ...defaultState(), ...opts.saved };
  backend.session.key = persisted.key;
  const app = render(
    <App
      api={backend.api}
      session={backend.session}
      saved={persisted}
      persist={(s) => {
        persisted = s;
      }}
      hardMode={false}
      highContrast={false}
      animate={false}
      start={opts.start}
    />,
  );
  return { ...app, saved: () => persisted };
}

async function type(stdin: { write: (s: string) => void }, text: string) {
  await tick();
  for (const ch of text) {
    stdin.write(ch);
    await tick(10);
  }
}

async function signUp(username = "ada") {
  const { key } = await backend.api.register(username, "UTC");
  return key;
}

describe("signing in", () => {
  it("offers account creation and free play to someone who is signed out", () => {
    const { lastFrame } = start();
    expect(lastFrame()).toContain("create account");
    expect(lastFrame()).toContain("free play");
  });

  it("creates an account, shows the key once and stays signed in", async () => {
    const app = start();
    await tick();
    app.stdin.write("c");
    await type(app.stdin, "grace");
    app.stdin.write("\r");
    await waitForText(app.lastFrame, "Your login key");
    expect(app.lastFrame()).toMatch(/[A-Z2-9]{5}-[A-Z2-9]{5}/);
    expect(app.lastFrame()).toContain("only once");
    expect(app.saved().username).toBe("grace");
    expect(app.saved().key).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}-[A-Z2-9]$/);

    app.stdin.write("\r");
    await waitForText(app.lastFrame, "signed in as grace");
    expect(app.lastFrame()).toContain("Agentic AI");
  });

  it("says when a username is taken", async () => {
    await signUp("ada");
    const app = start();
    await tick();
    app.stdin.write("c");
    await type(app.stdin, "ADA");
    app.stdin.write("\r");
    await waitForText(app.lastFrame, "taken");
  });

  it("signs in by pasting a key", async () => {
    const key = await signUp("linus");
    const app = start();
    await tick();
    app.stdin.write("i");
    await tick();
    app.stdin.write(key.toLowerCase());
    await tick();
    app.stdin.write("\r");
    await waitForText(app.lastFrame, "signed in as linus");
    expect(app.saved().key).toBe(key.toLowerCase());
  });

  it("rejects a wrong key", async () => {
    const app = start();
    await tick();
    app.stdin.write("i");
    await tick();
    app.stdin.write("AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-A");
    await tick();
    app.stdin.write("\r");
    await waitForText(app.lastFrame, "not recognised");
  });

  it("is signed in on start when a key was saved", async () => {
    const key = await signUp("ken");
    const app = start({ saved: { key, username: "ken" } });
    await waitForText(app.lastFrame, "signed in as ken");
  });

  it("signs out and forgets the key", async () => {
    const key = await signUp("ken");
    const app = start({ saved: { key, username: "ken" } });
    await waitForText(app.lastFrame, "signed in as ken");
    app.stdin.write("o");
    await waitForText(app.lastFrame, "create account");
    expect(app.saved().key).toBeNull();
  });
});

describe("scored games", () => {
  it("plays today's word of a category and records the win", async () => {
    const key = await signUp();
    const app = start({ saved: { key, username: "ada" } });
    await waitForText(app.lastFrame, "signed in as ada");
    app.stdin.write("1");
    await waitForText(app.lastFrame, "#1");
    expect(app.lastFrame()).not.toContain(firstWord("agentic-ai"));

    await type(app.stdin, firstWord("agentic-ai"));
    app.stdin.write("\r");
    await waitForText(app.lastFrame, "Solved in 1/6");
    expect(app.lastFrame()).toContain("Fixture word");
    await waitForText(app.lastFrame, "1 played"); // stats refresh from the server
  });

  it("rejects a word that is not in the dictionary", async () => {
    const key = await signUp();
    const app = start({ saved: { key, username: "ada" }, start: { play: "agentic-ai" } });
    await waitForText(app.lastFrame, "#1");
    await type(app.stdin, "QQQQ");
    app.stdin.write("\r");
    await waitForText(app.lastFrame, "Not in word list");
  });

  it("accepts letters and Enter arriving in one input event", async () => {
    const key = await signUp();
    const app = start({ saved: { key, username: "ada" }, start: { play: "agentic-ai" } });
    await waitForText(app.lastFrame, "#1");
    app.stdin.write(`${firstWord("agentic-ai").toLowerCase()}\r`);
    await waitForText(app.lastFrame, "Solved in 1/6");
  });

  it("unlocks the hint after three guesses", async () => {
    const key = await signUp();
    const app = start({ saved: { key, username: "ada" }, start: { play: "agentic-ai" } });
    await waitForText(app.lastFrame, "#1");
    for (const w of ["LAMP", "MOON", "ROCK"]) {
      await type(app.stdin, w);
      app.stdin.write("\r");
      await tick(60);
    }
    await waitForText(app.lastFrame, "[tab] show hint");
    app.stdin.write("\t");
    await waitForText(app.lastFrame, "Hint: Test fixture.");
  });

  it("moves on to the next category with n", async () => {
    const key = await signUp();
    const app = start({ saved: { key, username: "ada" }, start: { play: "agentic-ai" } });
    await waitForText(app.lastFrame, "#1");
    await type(app.stdin, firstWord("agentic-ai"));
    app.stdin.write("\r");
    await waitForText(app.lastFrame, "[n] next category");
    app.stdin.write("n");
    await waitForText(app.lastFrame, "Machine Learning");
    expect(app.lastFrame()).not.toContain("Solved in");
  });

  it("shows today's result on the home screen", async () => {
    const key = await signUp();
    const app = start({ saved: { key, username: "ada" }, start: { play: "agentic-ai" } });
    await waitForText(app.lastFrame, "#1");
    await type(app.stdin, firstWord("agentic-ai"));
    app.stdin.write("\r");
    await waitForText(app.lastFrame, "Solved in");
    app.stdin.write("h");
    await waitForText(app.lastFrame, "solved today");
    expect(CATEGORY_IDS).toHaveLength(4);
  });
});

describe("free play", () => {
  it("works without an account", async () => {
    const app = start();
    await tick();
    app.stdin.write("f");
    await waitForText(app.lastFrame, "FREE PLAY");
    await tick();
    app.stdin.write("\r");
    await waitForText(app.lastFrame, "free play ·");
    expect(app.lastFrame()).toContain("Agentic AI");
  });

  it("starts a random-category word from the command line", async () => {
    const app = start({ start: { free: "random" } });
    await waitForText(app.lastFrame, "free play ·");
  });
});
