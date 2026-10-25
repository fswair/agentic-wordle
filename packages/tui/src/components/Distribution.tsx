import type { Stats } from "@agentic-wordle/core";
import { Box, Text } from "ink";

export function StatsSummary({ stats, streak }: { stats: Stats; streak: number }) {
  const winPct = stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100);
  const max = Math.max(1, ...stats.distribution);
  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>{stats.played}</Text> played · <Text bold>{winPct}%</Text> wins ·{" "}
        <Text bold>{streak}</Text> streak · <Text bold>{stats.maxStreak}</Text> best
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {stats.distribution.map((n, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length list
          <Text key={i}>
            {i + 1}{" "}
            <Text color="green">
              {"█".repeat(Math.max(n > 0 ? 1 : 0, Math.round((n / max) * 20)))}
            </Text>{" "}
            {n}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
