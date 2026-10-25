import "./styles.css";
import {
  ApiRequestError,
  buildShareText,
  CATEGORY_IDS,
  CATEGORY_TITLES,
  type CategoryId,
  type CategorySummary,
  createApi,
  type GameView,
  isCategoryId,
  keyboardStates,
  type LetterState,
  MAX_GUESSES,
  type MeResponse,
  type TodayStatus,
  USERNAME_MAX,
  USERNAME_MIN,
} from "@agentic-wordle/core";
import { $, countdownText, h, reducedMotion, sleep } from "./dom.ts";
import {
  clearSession,
  helpSeen,
  loadSession,
  loadSettings,
  markHelpSeen,
  type Session,
  saveSession,
  saveSettings,
} from "./storage.ts";

// ---------- state ----------

let settings = loadSettings();
let session: Session | null = loadSession();
const api = createApi({ baseUrl: "", getKey: () => session?.key ?? null });

let me: MeResponse | null = null;
let view: GameView | null = null;
/** Free play remembers what was asked for, so "another word" draws from the same place. */
let freeChoice: CategoryId | "random" | null = null;
let current = "";
let busy = false;
let hintShown = false;
let modalOpen = false;
let homeNotice = "";

function applySettings(): void {
  const root = document.documentElement;
  root.dataset.theme = settings.light ? "light" : "dark";
  if (settings.highContrast) root.dataset.contrast = "1";
  else delete root.dataset.contrast;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = settings.light ? "#ffffff" : "#121213";
}

function errorText(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "not_in_list") return "Not in word list";
    if (error.code === "too_short") return "Not enough letters";
    return error.message || "Something went wrong";
  }
  return "Something went wrong";
}

// ---------- board ----------

const boardEl = $("board");
const rowEls: HTMLElement[] = [];
const tileEls: HTMLElement[][] = [];

function buildBoard(cols: number): void {
  boardEl.replaceChildren();
  rowEls.length = 0;
  tileEls.length = 0;
  boardEl.style.setProperty("--cols", String(cols));
  boardEl.style.setProperty("--gap", cols > 8 ? "3px" : "5px");
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = h("div", { class: "row", role: "row" });
    const tiles: HTMLElement[] = [];
    for (let c = 0; c < cols; c++) {
      const t = h("div", { class: "tile", role: "gridcell", "aria-label": "empty" });
      tiles.push(t);
      row.append(t);
    }
    rowEls.push(row);
    tileEls.push(tiles);
    boardEl.append(row);
  }
}

function setTile(el: HTMLElement, letter: string, state?: LetterState): void {
  el.textContent = letter;
  el.dataset.letter = letter;
  if (state) el.dataset.state = state;
  else delete el.dataset.state;
  el.setAttribute("aria-label", letter ? (state ? `${letter}, ${state}` : letter) : "empty");
}

/** `skipRow`: a row whose colours are revealed by the flip animation instead. */
function renderBoard(skipRow = -1): void {
  if (!view) return;
  for (let r = 0; r < MAX_GUESSES; r++) {
    for (let c = 0; c < view.length; c++) {
      const el = tileEls[r]?.[c] as HTMLElement;
      el.classList.remove("flip", "pop");
      el.style.animationDelay = "";
      const guess = view.guesses[r];
      if (guess) {
        const state = r === skipRow ? undefined : view.evaluations[r]?.[c];
        setTile(el, guess[c] as string, state);
      } else if (r === view.guesses.length && view.status === "playing") {
        setTile(el, current[c] ?? "");
      } else {
        setTile(el, "");
      }
    }
  }
}

async function animateReveal(row: number): Promise<void> {
  if (!view) return;
  const guess = view.guesses[row] as string;
  const evals = view.evaluations[row] as LetterState[];
  const tiles = tileEls[row] as HTMLElement[];
  if (reducedMotion()) {
    tiles.forEach((t, c) => {
      setTile(t, guess[c] as string, evals[c]);
    });
    return;
  }
  tiles.forEach((t, c) => {
    t.style.animationDelay = `${c * 250}ms`;
    t.classList.add("flip");
    setTimeout(() => setTile(t, guess[c] as string, evals[c]), c * 250 + 250);
  });
  await sleep((tiles.length - 1) * 250 + 520);
  for (const t of tiles) {
    t.classList.remove("flip");
    t.style.animationDelay = "";
  }
}

