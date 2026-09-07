import { Router } from "express";
import { db, matchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

/** ESPN abbreviations → our internal codes */
const ESPN_ABBR: Record<string, string> = {
  WSH: "WAS",
  JAC: "JAX",
  LVR: "LV",
  SFO: "SF",
  GNB: "GB",
  NWE: "NE",
  KAN: "KC",
  NOR: "NO",
  TAM: "TB",
};

function norm(abbr: string): string {
  return ESPN_ABBR[abbr] ?? abbr;
}

function formatSpread(spread: number): string {
  if (spread === 0) return "PK";
  return String(spread);
}

async function fetchWeekOdds(week: number) {
  const espnRes = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}`,
    { headers: { Accept: "application/json" } },
  );
  if (!espnRes.ok) {
    throw new Error(`ESPN week ${week} returned ${espnRes.status}`);
  }
  return espnRes.json() as Promise<any>;
}

async function syncSpreads(weekParam: number | null) {
  const weeks =
    weekParam && weekParam >= 1 && weekParam <= 18
      ? [weekParam]
      : Array.from({ length: 18 }, (_, i) => i + 1);

  const updated: { week: number; match: string; spread: string; previous: string | null }[] = [];
  const unmatched: string[] = [];
  const noOdds: string[] = [];
  const errors: string[] = [];

  for (const week of weeks) {
    let data: any;
    try {
      data = await fetchWeekOdds(week);
    } catch (err) {
      errors.push(String(err));
      continue;
    }

    const dbMatches = await db.select().from(matchesTable).where(eq(matchesTable.week, week));

    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const home = (comp.competitors ?? []).find((c: any) => c.homeAway === "home");
      const away = (comp.competitors ?? []).find((c: any) => c.homeAway === "away");
      const odds = comp.odds?.[0];
      const homeTeam = norm(home?.team?.abbreviation ?? "");
      const awayTeam = norm(away?.team?.abbreviation ?? "");
      const label = `${awayTeam} @ ${homeTeam} (W${week})`;

      if (!homeTeam || !awayTeam) continue;
      if (odds?.spread == null) {
        noOdds.push(label);
        continue;
      }

      const match = dbMatches.find((m) => m.homeTeam === homeTeam && m.awayTeam === awayTeam);
      if (!match) {
        unmatched.push(label);
        continue;
      }

      const spreadStr = formatSpread(Number(odds.spread));
      if (match.pointSpread === spreadStr) continue;

      await db
        .update(matchesTable)
        .set({ pointSpread: spreadStr })
        .where(eq(matchesTable.id, match.id));

      updated.push({
        week,
        match: `${awayTeam} @ ${homeTeam}`,
        spread: spreadStr,
        previous: match.pointSpread ?? null,
      });
    }
  }

  return {
    weeks,
    updated: updated.length,
    details: updated,
    unmatched,
    noOdds,
    errors,
  };
}

function weekFromQuery(req: { query: Record<string, unknown> }): number | null {
  const raw = req.query.week;
  if (!raw) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

/** GET works from Safari on a phone. POST kept for admin tools. */
router.get("/admin/sync-spreads", async (req, res) => {
  try {
    res.json(await syncSpreads(weekFromQuery(req)));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/admin/sync-spreads", async (req, res) => {
  try {
    res.json(await syncSpreads(weekFromQuery(req)));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
