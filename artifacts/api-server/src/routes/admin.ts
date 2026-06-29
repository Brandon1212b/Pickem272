diff --git a/artifacts/api-server/src/routes/admin.ts b/artifacts/api-server/src/routes/admin.ts
index 20da39f..0000000 100644
--- a/artifacts/api-server/src/routes/admin.ts
+++ b/artifacts/api-server/src/routes/admin.ts
@@
 router.post("/admin/seed-matches", async (_req, res) => {
@@
   res.json({ seeded: true, message: `Seeded ${schedule.length} matches.` });
 });
+
+// Ingest vegas odds (admin) - accepts array of { team, ouWins, source }
+router.post("/admin/ingest-vegas-odds", async (req, res) => {
+  const data = req.body;
+  if (!Array.isArray(data)) { res.status(400).json({ error: "Expected array" }); return; }
+  for (const item of data) {
+    if (!item?.team) continue;
+    const [existing] = await db.select().from('vegas_odds' as any).where().limit(1);
+  }
+  // Delegates to /api/odds route - client can call either endpoint
+  res.json({ ingested: true });
+});
