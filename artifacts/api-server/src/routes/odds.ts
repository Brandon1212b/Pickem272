import { Router } from "express";
import { db, vegasOddsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/odds
router.get("/odds", async (_req, res) => {
  const rows = await db.select().from(vegasOddsTable);
  res.json(rows.map((r) => ({ team: r.team, ouWins: parseFloat(String(r.ou_wins)), source: r.source ?? null, updatedAt: r.updated_at?.toISOString?.() ?? null })));
});

// POST /api/odds (admin upsert array of { team, ouWins, source })
router.post("/odds", async (req, res) => {
  const incoming = req.body;
  if (!Array.isArray(incoming)) { res.status(400).json({ error: "Expected array" }); return; }
  for (const item of incoming) {
    if (!item?.team) continue;
    const [existing] = await db.select().from(vegasOddsTable).where(eq(vegasOddsTable.team, item.team)).limit(1);
    if (existing) {
      await db.update(vegasOddsTable).set({ ou_wins: item.ouWins, source: item.source, updated_at: new Date() }).where(eq(vegasOddsTable.team, item.team));
    } else {
      await db.insert(vegasOddsTable).values({ team: item.team, ou_wins: item.ouWins, source: item.source }).returning();
    }
  }
  res.status(204).end();
});

export default router;
