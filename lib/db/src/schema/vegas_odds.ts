import { pgTable, text, numeric, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vegasOddsTable = pgTable("vegas_odds", {
  id: serial("id").primaryKey(),
  team: text("team").notNull().unique(),
  ou_wins: numeric("ou_wins", { precision: 5, scale: 2 }).notNull().default(0),
  source: text("source"), // optional metadata (provider)
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVegasOddsSchema = createInsertSchema(vegasOddsTable).omit({ id: true, updated_at: true });
export type InsertVegasOdds = z.infer<typeof insertVegasOddsSchema>;
export type VegasOdds = typeof vegasOddsTable.$inferSelect;