// ---------- keyboard ----------

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "⏎zxcvbnm⌫"];
const keyEls = new Map<string, HTMLButtonElement>();

function buildKeyboard(): void {
  const root = $("keyboard");
  for (const rowKeys of KEY_ROWS) {
    const row = h("div", { class: "krow" });
    if (rowKeys.length === 9) row.append(h("div", { class: "spacer" }));
    for (const k of rowKeys) {
      const special = k === "⏎" || k === "⌫";
      const name = k === "⏎" ? "Enter" : k === "⌫" ? "Backspace" : k;
      const btn = h(
        "button",
        {
          class: special ? "key wide" : "key",
          type: "button",
          "data-key": name,
          "aria-label": name,
        },
        k === "⏎" ? "enter" : k,
      );
      // pointerdown: respond immediately on touch, and keep focus off the key.
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        handleKey(name);
      });
      if (!special) keyEls.set(k, btn);
      row.append(btn);
    }
    if (rowKeys.length === 9) row.append(h("div", { class: "spacer" }));
    root.append(row);
  }
}

function renderKeyboard(): void {
  const states = view ? keyboardStates(view) : {};
  for (const [letter, el] of keyEls) {
    const s = states[letter.toUpperCase()];
    if (s) el.dataset.state = s;
    else delete el.dataset.state;
  }
}

// ---------- toasts ----------

function toast(message: string, ms = 1600): void {
  const el = h("div", { class: "toast" }, message);
  $("toasts").prepend(el);
  setTimeout(() => el.remove(), ms);
}

function shakeCurrentRow(): void {
  const row = rowEls[view?.guesses.length ?? 0];
  row?.classList.remove("shake");
  void row?.offsetWidth; // restart the animation
  row?.classList.add("shake");
}

// ---------- input ----------

function handleKey(key: string): void {
  if (!view || busy || modalOpen || view.status !== "playing") return;
  if (key === "Enter") {
    void submit();
  } else if (key === "Backspace") {
    current = current.slice(0, -1);
    renderBoard();
  } else if (/^[a-zA-Z]$/.test(key) && current.length < view.length) {
    current += key.toUpperCase();
    renderBoard();
    tileEls[view.guesses.length]?.[current.length - 1]?.classList.add("pop");
  }
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Escape") return closeModal();
  if (modalOpen || !view || $("game").hidden) return;
  if (e.key === "Enter" || e.key === "Backspace" || /^[a-zA-Z]$/.test(e.key)) {
    // Do not let Enter also "click" a focused button.
    if (e.key === "Enter") e.preventDefault();
    handleKey(e.key);
  }
});

async function submit(): Promise<void> {
  if (!view || busy || view.status !== "playing") return;
  if (current.length < view.length) {
    toast("Not enough letters");
    return shakeCurrentRow();
  }
  busy = true;
  let over = false;
  try {
    const next =
      view.mode === "scored"
        ? await api.guessScored(view.category, current)
        : await api.guessFree(view.token as string, current);
    view = next;
    current = "";
    const row = next.guesses.length - 1;
    renderBoard(row);
    await animateReveal(row);
    renderKeyboard();
    renderHint();
    over = next.status !== "playing";
    if (over && !reducedMotion() && next.status === "won") rowEls[row]?.classList.add("win");
  } catch (error) {
    toast(errorText(error));
    shakeCurrentRow();
  } finally {
    busy = false;
  }
  if (over) await finishGame();
}

async function finishGame(): Promise<void> {
  if (session) await refreshMe();
  await sleep(reducedMotion() ? 200 : view?.status === "won" ? 1200 : 500);
  showResult();
}

// ---------- modals ----------

let closeCurrent: (() => void) | null = null;
let countdownTimer: number | undefined;

function openModal(
  titleText: string,
  body: Node[],
  opts: { countdown?: boolean } = {},
): HTMLElement {
  closeModal();
  const close = h("button", { class: "close", type: "button", "aria-label": "Close" }, "✕");
  const modal = h(
    "div",
    { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": titleText },
    close,
    h("h2", {}, titleText),
    ...body,
  );
  const overlay = h("div", { class: "overlay" }, modal);
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) closeModal();
  });
  close.addEventListener("click", closeModal);
  $("modal-root").append(overlay);
  modalOpen = true;
  closeCurrent = () => overlay.remove();
  close.focus();

  if (opts.countdown) {
    const tick = () => {
      for (const el of document.querySelectorAll(".countdown")) el.textContent = countdownText();
    };
    tick();
    countdownTimer = window.setInterval(tick, 1000);
  }
  return modal;
}

