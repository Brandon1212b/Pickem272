import { Router } from "express";
import { db, matchesTable, picksTable, seasonConfigTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { SetMatchResultParams, SetMatchResultBody, UpdateSeasonModeBody } from "@workspace/api-zod";

const router = Router();

router.patch("/admin/match/:matchId/result", async (req, res) => {
  const paramsParsed = SetMatchResultParams.safeParse({ matchId: parseInt(req.params.matchId, 10) });
  if (!paramsParsed.success) { res.status(400).json({ error: "Invalid matchId" }); return; }
  const bodyParsed = SetMatchResultBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { matchId } = paramsParsed.data;
  const { winner } = bodyParsed.data;

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId)).limit(1);
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }

  const [updated] = await db
    .update(matchesTable)
    .set({ winner, isCompleted: true })
    .where(eq(matchesTable.id, matchId))
    .returning();

  const matchPicks = await db.select().from(picksTable).where(eq(picksTable.matchId, matchId));
  for (const pick of matchPicks) {
    const points = pick.selectedTeam === winner ? 1 : 0;
    await db.update(picksTable).set({ pointsEarned: points }).where(eq(picksTable.id, pick.id));
  }

  const allMatches = await db.select().from(matchesTable);
  const completedWeeks = [...new Set(allMatches.filter((m) => m.isCompleted).map((m) => m.week))];
  const lastCompletedWeek = completedWeeks.length > 0 ? Math.max(...completedWeeks) : 0;
  const [cfg] = await db.select().from(seasonConfigTable).limit(1);
  if (cfg) {
    await db.update(seasonConfigTable).set({ lastCompletedWeek }).where(eq(seasonConfigTable.id, cfg.id));
  }

  res.json({
    id: updated.id,
    week: updated.week,
    homeTeam: updated.homeTeam,
    awayTeam: updated.awayTeam,
    winner: updated.winner ?? null,
    isCompleted: updated.isCompleted,
    pointSpread: updated.pointSpread ?? null,
    injuryWeatherFlags: updated.injuryWeatherFlags ?? null,
    gameTime: updated.gameTime ?? null,
  });
});

// Reset all results for a week
router.delete("/admin/weeks/:week/results", async (req, res) => {
  const week = parseInt(req.params.week, 10);
  if (isNaN(week)) { res.status(400).json({ error: "Invalid week" }); return; }

  const weekMatches = await db.select().from(matchesTable).where(eq(matchesTable.week, week));
  if (weekMatches.length === 0) { res.status(404).json({ error: "Week not found" }); return; }

  await db.update(matchesTable)
    .set({ winner: null, isCompleted: false })
    .where(eq(matchesTable.week, week));

  for (const m of weekMatches) {
    await db.update(picksTable).set({ pointsEarned: 0 }).where(eq(picksTable.matchId, m.id));
  }

  const allMatches = await db.select().from(matchesTable);
  const completedWeeks = [...new Set(allMatches.filter((m) => m.isCompleted).map((m) => m.week))];
  const lastCompletedWeek = completedWeeks.length > 0 ? Math.max(...completedWeeks) : 0;
  const [cfg] = await db.select().from(seasonConfigTable).limit(1);
  if (cfg) {
    await db.update(seasonConfigTable).set({ lastCompletedWeek }).where(eq(seasonConfigTable.id, cfg.id));
  }

  res.json({ success: true, week, matchesReset: weekMatches.length });
});


// Returns the most recent pick update time for each user
router.get("/admin/users/last-pick-updates", async (_req, res) => {
  const rows = await db
    .select({
      userId: picksTable.userId,
      lastUpdated: sql<Date>`MAX(${picksTable.updatedAt})`.as("last_updated"),
    })
    .from(picksTable)
    .groupBy(picksTable.userId);

  res.json(
    rows.map((r) => ({
      userId: r.userId,
      lastUpdated: r.lastUpdated.toISOString(),
    }))
  );
});

router.patch("/admin/season", async (req, res) => {
  const parsed = UpdateSeasonModeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { mode } = parsed.data;
  const [cfg] = await db.select().from(seasonConfigTable).limit(1);
  if (cfg) {
    await db.update(seasonConfigTable).set({ mode }).where(eq(seasonConfigTable.id, cfg.id));
  } else {
    await db.insert(seasonConfigTable).values({ mode, lastCompletedWeek: 0 });
  }
  const [updated] = await db.select().from(seasonConfigTable).limit(1);
  res.json({
    mode: updated.mode,
    lastCompletedWeek: updated.lastCompletedWeek,
    seasonLocked: updated.mode === "in-season",
  });
});

