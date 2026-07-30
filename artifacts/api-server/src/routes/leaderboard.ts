import { Router } from "express";
import { db, usersTable, picksTable, matchesTable, seasonConfigTable, storylinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/leaderboard", async (_req, res) => {
  const users = await db.select().from(usersTable);
  const picks = await db.select().from(picksTable);
  const matches = await db.select().from(matchesTable);
  const completedMatches = matches.filter((m) => m.isCompleted);
  const completedMatchIds = new Set(completedMatches.map((m) => m.id));

  // Compute per-week high/low score counts
  const completedWeeks = [...new Set(completedMatches.map((m) => m.week))].sort((a, b) => a - b);
  const weekHighScoreCounts: Record<number, number> = {};
  const weekLowScoreCounts: Record<number, number> = {};

  for (const week of completedWeeks) {
    const weekMatchIds = new Set(completedMatches.filter((m) => m.week === week).map((m) => m.id));
    const weekScores = users.map((u) => {
      const pts = picks.filter((p) => p.userId === u.id && weekMatchIds.has(p.matchId))
        .reduce((s, p) => s + p.pointsEarned, 0);
      return { userId: u.id, pts };
    });
    if (weekScores.length === 0) continue;
    const maxPts = Math.max(...weekScores.map((s) => s.pts));
    const minPts = Math.min(...weekScores.map((s) => s.pts));
    if (maxPts > 0) {
      for (const s of weekScores) {
        if (s.pts === maxPts) weekHighScoreCounts[s.userId] = (weekHighScoreCounts[s.userId] ?? 0) + 1;
        if (s.pts === minPts) weekLowScoreCounts[s.userId] = (weekLowScoreCounts[s.userId] ?? 0) + 1;
      }
    }
  }

  const entries = users.map((u) => {
    const userPicks = picks.filter((p) => p.userId === u.id);
    const resolvedPicks = userPicks.filter((p) => completedMatchIds.has(p.matchId));
    const totalPoints = userPicks.reduce((s, p) => s + p.pointsEarned, 0);

    const correctPicks = resolvedPicks.filter((p) => {
      const m = completedMatches.find((m) => m.id === p.matchId);
      return m && p.selectedTeam === m.winner;
    }).length;
    const wrongPicks = resolvedPicks.length - correctPicks;

    const badges: string[] = [];

    // Perfect Week — check ALL completed weeks, award if user got every game right in any week
    let hadPerfectWeek = false;
    for (const week of completedWeeks) {
      const weekMatches = completedMatches.filter((m) => m.week === week);
      if (weekMatches.length === 0) continue;
      const weekPicksByUser = userPicks.filter((p) => weekMatches.some((m) => m.id === p.matchId));
      if (weekPicksByUser.length !== weekMatches.length) continue; // didn't pick all games
      const allCorrect = weekPicksByUser.every((p) => {
        const m = weekMatches.find((m) => m.id === p.matchId);
        return m && p.selectedTeam === m.winner;
      });
      if (allCorrect) { hadPerfectWeek = true; break; }
    }
    if (hadPerfectWeek) badges.push("Perfect Week");

    return {
      userId: u.id,
      name: u.name,
      avatar: u.avatar ?? null,
      totalPoints,
      correctPicks,
      wrongPicks,
      totalPicks: userPicks.length,
      weekHighScoreCount: weekHighScoreCounts[u.id] ?? 0,
      weekLowScoreCount: weekLowScoreCounts[u.id] ?? 0,
      badges,
    };
  });

  entries.sort((a, b) => b.totalPoints - a.totalPoints);

  const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));
  if (ranked.length > 0 && ranked[0] && !ranked[0].badges.includes("League Leader")) {
    ranked[0].badges.push("League Leader");
  }

  res.json(ranked);
});

router.get("/leaderboard/trends", async (_req, res) => {
  const users = await db.select().from(usersTable);
  const picks = await db.select().from(picksTable);
  const matches = await db.select().from(matchesTable);
  const completedMatches = matches.filter((m) => m.isCompleted);
  const weeks = [...new Set(completedMatches.map((m) => m.week))].sort((a, b) => a - b);

  const trends = users.map((u) => {
    const userPicks = picks.filter((p) => p.userId === u.id);
    const weeklyPoints: number[] = [];
    let cumulative = 0;
    for (const week of weeks) {
      const weekMatchIds = new Set(completedMatches.filter((m) => m.week === week).map((m) => m.id));
      const weekPoints = userPicks
        .filter((p) => weekMatchIds.has(p.matchId))
        .reduce((s, p) => s + p.pointsEarned, 0);
      cumulative += weekPoints;
      weeklyPoints.push(cumulative);
    }
    return { userId: u.id, name: u.name, avatar: u.avatar ?? null, weeklyPoints };
  });

  res.json(trends);
});

