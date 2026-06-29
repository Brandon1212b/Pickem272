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

    // League leader
    // ... existing leaderboard calculation omitted for brevity

    return {
      userId: u.id,
      name: u.name,
      avatar: u.avatar,
      totalPoints,
      correctPicks,
      wrongPicks,
      badges,
      weekHighCount: weekHighScoreCounts[u.id] ?? 0,
      weekLowCount: weekLowScoreCounts[u.id] ?? 0,
    };
  });

  res.json(entries);
});

// New route: team averages based on users' picks (projected wins per team averaged across users)
router.get("/leaderboard/team-averages", async (_req, res) => {
  const users = await db.select().from(usersTable);
  const picks = await db.select().from(picksTable);
  const matches = await db.select().from(matchesTable);

  const userCount = users.length || 1;
  const teams = new Set<string>();
  matches.forEach((m) => { teams.add(m.homeTeam); teams.add(m.awayTeam); });

  const teamTotals: Record<string, number> = {};
  for (const t of Array.from(teams)) teamTotals[t] = 0;

  for (const u of users) {
    const userPicks = picks.filter((p) => p.userId === u.id);
    const records: Record<string, number> = {};
    for (const m of matches) {
      const p = userPicks.find((pp) => pp.matchId === m.id);
      if (!p || !p.selectedTeam) continue;
      const pickedTeam = p.selectedTeam;
      records[pickedTeam] = (records[pickedTeam] || 0) + 1;
    }
    for (const t of Object.keys(teamTotals)) {
      teamTotals[t] += (records[t] || 0);
    }
  }

  const averages = Object.entries(teamTotals).map(([team, totalWins]) => ({ team, averageWins: totalWins / Math.max(userCount, 1) }));
  res.json(averages);
});

export default router;
