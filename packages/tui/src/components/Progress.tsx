import type { TierSummary } from "@agentic-wordle/core";
import { Box, Text } from "ink";

function bar(done: number, total: number, width = 16): string {
  const filled = total === 0 ? 0 : Math.round((done / total) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/** How far the player is through each word length of a category. */
export function Progress({ tiers }: { tiers: TierSummary[] }) {
  return (
    <Box flexDirection="column">
      {tiers.map((t) => (
        <Text key={t.length}>
          {`${t.length} letters`.padEnd(10)}
          <Text color={t.solved === t.total ? "green" : undefined}>{bar(t.solved, t.total)}</Text>
          {` ${t.solved}/${t.total}`}
        </Text>
      ))}
    </Box>
  );
}