function closeModal(): void {
  closeCurrent?.();
  closeCurrent = null;
  modalOpen = false;
  clearInterval(countdownTimer);
}

const button = (label: string, onClick: () => void, cls = "btn") => {
  const b = h("button", { class: cls, type: "button" }, label);
  b.addEventListener("click", onClick);
  return b;
};

function example(state: LetterState, letter: string, text: string): HTMLElement {
  return h(
    "div",
    { class: "example" },
    h("div", { class: "tile", "data-state": state }, letter),
    h("span", {}, text),
  );
}

function showHelp(): void {
  openModal("How to play", [
    h(
      "p",
      {},
      `Guess the word in ${MAX_GUESSES} tries. Each guess must be a real word of the same length.`,
    ),
    h("p", {}, "After each guess, the tiles show how close you were:"),
    example("correct", "A", "is in the word and in the right spot."),
    example("present", "G", "is in the word but in the wrong spot."),
    example("absent", "E", "is not in the word."),
    h(
      "p",
      {},
      "Every day you get one scored word per category: Agentic AI, Machine Learning, Software Engineering and IT. Everybody plays the same sequence, shortest words first. Free play gives extra words you have not seen, with no score.",
    ),
  ]);
}

// ---------- accounts ----------

function renderAccountButton(): void {
  $("btn-account").textContent = session ? session.username : "Sign in";
}

async function refreshMe(): Promise<void> {
  if (!session) {
    me = null;
    return;
  }
  try {
    me = await api.me();
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === "unauthorized") signOut();
  }
}

function signOut(): void {
  clearSession();
  session = null;
  me = null;
  renderAccountButton();
}

function signedIn(next: Session, loaded: MeResponse | null): void {
  session = next;
  saveSession(next);
  me = loaded;
  renderAccountButton();
}

function showSignUp(): void {
  const input = h("input", {
    id: "su-name",
    type: "text",
    autocomplete: "username",
    autocapitalize: "none",
    spellcheck: "false",
    maxlength: String(USERNAME_MAX),
    placeholder: "e.g. grace_hopper",
  });
  const error = h("div", { class: "error", role: "alert" });
  const create = button(
    "Create account",
    async () => {
      error.textContent = "";
      create.disabled = true;
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const result = await api.register(input.value.trim(), timezone);
        signedIn({ key: result.key, username: result.username }, null);
        await refreshMe();
        showKey(result.username, result.key);
      } catch (e) {
        error.textContent =
          e instanceof ApiRequestError && e.code === "username_taken"
            ? "That username is taken. Try another."
            : errorText(e);
        create.disabled = false;
      }
    },
    "btn primary",
  );
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") create.click();
  });
  openModal("Create account", [
    h(
      "p",
      { class: "muted" },
      `Pick a username (${USERNAME_MIN}-${USERNAME_MAX} letters, digits or underscores). You will get a login key: no email, no password.`,
    ),
    h("label", { class: "field" }, "Username", input),
    error,
    h("div", { class: "actions" }, create),
  ]);
  input.focus();
}

function showKey(username: string, key: string): void {
  const copy = button("Copy key", async () => {
    try {
      await navigator.clipboard.writeText(key);
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Select and copy it by hand";
    }
  });
  openModal(`Welcome, ${username}!`, [
    h("p", {}, "This is your login key. It is shown only once."),
    h("div", { class: "keybox" }, key),
    h(
      "p",
      { class: "muted" },
      "Save it somewhere safe. There is no email or password reset: if you lose the key, you lose the account. This browser stays signed in automatically.",
    ),
    h(
      "div",
      { class: "actions" },
      copy,
      button(
        "Continue",
        () => {
          closeModal();
          showHome();
        },
        "btn primary",
      ),
    ),
  ]);
}

