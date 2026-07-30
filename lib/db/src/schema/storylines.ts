import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const storylinesTable = pgTable("storylines", {
  id: serial("id").primaryKey(),
  week: integer("week").notNull().unique(),
  text: text("text").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Storyline = typeof storylinesTable.$inferSelect;