router.get("/admin/live-scores", async (_req, res) => {
  try {
    const espnRes = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
      { headers: { "Accept": "application/json" } }
    );
    if (!espnRes.ok) {
      res.status(502).json({ error: `ESPN returned ${espnRes.status}` });
      return;
    }
    const data = await espnRes.json() as any;
    const events = (data.events ?? []) as any[];
    const games = events.map((event: any) => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors ?? [];
      const home = competitors.find((c: any) => c.homeAway === "home");
      const away = competitors.find((c: any) => c.homeAway === "away");
      const status = competition?.status?.type;
      return {
        id: event.id,
        name: event.name,
        homeTeam: home?.team?.abbreviation ?? "",
        awayTeam: away?.team?.abbreviation ?? "",
        homeScore: parseInt(home?.score ?? "0"),
        awayScore: parseInt(away?.score ?? "0"),
        status: status?.name ?? "unknown",
        completed: status?.completed ?? false,
        clock: competition?.status?.displayClock ?? "",
        period: competition?.status?.period ?? 0,
        winner: status?.completed
          ? ((parseInt(home?.score ?? "0") > parseInt(away?.score ?? "0")) ? home?.team?.abbreviation : away?.team?.abbreviation)
          : null,
      };
    });
    res.json({ week: data.week?.number ?? null, games });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// One-time production seed — inserts the 272-game schedule + season_config only if matches table is empty
router.post("/admin/seed-matches", async (_req, res) => {
  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(matchesTable);
  if ((existing[0]?.count ?? 0) > 0) {
    res.json({ seeded: false, message: "Matches already exist — skipping seed." });
    return;
  }

  type MatchSeed = { week: number; homeTeam: string; awayTeam: string; gameTime?: string };
  const schedule: MatchSeed[] = [
    // ── WEEK 1 ──────────────────────────────────────────────────────────────────
    { week: 1, awayTeam: "NE",  homeTeam: "SEA", gameTime: "Wed 8:20pm" },
    { week: 1, awayTeam: "SF",  homeTeam: "LAR", gameTime: "Thu 8:35pm" },
    { week: 1, awayTeam: "ATL", homeTeam: "PIT", gameTime: "Sun 1:00pm" },
    { week: 1, awayTeam: "BAL", homeTeam: "IND", gameTime: "Sun 1:00pm" },
    { week: 1, awayTeam: "BUF", homeTeam: "HOU", gameTime: "Sun 1:00pm" },
    { week: 1, awayTeam: "CHI", homeTeam: "CAR", gameTime: "Sun 1:00pm" },
    { week: 1, awayTeam: "CLE", homeTeam: "JAX", gameTime: "Sun 1:00pm" },
    { week: 1, awayTeam: "NO",  homeTeam: "DET", gameTime: "Sun 1:00pm" },
    { week: 1, awayTeam: "NYJ", homeTeam: "TEN", gameTime: "Sun 1:00pm" },
    { week: 1, awayTeam: "TB",  homeTeam: "CIN", gameTime: "Sun 1:00pm" },
    { week: 1, awayTeam: "ARI", homeTeam: "LAC", gameTime: "Sun 4:25pm" },
    { week: 1, awayTeam: "GB",  homeTeam: "MIN", gameTime: "Sun 4:25pm" },
    { week: 1, awayTeam: "MIA", homeTeam: "LV",  gameTime: "Sun 4:25pm" },
    { week: 1, awayTeam: "WAS", homeTeam: "PHI", gameTime: "Sun 4:25pm" },
    { week: 1, awayTeam: "DAL", homeTeam: "NYG", gameTime: "Sun 8:20pm" },
    { week: 1, awayTeam: "DEN", homeTeam: "KC",  gameTime: "Mon 8:15pm" },
    // ── WEEK 2 ──────────────────────────────────────────────────────────────────
    { week: 2, awayTeam: "DET", homeTeam: "BUF", gameTime: "Thu 8:15pm" },
    { week: 2, awayTeam: "CAR", homeTeam: "ATL", gameTime: "Sun 1:00pm" },
    { week: 2, awayTeam: "CIN", homeTeam: "HOU", gameTime: "Sun 1:00pm" },
    { week: 2, awayTeam: "CLE", homeTeam: "TB",  gameTime: "Sun 1:00pm" },
    { week: 2, awayTeam: "GB",  homeTeam: "NYJ", gameTime: "Sun 1:00pm" },
    { week: 2, awayTeam: "MIN", homeTeam: "CHI", gameTime: "Sun 1:00pm" },
    { week: 2, awayTeam: "NO",  homeTeam: "BAL", gameTime: "Sun 1:00pm" },
    { week: 2, awayTeam: "PHI", homeTeam: "TEN", gameTime: "Sun 1:00pm" },
    { week: 2, awayTeam: "PIT", homeTeam: "NE",  gameTime: "Sun 1:00pm" },
    { week: 2, awayTeam: "JAX", homeTeam: "DEN", gameTime: "Sun 4:05pm" },
    { week: 2, awayTeam: "LV",  homeTeam: "LAC", gameTime: "Sun 4:05pm" },
    { week: 2, awayTeam: "MIA", homeTeam: "SF",  gameTime: "Sun 4:25pm" },
    { week: 2, awayTeam: "SEA", homeTeam: "ARI", gameTime: "Sun 4:25pm" },
    { week: 2, awayTeam: "WAS", homeTeam: "DAL", gameTime: "Sun 4:25pm" },
    { week: 2, awayTeam: "IND", homeTeam: "KC",  gameTime: "Sun 8:20pm" },
    { week: 2, awayTeam: "NYG", homeTeam: "LAR", gameTime: "Mon 8:15pm" },
    // ── WEEK 3 ──────────────────────────────────────────────────────────────────
    { week: 3, awayTeam: "ATL", homeTeam: "GB",  gameTime: "Thu 8:15pm" },
    { week: 3, awayTeam: "CAR", homeTeam: "CLE", gameTime: "Sun 1:00pm" },
    { week: 3, awayTeam: "CIN", homeTeam: "PIT", gameTime: "Sun 1:00pm" },
    { week: 3, awayTeam: "HOU", homeTeam: "IND", gameTime: "Sun 1:00pm" },
    { week: 3, awayTeam: "KC",  homeTeam: "MIA", gameTime: "Sun 1:00pm" },
    { week: 3, awayTeam: "LAC", homeTeam: "BUF", gameTime: "Sun 1:00pm" },
    { week: 3, awayTeam: "NE",  homeTeam: "JAX", gameTime: "Sun 1:00pm" },
    { week: 3, awayTeam: "NYJ", homeTeam: "DET", gameTime: "Sun 1:00pm" },
    { week: 3, awayTeam: "SEA", homeTeam: "WAS", gameTime: "Sun 1:00pm" },
    { week: 3, awayTeam: "TEN", homeTeam: "NYG", gameTime: "Sun 1:00pm" },
    { week: 3, awayTeam: "ARI", homeTeam: "SF",  gameTime: "Sun 4:05pm" },
    { week: 3, awayTeam: "MIN", homeTeam: "TB",  gameTime: "Sun 4:05pm" },
    { week: 3, awayTeam: "BAL", homeTeam: "DAL", gameTime: "Sun 4:25pm" },
    { week: 3, awayTeam: "LV",  homeTeam: "NO",  gameTime: "Sun 4:25pm" },
    { week: 3, awayTeam: "LAR", homeTeam: "DEN", gameTime: "Sun 8:20pm" },
    { week: 3, awayTeam: "PHI", homeTeam: "CHI", gameTime: "Mon 8:15pm" },
    // ── WEEK 4 ──────────────────────────────────────────────────────────────────
    { week: 4, awayTeam: "PIT", homeTeam: "CLE", gameTime: "Thu 8:15pm" },
    { week: 4, awayTeam: "IND", homeTeam: "WAS", gameTime: "Sun 9:30am" },
    { week: 4, awayTeam: "ARI", homeTeam: "NYG", gameTime: "Sun 1:00pm" },
    { week: 4, awayTeam: "DAL", homeTeam: "HOU", gameTime: "Sun 1:00pm" },
    { week: 4, awayTeam: "GB",  homeTeam: "TB",  gameTime: "Sun 1:00pm" },
    { week: 4, awayTeam: "JAX", homeTeam: "CIN", gameTime: "Sun 1:00pm" },
    { week: 4, awayTeam: "LAR", homeTeam: "PHI", gameTime: "Sun 1:00pm" },
    { week: 4, awayTeam: "NE",  homeTeam: "BUF", gameTime: "Sun 1:00pm" },
    { week: 4, awayTeam: "NYJ", homeTeam: "CHI", gameTime: "Sun 1:00pm" },
    { week: 4, awayTeam: "TEN", homeTeam: "BAL", gameTime: "Sun 1:00pm" },
    { week: 4, awayTeam: "MIA", homeTeam: "MIN", gameTime: "Sun 4:05pm" },
    { week: 4, awayTeam: "DEN", homeTeam: "SF",  gameTime: "Sun 4:25pm" },
    { week: 4, awayTeam: "KC",  homeTeam: "LV",  gameTime: "Sun 4:25pm" },
    { week: 4, awayTeam: "LAC", homeTeam: "SEA", gameTime: "Sun 4:25pm" },
    { week: 4, awayTeam: "DET", homeTeam: "CAR", gameTime: "Sun 8:20pm" },
    { week: 4, awayTeam: "ATL", homeTeam: "NO",  gameTime: "Mon 8:15pm" },
    // ── WEEK 5 ──────────────────────────────────────────────────────────────────
    { week: 5, awayTeam: "TB",  homeTeam: "DAL", gameTime: "Thu 8:15pm" },
    { week: 5, awayTeam: "PHI", homeTeam: "JAX", gameTime: "Sun 9:30am" },
    { week: 5, awayTeam: "CIN", homeTeam: "MIA", gameTime: "Sun 1:00pm" },
    { week: 5, awayTeam: "CLE", homeTeam: "NYJ", gameTime: "Sun 1:00pm" },
    { week: 5, awayTeam: "HOU", homeTeam: "TEN", gameTime: "Sun 1:00pm" },
    { week: 5, awayTeam: "IND", homeTeam: "PIT", gameTime: "Sun 1:00pm" },
    { week: 5, awayTeam: "LV",  homeTeam: "NE",  gameTime: "Sun 1:00pm" },
    { week: 5, awayTeam: "MIN", homeTeam: "NO",  gameTime: "Sun 1:00pm" },
    { week: 5, awayTeam: "NYG", homeTeam: "WAS", gameTime: "Sun 1:00pm" },
    { week: 5, awayTeam: "DEN", homeTeam: "LAC", gameTime: "Sun 4:05pm" },
    { week: 5, awayTeam: "CHI", homeTeam: "GB",  gameTime: "Sun 4:25pm" },
    { week: 5, awayTeam: "DET", homeTeam: "ARI", gameTime: "Sun 4:25pm" },
    { week: 5, awayTeam: "SF",  homeTeam: "SEA", gameTime: "Sun 4:25pm" },
    { week: 5, awayTeam: "BAL", homeTeam: "ATL", gameTime: "Sun 8:20pm" },
    { week: 5, awayTeam: "BUF", homeTeam: "LAR", gameTime: "Mon 8:15pm" },
    // ── WEEK 6 ──────────────────────────────────────────────────────────────────
    { week: 6, awayTeam: "SEA", homeTeam: "DEN", gameTime: "Thu 8:15pm" },
    { week: 6, awayTeam: "HOU", homeTeam: "JAX", gameTime: "Sun 9:30am" },
    { week: 6, awayTeam: "BAL", homeTeam: "CLE", gameTime: "Sun 1:00pm" },
    { week: 6, awayTeam: "CAR", homeTeam: "PHI", gameTime: "Sun 1:00pm" },
    { week: 6, awayTeam: "CHI", homeTeam: "ATL", gameTime: "Sun 1:00pm" },
    { week: 6, awayTeam: "NO",  homeTeam: "NYG", gameTime: "Sun 1:00pm" },
    { week: 6, awayTeam: "NYJ", homeTeam: "NE",  gameTime: "Sun 1:00pm" },
    { week: 6, awayTeam: "PIT", homeTeam: "TB",  gameTime: "Sun 1:00pm" },
    { week: 6, awayTeam: "TEN", homeTeam: "IND", gameTime: "Sun 1:00pm" },
    { week: 6, awayTeam: "ARI", homeTeam: "LAR", gameTime: "Sun 4:05pm" },
    { week: 6, awayTeam: "BUF", homeTeam: "LV",  gameTime: "Sun 4:25pm" },
    { week: 6, awayTeam: "LAC", homeTeam: "KC",  gameTime: "Sun 4:25pm" },
    { week: 6, awayTeam: "DAL", homeTeam: "GB",  gameTime: "Sun 8:20pm" },
    { week: 6, awayTeam: "WAS", homeTeam: "SF",  gameTime: "Mon 8:15pm" },
    // ── WEEK 7 ──────────────────────────────────────────────────────────────────
    { week: 7, awayTeam: "NE",  homeTeam: "CHI", gameTime: "Thu 8:15pm" },
    { week: 7, awayTeam: "PIT", homeTeam: "NO",  gameTime: "Sun 9:30am" },
    { week: 7, awayTeam: "CIN", homeTeam: "BAL", gameTime: "Sun 1:00pm" },
    { week: 7, awayTeam: "CLE", homeTeam: "TEN", gameTime: "Sun 1:00pm" },
    { week: 7, awayTeam: "IND", homeTeam: "MIN", gameTime: "Sun 1:00pm" },
    { week: 7, awayTeam: "MIA", homeTeam: "NYJ", gameTime: "Sun 1:00pm" },
    { week: 7, awayTeam: "NYG", homeTeam: "HOU", gameTime: "Sun 1:00pm" },
    { week: 7, awayTeam: "SF",  homeTeam: "ATL", gameTime: "Sun 1:00pm" },
    { week: 7, awayTeam: "TB",  homeTeam: "CAR", gameTime: "Sun 1:00pm" },
    { week: 7, awayTeam: "DEN", homeTeam: "ARI", gameTime: "Sun 4:05pm" },
    { week: 7, awayTeam: "GB",  homeTeam: "DET", gameTime: "Sun 4:25pm" },
    { week: 7, awayTeam: "LAR", homeTeam: "LV",  gameTime: "Sun 4:25pm" },
    { week: 7, awayTeam: "KC",  homeTeam: "SEA", gameTime: "Sun 8:20pm" },
    { week: 7, awayTeam: "DAL", homeTeam: "PHI", gameTime: "Mon 8:15pm" },
    // ── WEEK 8 ──────────────────────────────────────────────────────────────────
    { week: 8, awayTeam: "CAR", homeTeam: "GB",  gameTime: "Thu 8:15pm" },
    { week: 8, awayTeam: "ARI", homeTeam: "DAL", gameTime: "Sun 1:00pm" },
    { week: 8, awayTeam: "ATL", homeTeam: "TB",  gameTime: "Sun 1:00pm" },
    { week: 8, awayTeam: "BAL", homeTeam: "BUF", gameTime: "Sun 1:00pm" },
    { week: 8, awayTeam: "CLE", homeTeam: "PIT", gameTime: "Sun 1:00pm" },
    { week: 8, awayTeam: "IND", homeTeam: "JAX", gameTime: "Sun 1:00pm" },
    { week: 8, awayTeam: "LV",  homeTeam: "NYJ", gameTime: "Sun 1:00pm" },
    { week: 8, awayTeam: "MIN", homeTeam: "DET", gameTime: "Sun 1:00pm" },
    { week: 8, awayTeam: "TEN", homeTeam: "CIN", gameTime: "Sun 1:00pm" },
    { week: 8, awayTeam: "LAC", homeTeam: "LAR", gameTime: "Sun 4:05pm" },
    { week: 8, awayTeam: "KC",  homeTeam: "DEN", gameTime: "Sun 4:25pm" },
    { week: 8, awayTeam: "NE",  homeTeam: "MIA", gameTime: "Sun 4:25pm" },
    { week: 8, awayTeam: "PHI", homeTeam: "WAS", gameTime: "Sun 8:20pm" },
    { week: 8, awayTeam: "CHI", homeTeam: "SEA", gameTime: "Mon 8:15pm" },
    // ── WEEK 9 ──────────────────────────────────────────────────────────────────
    { week: 9, awayTeam: "JAX", homeTeam: "BAL", gameTime: "Thu 8:15pm" },
    { week: 9, awayTeam: "CIN", homeTeam: "ATL", gameTime: "Sun 9:30am" },
    { week: 9, awayTeam: "CLE", homeTeam: "NO",  gameTime: "Sun 1:00pm" },
    { week: 9, awayTeam: "DAL", homeTeam: "IND", gameTime: "Sun 1:00pm" },
    { week: 9, awayTeam: "DEN", homeTeam: "CAR", gameTime: "Sun 1:00pm" },
    { week: 9, awayTeam: "DET", homeTeam: "MIA", gameTime: "Sun 1:00pm" },
    { week: 9, awayTeam: "LAR", homeTeam: "WAS", gameTime: "Sun 1:00pm" },
    { week: 9, awayTeam: "NYG", homeTeam: "PHI", gameTime: "Sun 1:00pm" },
    { week: 9, awayTeam: "NYJ", homeTeam: "KC",  gameTime: "Sun 1:00pm" },
    { week: 9, awayTeam: "HOU", homeTeam: "LAC", gameTime: "Sun 4:05pm" },
    { week: 9, awayTeam: "LV",  homeTeam: "SF",  gameTime: "Sun 4:05pm" },
    { week: 9, awayTeam: "ARI", homeTeam: "SEA", gameTime: "Sun 4:25pm" },
    { week: 9, awayTeam: "GB",  homeTeam: "NE",  gameTime: "Sun 4:25pm" },
    { week: 9, awayTeam: "TB",  homeTeam: "CHI", gameTime: "Sun 8:20pm" },
    { week: 9, awayTeam: "BUF", homeTeam: "MIN", gameTime: "Mon 8:15pm" },
    // ── WEEK 10 ─────────────────────────────────────────────────────────────────
    { week: 10, awayTeam: "WAS", homeTeam: "NYG", gameTime: "Thu 8:15pm" },
    { week: 10, awayTeam: "NE",  homeTeam: "DET", gameTime: "Sun 9:30am" },
    { week: 10, awayTeam: "BUF", homeTeam: "NYJ", gameTime: "Sun 1:00pm" },
    { week: 10, awayTeam: "CAR", homeTeam: "NO",  gameTime: "Sun 1:00pm" },
    { week: 10, awayTeam: "HOU", homeTeam: "CLE", gameTime: "Sun 1:00pm" },
    { week: 10, awayTeam: "JAX", homeTeam: "TEN", gameTime: "Sun 1:00pm" },
    { week: 10, awayTeam: "KC",  homeTeam: "ATL", gameTime: "Sun 1:00pm" },
    { week: 10, awayTeam: "MIA", homeTeam: "IND", gameTime: "Sun 1:00pm" },
    { week: 10, awayTeam: "MIN", homeTeam: "GB",  gameTime: "Sun 1:00pm" },
    { week: 10, awayTeam: "SEA", homeTeam: "LV",  gameTime: "Sun 4:05pm" },
    { week: 10, awayTeam: "LAR", homeTeam: "ARI", gameTime: "Sun 4:25pm" },
    { week: 10, awayTeam: "SF",  homeTeam: "DAL", gameTime: "Sun 4:25pm" },
    { week: 10, awayTeam: "PIT", homeTeam: "CIN", gameTime: "Sun 8:20pm" },
    { week: 10, awayTeam: "BAL", homeTeam: "LAC", gameTime: "Mon 8:15pm" },
    // ── WEEK 11 ─────────────────────────────────────────────────────────────────
    { week: 11, awayTeam: "IND", homeTeam: "HOU", gameTime: "Thu 8:15pm" },
    { week: 11, awayTeam: "ARI", homeTeam: "KC",  gameTime: "Sun 1:00pm" },
    { week: 11, awayTeam: "BAL", homeTeam: "CAR", gameTime: "Sun 1:00pm" },
    { week: 11, awayTeam: "JAX", homeTeam: "NYG", gameTime: "Sun 1:00pm" },
    { week: 11, awayTeam: "MIA", homeTeam: "BUF", gameTime: "Sun 1:00pm" },
    { week: 11, awayTeam: "NO",  homeTeam: "CHI", gameTime: "Sun 1:00pm" },
    { week: 11, awayTeam: "TB",  homeTeam: "DET", gameTime: "Sun 1:00pm" },
    { week: 11, awayTeam: "TEN", homeTeam: "DAL", gameTime: "Sun 1:00pm" },
    { week: 11, awayTeam: "NYJ", homeTeam: "LAC", gameTime: "Sun 4:05pm" },
    { week: 11, awayTeam: "LV",  homeTeam: "DEN", gameTime: "Sun 4:25pm" },
    { week: 11, awayTeam: "PIT", homeTeam: "PHI", gameTime: "Sun 4:25pm" },
    { week: 11, awayTeam: "MIN", homeTeam: "SF",  gameTime: "Sun 8:20pm" },
    { week: 11, awayTeam: "CIN", homeTeam: "WAS", gameTime: "Mon 8:15pm" },
    // ── WEEK 12 ─────────────────────────────────────────────────────────────────
    { week: 12, awayTeam: "GB",  homeTeam: "LAR", gameTime: "Wed 8:00pm" },
    { week: 12, awayTeam: "CHI", homeTeam: "DET", gameTime: "Thu 1:00pm" },
    { week: 12, awayTeam: "PHI", homeTeam: "DAL", gameTime: "Thu 4:30pm" },
    { week: 12, awayTeam: "KC",  homeTeam: "BUF", gameTime: "Thu 8:20pm" },
    { week: 12, awayTeam: "DEN", homeTeam: "PIT", gameTime: "Fri 3:00pm" },
    { week: 12, awayTeam: "ATL", homeTeam: "MIN", gameTime: "Sun 1:00pm" },
    { week: 12, awayTeam: "BAL", homeTeam: "HOU", gameTime: "Sun 1:00pm" },
    { week: 12, awayTeam: "LV",  homeTeam: "CLE", gameTime: "Sun 1:00pm" },
    { week: 12, awayTeam: "NO",  homeTeam: "CIN", gameTime: "Sun 1:00pm" },
    { week: 12, awayTeam: "NYG", homeTeam: "IND", gameTime: "Sun 1:00pm" },
    { week: 12, awayTeam: "NYJ", homeTeam: "MIA", gameTime: "Sun 1:00pm" },
    { week: 12, awayTeam: "TEN", homeTeam: "JAX", gameTime: "Sun 4:05pm" },
    { week: 12, awayTeam: "SEA", homeTeam: "SF",  gameTime: "Sun 4:25pm" },
    { week: 12, awayTeam: "WAS", homeTeam: "ARI", gameTime: "Sun 4:25pm" },
    { week: 12, awayTeam: "NE",  homeTeam: "LAC", gameTime: "Sun 8:20pm" },
    { week: 12, awayTeam: "CAR", homeTeam: "TB",  gameTime: "Mon 8:15pm" },
    // ── WEEK 13 ─────────────────────────────────────────────────────────────────
    { week: 13, awayTeam: "KC",  homeTeam: "LAR", gameTime: "Thu 8:15pm" },
    { week: 13, awayTeam: "CIN", homeTeam: "CLE", gameTime: "Sun 1:00pm" },
    { week: 13, awayTeam: "DET", homeTeam: "ATL", gameTime: "Sun 1:00pm" },
    { week: 13, awayTeam: "GB",  homeTeam: "NO",  gameTime: "Sun 1:00pm" },
    { week: 13, awayTeam: "JAX", homeTeam: "CHI", gameTime: "Sun 1:00pm" },
    { week: 13, awayTeam: "LAC", homeTeam: "TB",  gameTime: "Sun 1:00pm" },
    { week: 13, awayTeam: "SF",  homeTeam: "NYG", gameTime: "Sun 1:00pm" },
    { week: 13, awayTeam: "WAS", homeTeam: "TEN", gameTime: "Sun 1:00pm" },
    { week: 13, awayTeam: "MIA", homeTeam: "DEN", gameTime: "Sun 4:05pm" },
    { week: 13, awayTeam: "PHI", homeTeam: "ARI", gameTime: "Sun 4:05pm" },
    { week: 13, awayTeam: "BUF", homeTeam: "NE",  gameTime: "Sun 4:25pm" },
    { week: 13, awayTeam: "CAR", homeTeam: "MIN", gameTime: "Sun 4:25pm" },
    { week: 13, awayTeam: "HOU", homeTeam: "PIT", gameTime: "Sun 8:20pm" },
    { week: 13, awayTeam: "DAL", homeTeam: "SEA", gameTime: "Mon 8:15pm" },
    // ── WEEK 14 ─────────────────────────────────────────────────────────────────
    { week: 14, awayTeam: "MIN", homeTeam: "NE",  gameTime: "Thu 8:15pm" },
    { week: 14, awayTeam: "ATL", homeTeam: "CLE", gameTime: "Sun 1:00pm" },
    { week: 14, awayTeam: "CHI", homeTeam: "MIA", gameTime: "Sun 1:00pm" },
    { week: 14, awayTeam: "DEN", homeTeam: "NYJ", gameTime: "Sun 1:00pm" },
    { week: 14, awayTeam: "HOU", homeTeam: "WAS", gameTime: "Sun 1:00pm" },
    { week: 14, awayTeam: "IND", homeTeam: "PHI", gameTime: "Sun 1:00pm" },
    { week: 14, awayTeam: "NO",  homeTeam: "CAR", gameTime: "Sun 1:00pm" },
    { week: 14, awayTeam: "TB",  homeTeam: "BAL", gameTime: "Sun 1:00pm" },
    { week: 14, awayTeam: "TEN", homeTeam: "DET", gameTime: "Sun 1:00pm" },
    { week: 14, awayTeam: "LAC", homeTeam: "LV",  gameTime: "Sun 4:05pm" },
    { week: 14, awayTeam: "KC",  homeTeam: "CIN", gameTime: "Sun 4:25pm" },
    { week: 14, awayTeam: "LAR", homeTeam: "SF",  gameTime: "Sun 4:25pm" },
    { week: 14, awayTeam: "NYG", homeTeam: "SEA", gameTime: "Sun 4:25pm" },
    { week: 14, awayTeam: "BUF", homeTeam: "GB",  gameTime: "Sun 8:20pm" },
    { week: 14, awayTeam: "PIT", homeTeam: "JAX", gameTime: "Mon 8:15pm" },
    // ── WEEK 15 ─────────────────────────────────────────────────────────────────
    { week: 15, awayTeam: "SF",  homeTeam: "LAC", gameTime: "Thu 8:15pm" },
    { week: 15, awayTeam: "SEA", homeTeam: "PHI", gameTime: "Sat 5:00pm" },
    { week: 15, awayTeam: "CHI", homeTeam: "BUF", gameTime: "Sat 8:20pm" },
    { week: 15, awayTeam: "ATL", homeTeam: "WAS", gameTime: "Sun 1:00pm" },
    { week: 15, awayTeam: "BAL", homeTeam: "PIT", gameTime: "Sun 1:00pm" },
    { week: 15, awayTeam: "CIN", homeTeam: "CAR", gameTime: "Sun 1:00pm" },
    { week: 15, awayTeam: "CLE", homeTeam: "NYG", gameTime: "Sun 1:00pm" },
    { week: 15, awayTeam: "IND", homeTeam: "TEN", gameTime: "Sun 1:00pm" },
    { week: 15, awayTeam: "JAX", homeTeam: "HOU", gameTime: "Sun 1:00pm" },
    { week: 15, awayTeam: "MIA", homeTeam: "GB",  gameTime: "Sun 1:00pm" },
    { week: 15, awayTeam: "NO",  homeTeam: "TB",  gameTime: "Sun 1:00pm" },
    { week: 15, awayTeam: "NYJ", homeTeam: "ARI", gameTime: "Sun 4:05pm" },
    { week: 15, awayTeam: "DAL", homeTeam: "LAR", gameTime: "Sun 4:25pm" },
    { week: 15, awayTeam: "DEN", homeTeam: "LV",  gameTime: "Sun 4:25pm" },
    { week: 15, awayTeam: "DET", homeTeam: "MIN", gameTime: "Sun 8:20pm" },
    { week: 15, awayTeam: "NE",  homeTeam: "KC",  gameTime: "Mon 8:15pm" },
    // ── WEEK 16 ─────────────────────────────────────────────────────────────────
    { week: 16, awayTeam: "HOU", homeTeam: "PHI", gameTime: "Thu 8:15pm" },
    { week: 16, awayTeam: "GB",  homeTeam: "CHI", gameTime: "Fri 1:00pm" },
    { week: 16, awayTeam: "BUF", homeTeam: "DEN", gameTime: "Fri 4:30pm" },
    { week: 16, awayTeam: "LAR", homeTeam: "SEA", gameTime: "Fri 8:15pm" },
    { week: 16, awayTeam: "ARI", homeTeam: "NO",  gameTime: "Sun 1:00pm" },
    { week: 16, awayTeam: "CLE", homeTeam: "BAL", gameTime: "Sun 1:00pm" },
    { week: 16, awayTeam: "LAC", homeTeam: "MIA", gameTime: "Sun 1:00pm" },
    { week: 16, awayTeam: "NE",  homeTeam: "NYJ", gameTime: "Sun 1:00pm" },
    { week: 16, awayTeam: "TEN", homeTeam: "LV",  gameTime: "Sun 4:05pm" },
    { week: 16, awayTeam: "CAR", homeTeam: "PIT", gameTime: "Sun 4:25pm" },
    { week: 16, awayTeam: "CIN", homeTeam: "IND", gameTime: "Sun 4:25pm" },
    { week: 16, awayTeam: "SF",  homeTeam: "KC",  gameTime: "Sun 4:25pm" },
    { week: 16, awayTeam: "TB",  homeTeam: "ATL", gameTime: "Sun 4:25pm" },
    { week: 16, awayTeam: "WAS", homeTeam: "MIN", gameTime: "Sun 4:25pm" },
    { week: 16, awayTeam: "JAX", homeTeam: "DAL", gameTime: "Sun 8:20pm" },
    { week: 16, awayTeam: "NYG", homeTeam: "DET", gameTime: "Mon 8:15pm" },
    // ── WEEK 17 ─────────────────────────────────────────────────────────────────
    { week: 17, awayTeam: "BAL", homeTeam: "CIN", gameTime: "Thu 8:15pm" },
    { week: 17, awayTeam: "BUF", homeTeam: "MIA", gameTime: "Sun 1:00pm" },
    { week: 17, awayTeam: "IND", homeTeam: "CLE", gameTime: "Sun 1:00pm" },
    { week: 17, awayTeam: "MIN", homeTeam: "NYJ", gameTime: "Sun 1:00pm" },
    { week: 17, awayTeam: "NO",  homeTeam: "ATL", gameTime: "Sun 1:00pm" },
    { week: 17, awayTeam: "NYG", homeTeam: "DAL", gameTime: "Sun 1:00pm" },
    { week: 17, awayTeam: "PIT", homeTeam: "TEN", gameTime: "Sun 1:00pm" },
    { week: 17, awayTeam: "SEA", homeTeam: "CAR", gameTime: "Sun 1:00pm" },
    { week: 17, awayTeam: "LV",  homeTeam: "ARI", gameTime: "Sun 4:05pm" },
    { week: 17, awayTeam: "DEN", homeTeam: "NE",  gameTime: "Sun 4:25pm" },
    { week: 17, awayTeam: "DET", homeTeam: "CHI", gameTime: "Sun 4:25pm" },
    { week: 17, awayTeam: "KC",  homeTeam: "LAC", gameTime: "Sun 4:25pm" },
    { week: 17, awayTeam: "LAR", homeTeam: "TB",  gameTime: "Sun 4:25pm" },
    { week: 17, awayTeam: "WAS", homeTeam: "JAX", gameTime: "Sun 4:25pm" },
    { week: 17, awayTeam: "PHI", homeTeam: "SF",  gameTime: "Sun 8:20pm" },
    { week: 17, awayTeam: "HOU", homeTeam: "GB",  gameTime: "Mon 8:15pm" },
    // ── WEEK 18 ─────────────────────────────────────────────────────────────────
    { week: 18, awayTeam: "CLE", homeTeam: "CIN", gameTime: "Sat 1:00pm" },
    { week: 18, awayTeam: "LAC", homeTeam: "DEN", gameTime: "Sat 1:00pm" },
    { week: 18, awayTeam: "NYJ", homeTeam: "BUF", gameTime: "Sat 1:00pm" },
    { week: 18, awayTeam: "ATL", homeTeam: "CAR", gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "CHI", homeTeam: "MIN", gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "DAL", homeTeam: "WAS", gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "DET", homeTeam: "GB",  gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "JAX", homeTeam: "IND", gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "LV",  homeTeam: "KC",  gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "MIA", homeTeam: "NE",  gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "PHI", homeTeam: "NYG", gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "PIT", homeTeam: "BAL", gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "SF",  homeTeam: "ARI", gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "TB",  homeTeam: "NO",  gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "TEN", homeTeam: "HOU", gameTime: "Sun 1:00pm" },
    { week: 18, awayTeam: "LAR", homeTeam: "SEA", gameTime: "Sun 4:25pm" },
    { week: 18, awayTeam: "NE",  homeTeam: "BUF", gameTime: "Sun 4:25pm" },
  ];

  await db.insert(matchesTable).values(
    schedule.map((m) => ({
      week: m.week,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      gameTime: m.gameTime ?? null,
      isCompleted: false,
      winner: null,
    }))
  );

  const [cfg] = await db.select().from(seasonConfigTable).limit(1);
  if (!cfg) {
    await db.insert(seasonConfigTable).values({ mode: "pre-season", lastCompletedWeek: 0 });
  }

  res.json({ seeded: true, message: `Seeded ${schedule.length} matches.` });
});

export default router;