function showSignIn(): void {
  const input = h("textarea", {
    id: "si-key",
    rows: "2",
    autocapitalize: "characters",
    spellcheck: "false",
    placeholder: "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X",
  });
  const error = h("div", { class: "error", role: "alert" });
  const go = button(
    "Sign in",
    async () => {
      error.textContent = "";
      go.disabled = true;
      try {
        const key = input.value.trim();
        const loaded = await api.me(key);
        signedIn({ key, username: loaded.username }, loaded);
        closeModal();
        showHome();
      } catch (e) {
        error.textContent =
          e instanceof ApiRequestError && e.code === "unauthorized"
            ? "That key was not recognised."
            : errorText(e);
        go.disabled = false;
      }
    },
    "btn primary",
  );
  openModal("Sign in", [
    h("p", { class: "muted" }, "Paste the login key you were given when you created your account."),
    h("label", { class: "field" }, "Login key", input),
    error,
    h("div", { class: "actions" }, go),
  ]);
  input.focus();
}

function showAccount(): void {
  if (!session) {
    openModal("Account", [
      h("p", {}, "An account saves your progress and statistics. No email needed."),
      h(
        "div",
        { class: "stack" },
        button("Create account", showSignUp, "btn primary"),
        button("Sign in with a key", showSignIn),
      ),
    ]);
    return;
  }
  const keyBox = h("div", { class: "keybox", hidden: "" }, session.key);
  const reveal = button("Show my login key", () => {
    keyBox.hidden = false;
    reveal.hidden = true;
  });
  const remove = button("Delete account", async () => {
    if (!confirm("Delete your account and all progress? This cannot be undone.")) return;
    try {
      await api.deleteAccount();
      signOut();
      closeModal();
      showHome();
    } catch (e) {
      toast(errorText(e));
    }
  });
  remove.classList.add("danger");
  openModal(session.username, [
    h(
      "p",
      { class: "muted" },
      "You are signed in on this browser. Keep your login key to sign in elsewhere.",
    ),
    keyBox,
    h(
      "div",
      { class: "stack" },
      reveal,
      button("Sign out", () => {
        signOut();
        closeModal();
        showHome();
      }),
      remove,
    ),
  ]);
}

// ---------- stats ----------

function statsView(c: CategorySummary): HTMLElement {
  const s = c.stats;
  const winPct = s.played === 0 ? 0 : Math.round((s.wins / s.played) * 100);
  const cell = (value: number, label: string) =>
    h("div", {}, h("b", {}, String(value)), h("span", {}, label));
  const max = Math.max(1, ...s.distribution);
  const dist = h("div", { class: "dist" });
  s.distribution.forEach((n, i) => {
    const bar = h("div", { class: "bar" }, String(n));
    bar.style.width = `${Math.max(8, (n / max) * 100)}%`;
    dist.append(h("span", {}, String(i + 1)), bar);
  });
  const prog = h("div", { class: "prog" });
  for (const t of c.tiers) {
    const fill = h("div", { class: "fill" });
    fill.style.width = `${t.total === 0 ? 0 : (t.solved / t.total) * 100}%`;
    prog.append(
      h("span", {}, `${t.length} letters`),
      h("div", { class: "track" }, fill),
      h("span", { class: "count" }, `${t.solved}/${t.total}`),
    );
  }
  return h(
    "div",
    {},
    h(
      "div",
      { class: "statgrid" },
      cell(s.played, "Played"),
      cell(winPct, "Win %"),
      cell(s.currentStreak, "Streak"),
      cell(s.maxStreak, "Best"),
    ),
    dist,
    h("h2", { style: "margin-top:20px" }, `Words played: ${c.solved}/${c.total}`),
    prog,
  );
}

function showStats(initial?: CategoryId): void {
  if (!session || !me) {
    openModal("Statistics", [
      h("p", {}, "Create an account to track your statistics and progress."),
      h(
        "div",
        { class: "stack" },
        button("Create account", showSignUp, "btn primary"),
        button("Sign in", showSignIn),
      ),
    ]);
    return;
  }
  const data = me;
  const body = h("div");
  const tabs = h("div", { class: "tabs" });
  let selected = initial ?? view?.category ?? "agentic-ai";
  const draw = () => {
    for (const b of tabs.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.id === selected));
    }
    const c = data.categories.find((x) => x.id === selected) as CategorySummary;
    body.replaceChildren(statsView(c));
  };
  for (const c of data.categories) {
    const b = h("button", { type: "button", "data-id": c.id }, c.title);
    b.addEventListener("click", () => {
      selected = c.id;
      draw();
    });
    tabs.append(b);
  }
  openModal(
    "Statistics",
    [
      tabs,
      body,
      h(
        "div",
        { class: "next" },
        "Next words in ",
        h("b", { class: "countdown" }, countdownText()),
      ),
    ],
    { countdown: true },
  );
  draw();
}