router.get("/leaderboard/weekly-extremes", async (_req, res) => {
  const picks = await db.select().from(picksTable);
  const matches = await db.select().from(matchesTable);
  const users = await db.select().from(usersTable);
  const completedMatches = matches.filter((m) => m.isCompleted);

  if (completedMatches.length === 0) {
    res.json({ week: 0, topUsers: [], bottomUsers: [] });
    return;
  }

  const lastWeek = Math.max(...completedMatches.map((m) => m.week));
  const lastWeekMatchIds = new Set(completedMatches.filter((m) => m.week === lastWeek).map((m) => m.id));

  const scores = users.map((u) => {
    const weekPicks = picks.filter((p) => p.userId === u.id && lastWeekMatchIds.has(p.matchId));
    const points = weekPicks.reduce((s, p) => s + p.pointsEarned, 0);
    return { userId: u.id, name: u.name, points };
  }).filter((s) => picks.some((p) => p.userId === s.userId && lastWeekMatchIds.has(p.matchId)));

  if (scores.length === 0) {
    res.json({ week: lastWeek, topUsers: [], bottomUsers: [] });
    return;
  }

  const maxPoints = Math.max(...scores.map((s) => s.points));
  const minPoints = Math.min(...scores.map((s) => s.points));
  res.json({
    week: lastWeek,
    topUsers: scores.filter((s) => s.points === maxPoints),
    bottomUsers: scores.filter((s) => s.points === minPoints),
  });
});

router.get("/leaderboard/pick-popularity", async (req, res) => {
  const picks = await db.select().from(picksTable);
  const matches = await db.select().from(matchesTable);
  const users = await db.select().from(usersTable);
  const [cfg] = await db.select().from(seasonConfigTable).limit(1);

  const lastCompleted = cfg?.lastCompletedWeek ?? 0;

  // Optional week query param — defaults to active week
  const weekParam = req.query.week ? parseInt(req.query.week as string, 10) : null;
  const activeWeek = (weekParam && !isNaN(weekParam) && weekParam >= 1 && weekParam <= 18)
    ? weekParam
    : (lastCompleted + 1 <= 18 ? lastCompleted + 1 : 18);

  const weekMatches = matches.filter((m) => m.week === activeWeek);

  const result = weekMatches.map((m) => {
    const matchPicks = picks.filter((p) => p.matchId === m.id);
    const homePicks = matchPicks.filter((p) => p.selectedTeam === m.homeTeam).length;
    const awayPicks = matchPicks.filter((p) => p.selectedTeam === m.awayTeam).length;
    const total = matchPicks.length || 1;

    const homePickerIds = matchPicks.filter((p) => p.selectedTeam === m.homeTeam).map((p) => p.userId);
    const awayPickerIds = matchPicks.filter((p) => p.selectedTeam === m.awayTeam).map((p) => p.userId);
    const homePickerNames = users.filter((u) => homePickerIds.includes(u.id)).map((u) => u.name);
    const awayPickerNames = users.filter((u) => awayPickerIds.includes(u.id)).map((u) => u.name);

    return {
      matchId: m.id,
      week: m.week,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homePickCount: homePicks,
      awayPickCount: awayPicks,
      homePickPct: Math.round((homePicks / total) * 100),
      awayPickPct: Math.round((awayPicks / total) * 100),
      homePickerNames,
      awayPickerNames,
      gameTime: m.gameTime ?? null,
      isCompleted: m.isCompleted,
      winner: m.winner ?? null,
    };
  });

  res.json(result);
});

