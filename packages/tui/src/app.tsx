import {
  type Api,
  ApiRequestError,
  CATEGORY_IDS,
  type CategoryId,
  type GameView,
  type MeResponse,
} from "@agentic-wordle/core";
import { Box, Text, useApp } from "ink";
import { useEffect, useRef, useState } from "react";
import { KeyShown, SignIn, SignUp } from "./screens/Auth.js";
import { Game } from "./screens/Game.js";
import { Home, Welcome } from "./screens/Home.js";
import { FreePick, HelpScreen, StatsScreen } from "./screens/Other.js";
import { type SavedState, saveState } from "./storage.js";
import { detectNoColor, type Theme } from "./theme.js";
import { useTermSize } from "./useTermSize.js";

export interface AppProps {
  api: Api;
  /** Shared with the API client, which reads the key from here on every request. */
  session: { key: string | null };
  saved: SavedState;
  persist?: (s: SavedState) => void;
  hardMode: boolean;
  highContrast: boolean;
  animate: boolean;
  start?: { play?: CategoryId; free?: CategoryId | "random" };
}

type Screen =
  | { name: "welcome" }
  | { name: "home" }
  | { name: "signup" }
  | { name: "signin" }
  | { name: "key"; username: string; key: string }
  | { name: "freepick" }
  | { name: "stats" }
  | { name: "help"; back: "welcome" | "home" }
  | { name: "game"; id: number; view: GameView; free: CategoryId | "random" | null };

const MIN_COLUMNS = 40;
const MIN_ROWS = 24;

export function App(props: AppProps) {
  const { api, session, hardMode: hardFlag } = props;
  const { exit } = useApp();
  const { columns, rows } = useTermSize();
  const saved = useRef(props.saved);
  const persist = props.persist ?? saveState;
  const gameId = useRef(0);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const homeScreen = (): Screen => (session.key ? { name: "home" } : { name: "welcome" });
  const [screen, setScreen] = useState<Screen>(homeScreen);

  const theme: Theme = {
    noColor: detectNoColor(),
    highContrast: props.highContrast || saved.current.settings.highContrast,
  };
  const hardMode = hardFlag || saved.current.settings.hardMode;

  const refresh = async () => {
    try {
      setMe(await api.me());
      setNotice(null);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "unauthorized") {
        signOut("Your saved key is no longer valid. Please sign in again.");
      } else {
        setNotice(error instanceof Error ? error.message : "Could not load your progress.");
      }
    }
  };

  const signOut = (message: string | null = null) => {
    session.key = null;
    saved.current = { ...saved.current, key: null, username: null };
    persist(saved.current);
    setMe(null);
    setNotice(message);
    setScreen({ name: "welcome" });
  };

  const signedIn = (key: string, username: string) => {
    session.key = key;
    saved.current = { ...saved.current, key, username };
    persist(saved.current);
  };

  const openGame = (view: GameView, free: CategoryId | "random" | null) => {
    gameId.current += 1;
    setNotice(null);
    setScreen({ name: "game", id: gameId.current, view, free });
  };

  const playScored = async (category: CategoryId) => {
    try {
      openGame(await api.startScored(category, hardMode), null);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "sequence_complete") {
        setNotice("You have played every word in this category. New words are added over time.");
      } else {
        setNotice(error instanceof Error ? error.message : "Could not start the game.");
      }
      setScreen(homeScreen());
    }
  };

  const playFree = async (choice: CategoryId | "random") => {
    try {
      openGame(await api.startFree(choice, hardMode), choice);
    } catch (error) {
      setNotice(
        error instanceof ApiRequestError && error.code === "no_words_left"
          ? "No unseen words left there. Try another category."
          : error instanceof Error
            ? error.message
            : "Could not start the game.",
      );
      setScreen(homeScreen());
    }
  };

  // Load progress for a saved key, and honour --play / --free from the command line.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on start
  useEffect(() => {
    if (session.key) void refresh();
    const { play, free } = props.start ?? {};
    if (play && session.key) void playScored(play);
    else if (free) void playFree(free);
  }, []);

  if (columns < MIN_COLUMNS || rows < MIN_ROWS) {
    return (
      <Box>
        <Text color="yellow">
          Terminal too small ({columns}×{rows}). Please enlarge to at least {MIN_COLUMNS}×{MIN_ROWS}
          .
        </Text>
      </Box>
    );
  }

  const home = () => setScreen(homeScreen());

  switch (screen.name) {
    case "welcome":
      return (
        <Welcome
          error={notice}
          onSignUp={() => setScreen({ name: "signup" })}
          onSignIn={() => setScreen({ name: "signin" })}
          onFree={() => setScreen({ name: "freepick" })}
          onHelp={() => setScreen({ name: "help", back: "welcome" })}
          onQuit={exit}
        />
      );
    case "signup":
      return (
        <SignUp
          api={api}
          onCancel={home}
          onDone={({ username, key }) => {
            signedIn(key, username);
            void refresh();
            setScreen({ name: "key", username, key });
          }}
        />
      );
    case "signin":
      return (
        <SignIn
          api={api}
          onCancel={home}
          onDone={(key, loaded) => {
            signedIn(key, loaded.username);
            setMe(loaded);
            setNotice(null);
            setScreen({ name: "home" });
          }}
        />
      );
    case "key":
      return (
        <KeyShown
          username={screen.username}
          keyText={screen.key}
          onContinue={() => setScreen({ name: "home" })}
        />
      );
    case "home":
      return (
        <Home
          me={me}
          error={notice}
          onPlay={(category) => void playScored(category)}
          onFree={() => setScreen({ name: "freepick" })}
          onStats={() => me && setScreen({ name: "stats" })}
          onHelp={() => setScreen({ name: "help", back: "home" })}
          onLogout={() => signOut()}
          onQuit={exit}
        />
      );
    case "freepick":
      return <FreePick onPick={(c) => void playFree(c)} onBack={home} />;
    case "stats":
      return me ? <StatsScreen me={me} onBack={home} /> : null;
    case "help":
      return <HelpScreen theme={theme} onBack={home} />;
    case "game":
      return (
        <GameHost
          key={screen.id}
          api={api}
          initial={screen.view}
          summary={me?.categories.find((c) => c.id === screen.view.category) ?? null}
          theme={theme}
          animate={props.animate}
          onFinished={() => session.key && void refresh()}
          onHome={home}
          onNext={() => {
            const { view, free } = screen;
            if (free) return void playFree(free);
            const at = CATEGORY_IDS.indexOf(view.category);
            void playScored(CATEGORY_IDS[(at + 1) % CATEGORY_IDS.length] as CategoryId);
          }}
          nextLabel={screen.free ? "another word" : "next category"}
        />
      );
  }
}

interface HostProps {
  api: Api;
  initial: GameView;
  summary: Parameters<typeof Game>[0]["summary"];
  theme: Theme;
  animate: boolean;
  onFinished: () => void;
  onHome: () => void;
  onNext: () => void;
  nextLabel: string;
}

/** Chooses the right endpoint for a game and carries free play's token between guesses. */
function GameHost({ api, initial, ...rest }: HostProps) {
  const token = useRef(initial.token);
  const guess = async (word: string): Promise<GameView> => {
    if (initial.mode === "scored") return api.guessScored(initial.category, word);
    const next = await api.guessFree(token.current as string, word);
    token.current = next.token ?? token.current;
    return next;
  };
  return <Game initial={initial} guess={guess} {...rest} />;
}
