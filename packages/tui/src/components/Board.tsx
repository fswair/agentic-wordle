import { type GameView, type LetterState, MAX_GUESSES } from "@agentic-wordle/core";
import { Box, Text } from "ink";
import { plainTile, stateColor, type Theme } from "../theme.js";

interface Props {
  view: GameView;
  /** Letters typed for the guess that has not been sent yet. */
  current: string;
  theme: Theme;
  /** While a submitted row is being revealed: how many of its tiles are already coloured. */
  reveal: { row: number; cols: number } | null;
  /** Blank line between rows when the terminal is tall enough. */
  spaced: boolean;
  /** No gap between tiles, for long words on narrow terminals. */
  compact?: boolean;
}

function Tile({
  letter,
  state,
  theme,
  active,
}: {
  letter: string;
  state: LetterState | null;
  theme: Theme;
  active: boolean;
}) {
  if (state) {
    if (theme.noColor) return <Text bold>{plainTile(letter, state)}</Text>;
    return (
      <Text backgroundColor={stateColor(theme, state)} color="white" bold>{` ${letter} `}</Text>
    );
  }
  if (letter) {
    return theme.noColor ? (
      <Text bold>{`|${letter}|`}</Text>
    ) : (
      <Text backgroundColor="#565758" color="white" bold>{` ${letter} `}</Text>
    );
  }
  return <Text dimColor>{active ? " _ " : " · "}</Text>;
}

export function Board({ view, current, theme, reveal, spaced, compact = false }: Props) {
  const cols = view.length;
  const rows = [];
  for (let r = 0; r < MAX_GUESSES; r++) {
    const submitted = view.guesses[r];
    const typing = r === view.guesses.length && view.status === "playing";
    const tiles = [];
    for (let c = 0; c < cols; c++) {
      let letter = "";
      let state: LetterState | null = null;
      if (submitted) {
        letter = submitted[c] as string;
        const revealed = !reveal || reveal.row !== r || c < reveal.cols;
        state = revealed ? (view.evaluations[r]?.[c] ?? null) : null;
      } else if (typing) {
        letter = current[c] ?? "";
      }
      tiles.push(
        <Box key={c} marginRight={!compact && c < cols - 1 ? 1 : 0}>
          <Tile
            letter={letter}
            state={state}
            theme={theme}
            active={typing && c === current.length}
          />
        </Box>,
      );
    }
    rows.push(
      <Box key={r} marginBottom={spaced && r < MAX_GUESSES - 1 ? 1 : 0}>
        {tiles}
      </Box>,
    );
  }
  return <Box flexDirection="column">{rows}</Box>;
}