router.get("/leaderboard/weekly-recap", async (req, res) => {
  const picks = await db.select().from(picksTable);
  const matches = await db.select().from(matchesTable);
  const users = await db.select().from(usersTable);
  const [cfg] = await db.select().from(seasonConfigTable).limit(1);
  const lastCompleted = cfg?.lastCompletedWeek ?? 0;

  const weekParam = req.query.week ? parseInt(req.query.week as string, 10) : null;
  const activeWeek = (weekParam && !isNaN(weekParam) && weekParam >= 1 && weekParam <= 18)
    ? weekParam
    : (lastCompleted + 1 <= 18 ? lastCompleted + 1 : 18);

  const weekMatches = matches.filter((m) => m.week === activeWeek);
  const weekMatchIds = new Set(weekMatches.map((m) => m.id));
  const weekPicks = picks.filter((p) => weekMatchIds.has(p.matchId));

  // Storyline
  const [storylineRow] = await db.select().from(storylinesTable).where(eq(storylinesTable.week, activeWeek)).limit(1);

  // How many unique users submitted picks for this week
  const userIdsWithPicks = new Set(weekPicks.map((p) => p.userId));
  const userCount = users.length; // use total users for percentage (not just those who picked)

  // Per-team pick counts across the week (each person picks one team per game)
  const teamPickCounts: Record<string, { count: number; pickerIds: Set<number> }> = {};
  for (const pick of weekPicks) {
    if (!pick.selectedTeam) continue;
    if (!teamPickCounts[pick.selectedTeam]) teamPickCounts[pick.selectedTeam] = { count: 0, pickerIds: new Set() };
    teamPickCounts[pick.selectedTeam].count++;
    teamPickCounts[pick.selectedTeam].pickerIds.add(pick.userId);
  }

  // All teams appearing in this week's games
  const weekTeams = new Set<string>();
  for (const m of weekMatches) {
    weekTeams.add(m.homeTeam);
    weekTeams.add(m.awayTeam);
  }

  // Teams with at least 1 pick appearing in this week
  const teamTrends = [...weekTeams]
    .filter((t) => teamPickCounts[t])
    .map((team) => {
      const { count, pickerIds } = teamPickCounts[team];
      const pct = userIdsWithPicks.size > 0 ? Math.round((count / userIdsWithPicks.size) * 100) : 0;
      const pickerNames = users.filter((u) => pickerIds.has(u.id)).map((u) => u.name);
      return { team, pickCount: count, pickPct: pct, pickerNames };
    })
    .sort((a, b) => b.pickCount - a.pickCount);

  const mostPicked = teamTrends.slice(0, 5);
  const leastPicked = [...teamTrends].reverse().slice(0, 3).filter((t) => t.pickCount > 0 && t.pickCount <= Math.ceil(userIdsWithPicks.size / 3));

  // Nobody picked
  const nobodyPicked = [...weekTeams].filter((t) => !teamPickCounts[t] && userIdsWithPicks.size > 0);

  // Biggest splits — games closest to 50/50
  const gameSplits = weekMatches
    .filter((m) => {
      const gamePicks = weekPicks.filter((p) => p.matchId === m.id);
      return gamePicks.length > 0;
    })
    .map((m) => {
      const gamePicks = weekPicks.filter((p) => p.matchId === m.id);
      const homePicks = gamePicks.filter((p) => p.selectedTeam === m.homeTeam).length;
      const awayPicks = gamePicks.filter((p) => p.selectedTeam === m.awayTeam).length;
      const total = gamePicks.length || 1;
      const homePct = Math.round((homePicks / total) * 100);
      const awayPct = 100 - homePct;
      // splitScore: 0 = perfect 50/50, higher = more lopsided
      const splitScore = Math.abs(50 - homePct);
      return {
        matchId: m.id,
        awayTeam: m.awayTeam,
        homeTeam: m.homeTeam,
        awayPickPct: awayPct,
        homePickPct: homePct,
        awayPickCount: awayPicks,
        homePickCount: homePicks,
        splitScore,
        gameTime: m.gameTime ?? null,
        isCompleted: m.isCompleted,
        winner: m.winner ?? null,
      };
    })
    .sort((a, b) => a.splitScore - b.splitScore) // closest to 50/50 first
    .slice(0, 4);

  // Highlights
  const highlights: { type: string; headline: string; detail: string; team: string | null }[] = [];

  // Most consensus pick
  if (mostPicked[0] && mostPicked[0].pickPct >= 70) {
    highlights.push({
      type: "consensus-pick",
      headline: `The league is riding ${mostPicked[0].team}`,
      detail: `${mostPicked[0].pickCount} of ${userIdsWithPicks.size} players (${mostPicked[0].pickPct}%) picked ${mostPicked[0].team} this week.`,
      team: mostPicked[0].team,
    });
  }

  // Biggest upset (completed games — team with fewest picks that won)
  const completedGames = weekMatches.filter((m) => m.isCompleted && m.winner);
  let biggestUpset: { game: typeof weekMatches[0]; upsetPct: number } | null = null;
  for (const m of completedGames) {
    if (!m.winner) continue;
    const gamePicks = weekPicks.filter((p) => p.matchId === m.id);
    const total = gamePicks.length || 1;
    const winnerPicks = gamePicks.filter((p) => p.selectedTeam === m.winner).length;
    const winnerPct = Math.round((winnerPicks / total) * 100);
    if (winnerPct <= 35 && (!biggestUpset || winnerPct < biggestUpset.upsetPct)) {
      biggestUpset = { game: m, upsetPct: winnerPct };
    }
  }
  if (biggestUpset) {
    highlights.push({
      type: "biggest-upset",
      headline: `Upset alert: ${biggestUpset.game.winner} shocks the league`,
      detail: `Only ${biggestUpset.upsetPct}% of players picked ${biggestUpset.game.winner} to win — and they delivered.`,
      team: biggestUpset.game.winner!,
    });
  }

  // Most popular upset pick (pending game — underdog picked by many)
  const pendingGames = weekMatches.filter((m) => !m.isCompleted);
  let popularUpset: { team: string; pickPct: number; opponent: string } | null = null;
  for (const m of pendingGames) {
    if (!m.pointSpread || m.pointSpread === "PK") continue;
    const spread = parseFloat(m.pointSpread);
    if (isNaN(spread) || spread === 0) continue;
    // Negative spread = home team is favorite
    const underdogTeam = spread < 0 ? m.awayTeam : m.homeTeam;
    const favoriteTeam = spread < 0 ? m.homeTeam : m.awayTeam;
    const gamePicks = weekPicks.filter((p) => p.matchId === m.id);
    const total = gamePicks.length || 1;
    const underdogPicks = gamePicks.filter((p) => p.selectedTeam === underdogTeam).length;
    const underdogPct = Math.round((underdogPicks / total) * 100);
    if (underdogPct > 50 && (!popularUpset || underdogPct > popularUpset.pickPct)) {
      popularUpset = { team: underdogTeam, pickPct: underdogPct, opponent: favoriteTeam };
    }
  }
  if (popularUpset) {
    highlights.push({
      type: "upset-watch",
      headline: `${popularUpset.team} is this week's darling underdog`,
      detail: `${popularUpset.pickPct}% of the league is backing ${popularUpset.team} over the favored ${popularUpset.opponent}. Bold call.`,
      team: popularUpset.team,
    });
  }

  // Nobody picked highlight
  if (nobodyPicked.length === 1) {
    highlights.push({
      type: "nobody-picked",
      headline: `Not a single player picked ${nobodyPicked[0]}`,
      detail: `The entire league wrote off ${nobodyPicked[0]} this week. Could they pull the ultimate stunner?`,
      team: nobodyPicked[0],
    });
  } else if (nobodyPicked.length > 1) {
    highlights.push({
      type: "nobody-picked",
      headline: `${nobodyPicked.length} teams were completely ignored`,
      detail: `${nobodyPicked.join(", ")} — not a single pick landed on any of them this week.`,
      team: null,
    });
  }

  // Closest split highlight
  if (gameSplits[0] && gameSplits[0].splitScore <= 5) {
    const g = gameSplits[0];
    highlights.push({
      type: "closest-split",
      headline: `${g.awayTeam} @ ${g.homeTeam}: the league is torn`,
      detail: `${g.awayPickPct}% picked ${g.awayTeam}, ${g.homePickPct}% picked ${g.homeTeam}. This one's a coin flip.`,
      team: null,
    });
  }

  res.json({
    week: activeWeek,
    storyline: storylineRow?.text ?? null,
    userCount,
    mostPicked,
    leastPicked,
    biggestSplits: gameSplits,
    nobodyPicked,
    highlights,
  });
});