// ---------- settings ----------

function showSettings(): void {
  const toggle = (key: keyof typeof settings, label: string, hint: string): HTMLElement => {
    const input = h("input", { type: "checkbox", "aria-label": label });
    input.checked = settings[key];
    input.addEventListener("change", () => {
      settings = { ...settings, [key]: input.checked };
      saveSettings(settings);
      applySettings();
    });
    return h("label", { class: "setting" }, h("div", {}, label, h("small", {}, hint)), input);
  };
  openModal("Settings", [
    toggle(
      "hardMode",
      "Hard mode",
      "Revealed hints must be used in later guesses. Applies to the next game you start.",
    ),
    toggle("highContrast", "High contrast", "Orange and blue instead of green and yellow"),
    toggle("light", "Light theme", "Easier to read in bright rooms"),
  ]);
}

// ---------- home ----------

const STATUS: Record<TodayStatus, string> = {
  available: "Play",
  playing: "In progress",
  won: "Solved ✓",
  lost: "Missed ✗",
  complete: "All played",
};

function showHome(): void {
  closeModal();
  view = null;
  $("game").hidden = true;
  $("home").hidden = false;
  $("subtitle").textContent = "";
  renderHome();
}

function renderHome(): void {
  const home = $("home");
  home.replaceChildren();
  if (homeNotice) home.append(h("p", { class: "error" }, homeNotice));
  if (!session) {
    home.append(
      h("p", { class: "lead" }, "One tech word per category, every day."),
      h(
        "p",
        { class: "muted" },
        "Agentic AI, Machine Learning, Software Engineering and IT. An account saves your progress and statistics. No email needed.",
      ),
      h(
        "div",
        { class: "stack" },
        button("Create account", showSignUp, "btn primary"),
        button("Sign in with a key", showSignIn),
        button("Free play (not scored)", showFreePick),
      ),
    );
    return;
  }
  const cards = h("div", { class: "cards" });
  for (const id of CATEGORY_IDS) {
    const c = me?.categories.find((x) => x.id === id);
    const status = c?.today ?? "available";
    const card = h(
      "button",
      { class: "card", type: "button" },
      h("h3", {}, c?.title ?? CATEGORY_TITLES[id]),
      h("span", { class: `status ${status}` }, c ? STATUS[c.today] : "…"),
      h(
        "span",
        { class: "meta" },
        c ? `${c.solved}/${c.total} words · streak ${c.stats.currentStreak}` : "Loading…",
      ),
    );
    card.addEventListener("click", () => void playScored(id));
    cards.append(card);
  }
  home.append(
    h("p", { class: "lead" }, "Today's words"),
    h("p", { class: "muted" }, "One per category, the next in everyone's sequence."),
    cards,
    h(
      "div",
      { class: "actions" },
      button("Free play", showFreePick),
      button("Statistics", () => showStats()),
    ),
  );
}

function showFreePick(): void {
  const choices: (CategoryId | "random")[] = [...CATEGORY_IDS, "random"];
  openModal("Free play", [
    h("p", { class: "muted" }, "Words you have not been dealt yet. Not scored."),
    h(
      "div",
      { class: "stack" },
      ...choices.map((c) =>
        button(c === "random" ? "Random category" : CATEGORY_TITLES[c], () => {
          closeModal();
          void playFree(c);
        }),
      ),
    ),
  ]);
}

// ---------- playing ----------

function enterGame(next: GameView): void {
  view = next;
  current = "";
  hintShown = false;
  closeModal();
  $("home").hidden = true;
  $("game").hidden = false;
  if (tileEls[0]?.length !== next.length) buildBoard(next.length);
  const tag = next.number !== null ? `#${next.number}` : "Free play";
  $("subtitle").textContent = `${CATEGORY_TITLES[next.category]} · ${tag} · ${next.length} letters`;
  $("progress-line").textContent = next.hardMode ? "Hard mode" : "";
  renderBoard();
  renderKeyboard();
  renderHint();
  if (next.status !== "playing") showResult();
}

