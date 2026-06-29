import { pgTable, text, numeric, timestamp, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vegasOddsTable = pgTable("vegas_odds", {
  id: serial("id").primaryKey(),
  team: text("team").notNull().unique(),
  // Use SQL literal for numeric default to satisfy drizzle types
  ou_wins: numeric("ou_wins", { precision: 5, scale: 2 }).notNull().default(sql`0`),
  source: text("source"), // optional metadata (provider)
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVegasOddsSchema = createInsertSchema(vegasOddsTable).omit({ id: true, updated_at: true });
export type InsertVegasOdds = z.infer<typeof insertVegasOddsSchema>;
export type VegasOdds = typeof vegasOddsTable.$inferSelect;
