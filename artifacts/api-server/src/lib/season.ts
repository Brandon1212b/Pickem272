type MatchCompletion = {
  week: number;
  isCompleted: boolean;
};

/**
 * A week advances only after every scheduled match in that week has a result.
 * Weeks are evaluated in order so a later week cannot be treated as current
 * while an earlier week is still missing results.
 */
export function getLastCompletedWeek(matches: readonly MatchCompletion[]): number {
  const weeks = [...new Set(matches.map((match) => match.week))].sort((a, b) => a - b);
  let lastCompletedWeek = 0;

  for (const week of weeks) {
    if (week !== lastCompletedWeek + 1) break;

    const weekMatches = matches.filter((match) => match.week === week);
    if (weekMatches.length === 0 || !weekMatches.every((match) => match.isCompleted)) break;

    lastCompletedWeek = week;
  }

  return lastCompletedWeek;
}