async function playScored(category: CategoryId): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    freeChoice = null;
    homeNotice = "";
    enterGame(await api.startScored(category, settings.hardMode));
  } catch (error) {
    homeNotice =
      error instanceof ApiRequestError && error.code === "sequence_complete"
        ? "You have played every word in this category. New words are added over time."
        : errorText(error);
    showHome();
  } finally {
    busy = false;
  }
}

async function playFree(choice: CategoryId | "random"): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    freeChoice = choice;
    homeNotice = "";
    enterGame(await api.startFree(choice, settings.hardMode));
  } catch (error) {
    homeNotice =
      error instanceof ApiRequestError && error.code === "no_words_left"
        ? "No unseen words left there. Try another category."
        : errorText(error);
    showHome();
  } finally {
    busy = false;
  }
}

function renderHint(): void {
  const available = !!view && view.status === "playing" && !!view.hint;
  $("hint-row").hidden = !available;
  $("btn-hint").hidden = hintShown;
  $("hint-text").textContent = hintShown && view?.hint ? `Hint: ${view.hint}` : "";
}

async function share(): Promise<void> {
  if (!view) return;
  const text = buildShareText(view, { url: location.origin, highContrast: settings.highContrast });
  const touch = matchMedia("(pointer: coarse)").matches;
  try {
    if (touch && navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast("Copied results to clipboard");
  } catch {
    // Last resort for browsers without the async clipboard API.
    const ta = h("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    toast(ok ? "Copied results to clipboard" : "Could not copy");
  }
}

function showResult(): void {
  if (!view) return;
  const finished = view;
  const won = finished.status === "won";
  const body: Node[] = [
    h("p", {}, won ? `Solved in ${finished.guesses.length}/${MAX_GUESSES}.` : "Out of tries."),
    h(
      "div",
      { class: "answer" },
      h("strong", {}, finished.answer ?? ""),
      finished.definition ? h("p", {}, finished.definition) : null,
    ),
  ];
  const summary = me?.categories.find((c) => c.id === finished.category);
  if (finished.mode === "scored" && summary) {
    const s = summary.stats;
    body.push(
      h(
        "p",
        { class: "muted" },
        `${s.played} played · ${s.wins} won · streak ${s.currentStreak} · best ${s.maxStreak}`,
      ),
      h("div", { class: "next" }, "Next word in ", h("b", { class: "countdown" }, countdownText())),
    );
  } else if (finished.mode === "free") {
    body.push(h("p", { class: "muted" }, "Free play is not scored."));
  }
  const next = button(finished.mode === "free" ? "Another word" : "Next category", () => {
    closeModal();
    if (finished.mode === "free") void playFree(freeChoice ?? finished.category);
    else {
      const at = CATEGORY_IDS.indexOf(finished.category);
      void playScored(CATEGORY_IDS[(at + 1) % CATEGORY_IDS.length] as CategoryId);
    }
  });
  body.push(
    h(
      "div",
      { class: "actions" },
      button("Share", () => void share(), "btn primary"),
      next,
    ),
    h("div", { class: "actions" }, button("Home", showHome)),
  );
  openModal(won ? "Nice!" : "Better luck next time", body, {
    countdown: finished.mode === "scored",
  });
}

// ---------- boot ----------

applySettings();
buildKeyboard();

$("btn-title").addEventListener("click", showHome);
$("btn-help").addEventListener("click", showHelp);
$("btn-stats").addEventListener("click", () => showStats());
$("btn-settings").addEventListener("click", showSettings);
$("btn-account").addEventListener("click", showAccount);
$("btn-hint").addEventListener("click", () => {
  hintShown = true;
  renderHint();
});

renderAccountButton();
if (session) {
  await refreshMe(); // signs out by itself if the saved key is no longer valid
  renderAccountButton();
}

// A deep link such as /machine-learning opens that category's word for a signed-in player.
const firstSegment = location.pathname.split("/").filter(Boolean)[0] ?? "";
if (session && isCategoryId(firstSegment)) {
  await playScored(firstSegment);
} else {
  showHome();
  if (!session && !helpSeen()) {
    markHelpSeen();
    showHelp();
  }
}
