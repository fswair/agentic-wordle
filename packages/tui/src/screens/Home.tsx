import {
  CATEGORY_IDS,
  type CategoryId,
  type MeResponse,
  type TodayStatus,
} from "@agentic-wordle/core";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { ACCENT } from "../theme.js";

const STATUS: Record<TodayStatus, { text: string; color?: string }> = {
  available: { text: "play today's word", color: ACCENT },
  playing: { text: "in progress", color: "yellow" },
  won: { text: "✓ solved today", color: "green" },
  lost: { text: "✗ missed today", color: "red" },
  complete: { text: "all words played", color: "cyan" },
};

interface HomeProps {
  me: MeResponse | null;
  error: string | null;
  onPlay: (category: CategoryId) => void;
  onFree: () => void;
  onStats: () => void;
  onHelp: () => void;
  onLogout: () => void;
  onQuit: () => void;
}

/** Signed-in home: one word per category per day, plus free play. */
export function Home({ me, error, onPlay, onFree, onStats, onHelp, onLogout, onQuit }: HomeProps) {
  const [index, setIndex] = useState(0);
  useInput((input, key) => {
    if (key.upArrow) setIndex((i) => (i + CATEGORY_IDS.length - 1) % CATEGORY_IDS.length);
    else if (key.downArrow) setIndex((i) => (i + 1) % CATEGORY_IDS.length);
    else if (key.return) onPlay(CATEGORY_IDS[index] as CategoryId);
    else if (/^[1-4]$/.test(input)) onPlay(CATEGORY_IDS[Number(input) - 1] as CategoryId);
    else if (input === "f") onFree();
    else if (input === "s") onStats();
    else if (input === "?") onHelp();
    else if (input === "o") onLogout();
    else if (input === "q") onQuit();
  });

  return (
    <Box flexDirection="column" alignItems="flex-start">
      <Box borderStyle="round" borderColor={ACCENT} paddingX={3}>
        <Text bold color={ACCENT}>
          {"A G E N T I C   W O R D L E"}
        </Text>
      </Box>
      <Text dimColor>{me ? `signed in as ${me.username}` : "loading…"}</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Today</Text>
        {CATEGORY_IDS.map((id, i) => {
          const c = me?.categories.find((x) => x.id === id);
          const status = c ? STATUS[c.today] : { text: "…" };
          return (
            <Text key={id} color={i === index ? ACCENT : undefined}>
              {i === index ? "▸ " : "  "}
              {`${i + 1}  ${(c?.title ?? id).padEnd(22)}`}
              <Text color={status.color}>{status.text.padEnd(20)}</Text>
              <Text dimColor>
                {c ? `${c.solved}/${c.total}  streak ${c.stats.currentStreak}` : ""}
              </Text>
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>{error ? <Text color="red">{error}</Text> : null}</Box>
      <Text dimColor>[f] free play [s] stats [?] help [o] sign out [q] quit</Text>
      <Text dimColor>↑/↓ select · enter play today's word</Text>
    </Box>
  );
}

interface WelcomeProps {
  error: string | null;
  onSignUp: () => void;
  onSignIn: () => void;
  onFree: () => void;
  onHelp: () => void;
  onQuit: () => void;
}

/** Shown when nobody is signed in. Free play works without an account. */
export function Welcome({ error, onSignUp, onSignIn, onFree, onHelp, onQuit }: WelcomeProps) {
  useInput((input) => {
    if (input === "c") onSignUp();
    else if (input === "i") onSignIn();
    else if (input === "f") onFree();
    else if (input === "?") onHelp();
    else if (input === "q") onQuit();
  });
  return (
    <Box flexDirection="column" alignItems="flex-start">
      <Box borderStyle="round" borderColor={ACCENT} paddingX={3}>
        <Text bold color={ACCENT}>
          {"A G E N T I C   W O R D L E"}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text>Four tech words a day, one per category.</Text>
        <Text dimColor>An account saves your progress and stats. No email needed.</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color={ACCENT}>[c]</Text> create account
        </Text>
        <Text>
          <Text color={ACCENT}>[i]</Text> sign in with your key
        </Text>
        <Text>
          <Text color={ACCENT}>[f]</Text> free play (not scored)
        </Text>
        <Text>
          <Text color={ACCENT}>[?]</Text> how to play
        </Text>
        <Text>
          <Text color={ACCENT}>[q]</Text> quit
        </Text>
      </Box>
      <Box marginTop={1}>{error ? <Text color="red">{error}</Text> : null}</Box>
    </Box>
  );
}
