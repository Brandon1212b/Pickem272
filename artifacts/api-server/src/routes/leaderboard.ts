import { Router } from "express";
import { db, usersTable, picksTable, matchesTable, seasonConfigTable } from "@workspace/db";

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
