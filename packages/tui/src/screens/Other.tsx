import {
  CATEGORY_IDS,
  CATEGORY_TITLES,
  type CategoryId,
  type MeResponse,
} from "@agentic-wordle/core";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { StatsSummary } from "../components/Distribution.js";
import { Progress } from "../components/Progress.js";
import { ACCENT, type Theme } from "../theme.js";

export function FreePick({
  onPick,
  onBack,
}: {
  onPick: (choice: CategoryId | "random") => void;
  onBack: () => void;
}) {
  const choices: (CategoryId | "random")[] = [...CATEGORY_IDS, "random"];
  const [index, setIndex] = useState(0);
  useInput((input, key) => {
    if (key.escape) onBack();
    else if (key.upArrow) setIndex((i) => (i + choices.length - 1) % choices.length);
    else if (key.downArrow) setIndex((i) => (i + 1) % choices.length);
    else if (key.return) onPick(choices[index] as CategoryId | "random");
    else if (/^[1-5]$/.test(input)) onPick(choices[Number(input) - 1] as CategoryId | "random");
  });
  return (
    <Box flexDirection="column" alignItems="flex-start">
      <Text bold color={ACCENT}>
        FREE PLAY
      </Text>
      <Text dimColor>Words you have not been dealt yet. Not scored.</Text>
      <Box flexDirection="column" marginTop={1}>
        {choices.map((c, i) => (
          <Text key={c} color={i === index ? ACCENT : undefined}>
            {i === index ? "▸ " : "  "}
            {i + 1} {c === "random" ? "Random category" : CATEGORY_TITLES[c]}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑/↓ select · enter start · esc back</Text>
      </Box>
    </Box>
  );
}

export function StatsScreen({ me, onBack }: { me: MeResponse; onBack: () => void }) {
  const [index, setIndex] = useState(0);
  useInput((_input, key) => {
    if (key.leftArrow) setIndex((i) => (i + me.categories.length - 1) % me.categories.length);
    else if (key.rightArrow) setIndex((i) => (i + 1) % me.categories.length);
    else if (key.escape || key.return) onBack();
  });
  const c = me.categories[index];
  if (!c) return null;
  return (
    <Box flexDirection="column" alignItems="flex-start">
      <Text bold color={ACCENT}>
        {"◂ "}
        {c.title.toUpperCase()}
        {" ▸"}
      </Text>
      <Box marginTop={1}>
        <StatsSummary stats={c.stats} streak={c.stats.currentStreak} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>
          Words played: {c.solved}/{c.total}
        </Text>
        <Progress tiers={c.tiers} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>←/→ category · esc back</Text>
      </Box>
    </Box>
  );
}

export function HelpScreen({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  useInput(() => onBack());
  return (
    <Box flexDirection="column" width={56}>
      <Text bold color={ACCENT}>
        HOW TO PLAY
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          Guess the tech word in 6 tries. Every guess must be a real word of the same length.
        </Text>
        <Box marginTop={1} flexDirection="column">
          {theme.noColor ? (
            <Text>[x] right spot, (x) wrong spot, x not in the word</Text>
          ) : (
            <>
              <Text>
                <Text backgroundColor="#538d4e" color="white">
                  {" A "}
                </Text>{" "}
                right letter, right spot
              </Text>
              <Text>
                <Text backgroundColor="#b59f3b" color="white">
                  {" G "}
                </Text>{" "}
                in the word, wrong spot
              </Text>
              <Text>
                <Text backgroundColor="#3a3a3c" color="white">
                  {" E "}
                </Text>{" "}
                not in the word
              </Text>
            </>
          )}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text>Each day you get one scored word per category, always the next one in</Text>
          <Text>the same order for everyone: short words first, longer ones later.</Text>
          <Text>Free play gives extra words you have not seen. It is not scored.</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Enter submit · Backspace delete · Tab hint (after 3 guesses)</Text>
          <Text dimColor>Esc back to the home screen</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>press any key</Text>
      </Box>
    </Box>
  );
}
