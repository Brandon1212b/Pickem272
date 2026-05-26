import { Router } from "express";
import { db, matchesTable, picksTable, seasonConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SetMatchResultParams, SetMatchResultBody, SendWebhookNotificationBody, UpdateSeasonModeBody } from "@workspace/api-zod";

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

router.post("/admin/webhook", async (req, res) => {
  const parsed = SendWebhookNotificationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { webhookUrl, message } = parsed.data;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    if (!response.ok) {
      res.json({ success: false, message: `Webhook returned ${response.status}` });
      return;
    }
    res.json({ success: true, message: "Notification sent" });
  } catch (err) {
    res.json({ success: false, message: String(err) });
  }
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

export default router;
