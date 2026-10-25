import { MAX_GUESSES } from "../constants.ts";
import type { Stats } from "../types.ts";

export function emptyStats(): Stats {
  return {
    played: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution: new Array(MAX_GUESSES).fill(0),
    lastCompletedDay: null,
  };
}

export interface ScoredResult {
  /** Local day number the game was played on. */
  day: number;
  won: boolean;
  guessCount: number;
}

/** Folds one scored result into the stats. Results must be added in day order. */
export function recordResult(stats: Stats, result: ScoredResult): Stats {
  const currentStreak = !result.won
    ? 0
    : stats.lastCompletedDay === result.day - 1
      ? stats.currentStreak + 1
      : stats.lastCompletedDay === result.day
        ? stats.currentStreak
        : 1;
  const distribution = [...stats.distribution];
  if (result.won) {
    const i = Math.min(result.guessCount, distribution.length) - 1;
    distribution[i] = (distribution[i] ?? 0) + 1;
  }
  return {
    played: stats.played + 1,
    wins: stats.wins + (result.won ? 1 : 0),
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    distribution,
    lastCompletedDay: result.day,
  };
}

export function computeStats(results: ScoredResult[]): Stats {
  return [...results].sort((a, b) => a.day - b.day).reduce(recordResult, emptyStats());
}

/** The streak a player should see today: it is broken if yesterday was missed. */
export function activeStreak(stats: Stats, today: number): number {
  if (stats.lastCompletedDay === null) return 0;
  return today - stats.lastCompletedDay <= 1 ? stats.currentStreak : 0;
}
