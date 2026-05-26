import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginUserBody } from "@workspace/api-zod";

const router = Router();

function serializeUser(u: typeof usersTable.$inferSelect) {
  return { id: u.id, name: u.name, avatar: u.avatar ?? null, createdAt: u.createdAt.toISOString() };
}

router.post("/users/login", async (req, res) => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { name } = parsed.data;
  const existing = await db.select().from(usersTable).where(eq(usersTable.name, name)).limit(1);
  if (existing.length > 0) {
    res.status(200).json(serializeUser(existing[0]));
    return;
  }
  const [created] = await db.insert(usersTable).values({ name }).returning();
  res.status(201).json(serializeUser(created));
});

router.get("/users", async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(users.map(serializeUser));
});

router.get("/users/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(serializeUser(user));
});

router.patch("/users/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof usersTable.$inferInsert> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.length === 0 || body.name.length > 32) {
      res.status(400).json({ error: "name must be 1-32 characters" }); return;
    }
    updates.name = body.name;
  }
  if (body.avatar !== undefined) {
    if (body.avatar !== null && (typeof body.avatar !== "string" || body.avatar.length > 10)) {
      res.status(400).json({ error: "avatar must be null or a short string" }); return;
    }
    updates.avatar = body.avatar as string | undefined;
  }

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  res.json(serializeUser(updated));
});

export default router;
