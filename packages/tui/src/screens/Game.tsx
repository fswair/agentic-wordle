import {
  ApiRequestError,
  buildShareText,
  CATEGORY_TITLES,
  type CategorySummary,
  type GameView,
  keyboardStates,
  MAX_GUESSES,
  SITE_URL,
} from "@agentic-wordle/core";
import { Box, Text, useInput, useStdout } from "ink";
import { useEffect, useState } from "react";
import { copyToClipboard } from "../clipboard.js";
import { Board } from "../components/Board.js";
import { StatsSummary } from "../components/Distribution.js";
import { Keyboard } from "../components/Keyboard.js";
import { ACCENT, type Theme } from "../theme.js";
import { useTermSize } from "../useTermSize.js";

const RESULT_WIDTH = 46;
const MIN_LEFT_WIDTH = 44;
const PRAISE = ["Genius", "Magnificent", "Impressive", "Splendid", "Great", "Phew"];

interface Props {
  initial: GameView;
  /** The category's progress, for the stats shown after a scored game. */
  summary: CategorySummary | null;
  theme: Theme;
  animate: boolean;
  guess: (guess: string) => Promise<GameView>;
  onFinished: (view: GameView) => void;
  onHome: () => void;
  onNext: () => void;
  nextLabel: string;
}

function errorText(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "not_in_list") return "Not in word list";
    if (error.code === "too_short") return "Not enough letters";
    if (error.code === "game_over") return "This game is already over";
    return error.message || "Something went wrong";
  }
  return "Something went wrong";
}

function countdown(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.floor((next.getTime() - now.getTime()) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function Game({
  initial,
  summary,
  theme,
  animate,
  guess,
  onFinished,
  onHome,
  onNext,
  nextLabel,
}: Props) {
  const { stdout } = useStdout();
  const { rows, columns } = useTermSize();
  const [view, setView] = useState(initial);
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ row: number; cols: number } | null>(null);
  const [showHint, setShowHint] = useState(false);

  const length = view.length;
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(
      () => setReveal(reveal.cols >= length ? null : { row: reveal.row, cols: reveal.cols + 1 }),
      reveal.cols >= length ? 200 : 140,
    );
    return () => clearTimeout(t);
  }, [reveal, length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const finished = view.status !== "playing" && !reveal;
  const hintAvailable = view.status === "playing" && !!view.hint;

  /** Sends a guess to the server and shows the colours it sends back. */
  const send = async (word: string) => {
    setBusy(true);
    try {
      const next = await guess(word);
      setView(next);
      setCurrent("");
      if (animate) setReveal({ row: next.guesses.length - 1, cols: 0 });
      if (next.status !== "playing") onFinished(next);
    } catch (error) {
      setToast(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const share = () => {
    const text = buildShareText(view, { url: SITE_URL, highContrast: theme.highContrast });
    setToast(
      copyToClipboard(text, (s) => stdout.write(s)) ? "Copied to clipboard" : "Could not copy",
    );
  };

  useInput((input, key) => {
    if (key.escape) return onHome();
    if (key.tab) {
      if (hintAvailable) setShowHint(true);
      else if (view.status === "playing") setToast("Hint unlocks after 3 guesses");
      return;
    }
    if (finished) {
      if (input === "c") share();
      else if (input === "n") onNext();
      else if (input === "h" || key.return) onHome();
      return;
    }
    if (reveal || busy) return;
    if (key.backspace || key.delete) return setCurrent((c) => c.slice(0, -1));
    if (key.return) {
      if (current.length < length) return setToast("Not enough letters");
      return void send(current);
    }
    if (!/^[a-zA-Z\r]+$/.test(input) || key.ctrl || key.meta) return;
    // Fast typing or pasting delivers several keys in one event, sometimes with Enter.
    let typed = current;
    for (const ch of input) {
      if (ch === "\r") break;
      if (typed.length < length) typed += ch.toUpperCase();
    }
    setCurrent(typed);
    if (input.includes("\r")) {
      if (typed.length < length) setToast("Not enough letters");
      else void send(typed);
    }
  });

  const shown = reveal ? view.guesses.length - 1 : view.guesses.length;
  const keys = keyboardStates({
    guesses: view.guesses.slice(0, shown),
    evaluations: view.evaluations.slice(0, shown),
  });
  const spaced = rows >= 34;
  const compact = columns < length * 4 + 2;
  const leftWidth = Math.max(MIN_LEFT_WIDTH, length * (compact ? 3 : 4) + 2);
  const sideBySide = columns >= leftWidth + RESULT_WIDTH + 6;
  const tag = view.number !== null ? `#${view.number}` : "free play";

  const resultPanel = (
    <Box
      flexDirection="column"
      width={RESULT_WIDTH}
      borderStyle="round"
      borderColor={ACCENT}
      paddingX={1}
    >
      <Text bold color={view.status === "won" ? "green" : "red"}>
        {view.status === "won"
          ? `${PRAISE[view.guesses.length - 1]}! Solved in ${view.guesses.length}/${MAX_GUESSES}`
          : `The word was ${view.answer}`}
      </Text>
      {view.definition ? (
        <Text>
          <Text bold>{view.answer}</Text> — {view.definition}
        </Text>
      ) : null}
      {view.mode === "scored" && summary ? (
        <Box flexDirection="column" marginTop={1}>
          <StatsSummary stats={summary.stats} streak={summary.stats.currentStreak} />
          <Text dimColor>Next word in {countdown()}</Text>
        </Box>
      ) : null}
      {view.mode === "free" ? (
        <Box marginTop={1}>
          <Text dimColor>Free play is not scored.</Text>
        </Box>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>[c] copy result [n] {nextLabel}</Text>
        <Text dimColor>[h] home</Text>
      </Box>
    </Box>
  );

  return (
    <Box flexDirection="row" alignItems="flex-start">
      <Box flexDirection="column" alignItems="flex-start" width={leftWidth}>
        <Box marginBottom={1}>
          <Text bold color={ACCENT}>
            AGENTIC WORDLE
          </Text>
          <Text
            dimColor
          >{` · ${CATEGORY_TITLES[view.category]} · ${tag} · ${length} letters`}</Text>
          {view.hardMode ? <Text color="red">{" · hard"}</Text> : null}
        </Box>

        <Board
          view={view}
          current={current}
          theme={theme}
          reveal={reveal}
          spaced={spaced}
          compact={compact}
        />

        <Box height={1} marginY={spaced ? 1 : 0}>
          {busy ? (
            <Text dimColor>checking…</Text>
          ) : toast ? (
            <Text inverse>{` ${toast} `}</Text>
          ) : null}
        </Box>

        {finished && !sideBySide ? (
          resultPanel
        ) : (
          <>
            <Keyboard states={keys} theme={theme} />
            <Box marginTop={1} height={1}>
              {showHint && view.hint ? (
                <Text color="yellow">Hint: {view.hint}</Text>
              ) : hintAvailable ? (
                <Text dimColor>[tab] show hint</Text>
              ) : null}
            </Box>
          </>
        )}
      </Box>

      {finished && sideBySide ? <Box marginLeft={2}>{resultPanel}</Box> : null}
    </Box>
  );
}