router.get("/leaderboard/season-recap", async (_req, res) => {
  const users = await db.select().from(usersTable);
  const picks = await db.select().from(picksTable);
  const matches = await db.select().from(matchesTable);
  const completedMatches = matches.filter((m) => m.isCompleted && m.winner);
  const completedWeeks = [...new Set(completedMatches.map((m) => m.week))].sort((a, b) => a - b);

  if (completedMatches.length === 0) {
    res.json({ achievements: [], weeklyWinners: [] });
    return;
  }

  // Per-user stats
  const userStats = users.map((u) => {
    const userPicks = picks.filter((p) => p.userId === u.id);
    const resolvedPicks = userPicks.filter((p) => completedMatches.some((m) => m.id === p.matchId));
    const correctPicks = resolvedPicks.filter((p) => {
      const m = completedMatches.find((m) => m.id === p.matchId);
      return m && p.selectedTeam === m.winner;
    });
    const totalResolved = resolvedPicks.length;
    const correctCount = correctPicks.length;
    const correctPct = totalResolved > 0 ? Math.round((correctCount / totalResolved) * 100) : 0;

    // Longest correct streak
    const allResolvedSorted = resolvedPicks
      .map((p) => {
        const m = completedMatches.find((m) => m.id === p.matchId);
        return { pick: p, match: m!, correct: !!m && p.selectedTeam === m.winner };
      })
      .filter((x) => x.match)
      .sort((a, b) => a.match.week - b.match.week);

    let maxStreak = 0;
    let currentStreak = 0;
    for (const r of allResolvedSorted) {
      if (r.correct) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    // Count "unique" correct picks: correct picks where < half the league also got right
    const uniqueCorrectCount = correctPicks.filter((p) => {
      const totalPickers = picks.filter((q) => q.matchId === p.matchId && q.selectedTeam === p.selectedTeam).length;
      return totalPickers < Math.ceil(users.length / 2);
    }).length;

    return {
      userId: u.id,
      name: u.name,
      avatar: u.avatar ?? null,
      correctPct,
      correctCount,
      totalResolved,
      maxStreak,
      uniqueCorrectCount,
    };
  }).filter((u) => u.totalResolved > 0);

  const achievements: { type: string; label: string; userId: number; name: string; avatar: string | null; value: number; detail: string }[] = [];

  // Most accurate picker
  const byAccuracy = [...userStats].sort((a, b) => b.correctPct - a.correctPct || b.correctCount - a.correctCount);
  if (byAccuracy[0]) {
    achievements.push({
      type: "most-accurate",
      label: "Sharpest Eye",
      userId: byAccuracy[0].userId,
      name: byAccuracy[0].name,
      avatar: byAccuracy[0].avatar,
      value: byAccuracy[0].correctPct,
      detail: `${byAccuracy[0].correctCount} correct picks — ${byAccuracy[0].correctPct}% accuracy`,
    });
  }

  // Longest correct streak
  const byStreak = [...userStats].sort((a, b) => b.maxStreak - a.maxStreak);
  if (byStreak[0] && byStreak[0].maxStreak >= 3) {
    achievements.push({
      type: "longest-streak",
      label: "Hot Streak",
      userId: byStreak[0].userId,
      name: byStreak[0].name,
      avatar: byStreak[0].avatar,
      value: byStreak[0].maxStreak,
      detail: `${byStreak[0].maxStreak} consecutive correct picks — the longest streak in the league`,
    });
  }

  // Most unique correct picks
  const byUnique = [...userStats].sort((a, b) => b.uniqueCorrectCount - a.uniqueCorrectCount);
  if (byUnique[0] && byUnique[0].uniqueCorrectCount > 0) {
    achievements.push({
      type: "most-unique",
      label: "Contrarian King",
      userId: byUnique[0].userId,
      name: byUnique[0].name,
      avatar: byUnique[0].avatar,
      value: byUnique[0].uniqueCorrectCount,
      detail: `${byUnique[0].uniqueCorrectCount} correct picks where less than half the league agreed`,
    });
  }

  // Weekly winners
  const weeklyWinners: { week: number; userId: number; name: string; avatar: string | null; points: number }[] = [];
  for (const week of completedWeeks) {
    const weekMatchIds = new Set(completedMatches.filter((m) => m.week === week).map((m) => m.id));
    const scores = users.map((u) => {
      const pts = picks.filter((p) => p.userId === u.id && weekMatchIds.has(p.matchId)).reduce((s, p) => s + p.pointsEarned, 0);
      return { userId: u.id, name: u.name, avatar: u.avatar ?? null, points: pts };
    });
    const maxPts = Math.max(...scores.map((s) => s.points));
    const winners = scores.filter((s) => s.points === maxPts && maxPts > 0);
    if (winners[0]) {
      weeklyWinners.push({ week, ...winners[0] });
    }
  }

  res.json({ achievements, weeklyWinners });
});

router.get("/leaderboard/season-status", async (_req, res) => {
  const [cfg] = await db.select().from(seasonConfigTable).limit(1);
  if (!cfg) {
    res.json({ mode: "pre-season", lastCompletedWeek: 0, seasonLocked: false });
    return;
  }
  res.json({
    mode: cfg.mode,
    lastCompletedWeek: cfg.lastCompletedWeek,
    seasonLocked: cfg.mode === "in-season",
  });
});

export default router;
