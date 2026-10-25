import type { KeyState } from "@agentic-wordle/core";
import { Box, Text } from "ink";
import { plainTile, stateColor, type Theme } from "../theme.js";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

interface Props {
  states: Record<string, KeyState>;
  theme: Theme;
}

export function Keyboard({ states, theme }: Props) {
  return (
    <Box flexDirection="column" alignItems="center">
      {ROWS.map((row) => (
        <Box key={row}>
          {[...row].map((letter) => {
            const state = states[letter] ?? "unused";
            if (theme.noColor) {
              const text = state === "unused" ? ` ${letter} ` : plainTile(letter, state);
              return (
                <Text key={letter} dimColor={state === "absent"}>
                  {text}
                </Text>
              );
            }
            if (state === "unused") {
              return <Text key={letter} color="white">{` ${letter} `}</Text>;
            }
            return (
              <Text key={letter} backgroundColor={stateColor(theme, state)} color="white">
                {` ${letter} `}
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
