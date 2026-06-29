import type { RequestHandler } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const BOOTSTRAP_ADMIN_NAMES = new Set(["Bfabs"]);

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const userId = Number(req.header("x-user-id"));

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(403).json({ error: "Commissioner access required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user || (user.role !== "admin" && !BOOTSTRAP_ADMIN_NAMES.has(user.name))) {
    res.status(403).json({ error: "Commissioner access required" });
    return;
  }

  next();
};
