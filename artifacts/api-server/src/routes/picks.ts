import { Router } from "express";
import { db, picksTable, matchesTable, seasonConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { SavePicksBody, AutofillPicksBody, GetUserPicksParams, GetUserPicksForWeekParams } from "@workspace/api-zod";

const router = Router();

async function isSeasonLocked(): Promise<boolean> {
  const [cfg] = await db.select().from(seasonConfigTable).limit(1);
  return cfg?.mode === "in-season";
}

function serializePick(p: typeof picksTable.$inferSelect, match?: typeof matchesTable.$inferSelect) {
  return {
    id: p.id,
    userId: p.userId,
    matchId: p.matchId,
    selectedTeam: p.selectedTeam,
    isLock: p.isLock,
    pointsEarned: p.pointsEarned,
    match: match
      ? {
          id: match.id,
          week: match.week,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          winner: match.winner ?? null,
          isCompleted: match.isCompleted,
          pointSpread: match.pointSpread ?? null,
          injuryWeatherFlags: match.injuryWeatherFlags ?? null,
          gameTime: match.gameTime ?? null,
        }
      : undefined,
  };
}

router.get("/picks/user/:userId", async (req, res) => {
  const parsed = GetUserPicksParams.safeParse({ userId: parseInt(req.params.userId, 10) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid userId" }); return; }
  const picks = await db.select().from(picksTable).where(eq(picksTable.userId, parsed.data.userId));
  const matchIds = [...new Set(picks.map((p) => p.matchId))];
  let matchMap: Record<number, typeof matchesTable.$inferSelect> = {};
  if (matchIds.length > 0) {
    const matches = await db.select().from(matchesTable);
    matchMap = Object.fromEntries(matches.map((m) => [m.id, m]));
  }
  res.json(picks.map((p) => serializePick(p, matchMap[p.matchId])));
});

router.get("/picks/user/:userId/week/:week", async (req, res) => {
  const parsed = GetUserPicksForWeekParams.safeParse({
    userId: parseInt(req.params.userId, 10),
    week: parseInt(req.params.week, 10),
  });
  if (!parsed.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const { userId, week } = parsed.data;
  const weekMatches = await db.select().from(matchesTable).where(eq(matchesTable.week, week));
  const weekMatchIds = weekMatches.map((m) => m.id);
  if (weekMatchIds.length === 0) { res.json([]); return; }
  const matchMap = Object.fromEntries(weekMatches.map((m) => [m.id, m]));
  const picks = await db.select().from(picksTable).where(eq(picksTable.userId, userId));
  const weekPicks = picks.filter((p) => weekMatchIds.includes(p.matchId));
  res.json(weekPicks.map((p) => serializePick(p, matchMap[p.matchId])));
});

router.post("/picks/save", async (req, res) => {
  const parsed = SavePicksBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const locked = await isSeasonLocked();
  if (locked) { res.status(403).json({ error: "Season has started, picks are locked" }); return; }
  const { userId, picks } = parsed.data;

  // Validate: at most one lock per week
  const allMatches = await db.select().from(matchesTable);
  const matchMap = Object.fromEntries(allMatches.map((m) => [m.id, m]));

  const locksByWeek: Record<number, number> = {};
  for (const p of picks) {
    const match = matchMap[p.matchId];
    if (!match) continue;
    if (p.isLock) {
      locksByWeek[match.week] = (locksByWeek[match.week] ?? 0) + 1;
      if (locksByWeek[match.week] > 1) {
        res.status(400).json({ error: `Week ${match.week} has more than one lock` });
        return;
      }
    }
  }

  const results: (typeof picksTable.$inferSelect)[] = [];
  for (const p of picks) {
    const existing = await db
      .select()
      .from(picksTable)
      .where(and(eq(picksTable.userId, userId), eq(picksTable.matchId, p.matchId)))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await db
        .update(picksTable)
        .set({ selectedTeam: p.selectedTeam, isLock: p.isLock })
        .where(eq(picksTable.id, existing[0].id))
        .returning();
      results.push(updated);
    } else {
      const [inserted] = await db
        .insert(picksTable)
        .values({ userId, matchId: p.matchId, selectedTeam: p.selectedTeam, isLock: p.isLock, pointsEarned: 0 })
        .returning();
      results.push(inserted);
    }
  }
  res.json(results.map((r) => serializePick(r, matchMap[r.matchId])));
});

router.post("/picks/autofill", async (req, res) => {
  const parsed = AutofillPicksBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const locked = await isSeasonLocked();
  if (locked) { res.status(403).json({ error: "Season has started, picks are locked" }); return; }
  const { userId, mode } = parsed.data;
  const allMatches = await db.select().from(matchesTable);
  const existingPicks = await db.select().from(picksTable).where(eq(picksTable.userId, userId));
  const pickedMatchIds = new Set(existingPicks.map((p) => p.matchId));
  const unpickedMatches = allMatches.filter((m) => !pickedMatchIds.has(m.id));

  // Group by week to assign lock (one per week that has no lock yet)
  const lockedWeeks = new Set<number>();
  for (const p of existingPicks) {
    if (p.isLock) {
      const match = allMatches.find((m) => m.id === p.matchId);
      if (match) lockedWeeks.add(match.week);
    }
  }

  // Group unpicked by week
  const byWeek: Record<number, typeof allMatches> = {};
  for (const m of unpickedMatches) {
    if (!byWeek[m.week]) byWeek[m.week] = [];
    byWeek[m.week].push(m);
  }

  const newPicks: (typeof picksTable.$inferInsert & { matchId: number })[] = [];
  for (const [weekStr, matches] of Object.entries(byWeek)) {
    const week = parseInt(weekStr, 10);
    let assignedLockThisWeek = false;
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      let team: string;
      if (mode === "random") {
        team = Math.random() < 0.5 ? m.homeTeam : m.awayTeam;
      } else if (mode === "favorites") {
        // Negative spread = home team favored; positive or PK = away team favored
        const spread = m.pointSpread ?? "";
        const spreadNum = parseFloat(spread);
        team = (!isNaN(spreadNum) && spreadNum < 0) ? m.homeTeam : m.awayTeam;
      } else {
        // home mode: always pick home team
        team = m.homeTeam;
      }
      // Assign lock to first unpicked match in this week if week not yet locked
      const isLock = !lockedWeeks.has(week) && !assignedLockThisWeek && i === 0;
      if (isLock) assignedLockThisWeek = true;
      newPicks.push({ userId, matchId: m.id, selectedTeam: team, isLock, pointsEarned: 0 });
    }
  }

  const results: (typeof picksTable.$inferSelect)[] = [];
  const matchMap = Object.fromEntries(allMatches.map((m) => [m.id, m]));
  for (const p of newPicks) {
    const [inserted] = await db.insert(picksTable).values(p).returning();
    results.push(inserted);
  }
  res.json(results.map((r) => serializePick(r, matchMap[r.matchId])));
});

export default router;
