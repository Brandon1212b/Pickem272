import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../lib/db/src/schema";
import { sql } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

type MatchSeed = {
  week: number;
  homeTeam: string;
  awayTeam: string;
  gameTime?: string;
  pointSpread?: string;
  injuryWeatherFlags?: string;
};

const SPREADS = [
  "-3", "-3.5", "-4", "-4.5", "-5", "-5.5", "-6", "-6.5",
  "-7", "-7.5", "-8", "-8.5", "-9", "-9.5", "-10", "-10.5",
  "-1", "-1.5", "-2", "-2.5", "PK",
];
const FLAGS = ["🌧️", "🏥", "🌨️", "💨", null, null, null, null, null, null];

function spread() {
  return SPREADS[Math.floor(Math.random() * SPREADS.length)];
}
function flag() {
  return FLAGS[Math.floor(Math.random() * FLAGS.length)];
}

// 2026-27 NFL Season Schedule (Week 1-18, 16 games/week = 288 total)
// Key: Baltimore Ravens (BAL) host Indianapolis Colts (IND) in Week 1
const schedule: MatchSeed[] = [
  // === WEEK 1 ===
  { week: 1, homeTeam: "BAL", awayTeam: "IND" },
  { week: 1, homeTeam: "KC", awayTeam: "PHI" },
  { week: 1, homeTeam: "BUF", awayTeam: "MIA" },
  { week: 1, homeTeam: "SF", awayTeam: "DAL" },
  { week: 1, homeTeam: "DET", awayTeam: "LAR" },
  { week: 1, homeTeam: "GB", awayTeam: "MIN" },
  { week: 1, homeTeam: "CIN", awayTeam: "NE" },
  { week: 1, homeTeam: "PIT", awayTeam: "WAS" },
  { week: 1, homeTeam: "HOU", awayTeam: "TEN" },
  { week: 1, homeTeam: "NYJ", awayTeam: "JAX" },
  { week: 1, homeTeam: "CLE", awayTeam: "ATL" },
  { week: 1, homeTeam: "NO", awayTeam: "CAR" },
  { week: 1, homeTeam: "LV", awayTeam: "DEN" },
  { week: 1, homeTeam: "LAC", awayTeam: "SEA" },
  { week: 1, homeTeam: "ARI", awayTeam: "CHI" },
  { week: 1, homeTeam: "NYG", awayTeam: "TB" },

  // === WEEK 2 ===
  { week: 2, homeTeam: "IND", awayTeam: "HOU" },
  { week: 2, homeTeam: "PHI", awayTeam: "NYG" },
  { week: 2, homeTeam: "MIA", awayTeam: "BUF" },
  { week: 2, homeTeam: "DAL", awayTeam: "WAS" },
  { week: 2, homeTeam: "LAR", awayTeam: "SF" },
  { week: 2, homeTeam: "MIN", awayTeam: "DET" },
  { week: 2, homeTeam: "NE", awayTeam: "NYJ" },
  { week: 2, homeTeam: "WAS", awayTeam: "PIT" },
  { week: 2, homeTeam: "TEN", awayTeam: "JAX" },
  { week: 2, homeTeam: "ATL", awayTeam: "NO" },
  { week: 2, homeTeam: "CAR", awayTeam: "TB" },
  { week: 2, homeTeam: "DEN", awayTeam: "LV" },
  { week: 2, homeTeam: "SEA", awayTeam: "ARI" },
  { week: 2, homeTeam: "CHI", awayTeam: "GB" },
  { week: 2, homeTeam: "CLE", awayTeam: "CIN" },
  { week: 2, homeTeam: "KC", awayTeam: "LAC" },

  // === WEEK 3 ===
  { week: 3, homeTeam: "BAL", awayTeam: "CLE" },
  { week: 3, homeTeam: "BUF", awayTeam: "NE" },
  { week: 3, homeTeam: "KC", awayTeam: "DEN" },
  { week: 3, homeTeam: "SF", awayTeam: "SEA" },
  { week: 3, homeTeam: "PHI", awayTeam: "DAL" },
  { week: 3, homeTeam: "GB", awayTeam: "DET" },
  { week: 3, homeTeam: "HOU", awayTeam: "JAX" },
  { week: 3, homeTeam: "LAR", awayTeam: "ARI" },
  { week: 3, homeTeam: "MIN", awayTeam: "CHI" },
  { week: 3, homeTeam: "PIT", awayTeam: "CIN" },
  { week: 3, homeTeam: "MIA", awayTeam: "NYJ" },
  { week: 3, homeTeam: "NO", awayTeam: "ATL" },
  { week: 3, homeTeam: "TB", awayTeam: "CAR" },
  { week: 3, homeTeam: "LAC", awayTeam: "LV" },
  { week: 3, homeTeam: "WAS", awayTeam: "NYG" },
  { week: 3, homeTeam: "TEN", awayTeam: "IND" },

  // === WEEK 4 ===
  { week: 4, homeTeam: "CIN", awayTeam: "BAL" },
  { week: 4, homeTeam: "NYJ", awayTeam: "MIA" },
  { week: 4, homeTeam: "DEN", awayTeam: "KC" },
  { week: 4, homeTeam: "SEA", awayTeam: "SF" },
  { week: 4, homeTeam: "DAL", awayTeam: "PHI" },
  { week: 4, homeTeam: "DET", awayTeam: "GB" },
  { week: 4, homeTeam: "JAX", awayTeam: "HOU" },
  { week: 4, homeTeam: "ARI", awayTeam: "LAR" },
  { week: 4, homeTeam: "CHI", awayTeam: "MIN" },
  { week: 4, homeTeam: "ATL", awayTeam: "TB" },
  { week: 4, homeTeam: "NO", awayTeam: "CAR" },
  { week: 4, homeTeam: "LV", awayTeam: "LAC" },
  { week: 4, homeTeam: "NYG", awayTeam: "WAS" },
  { week: 4, homeTeam: "IND", awayTeam: "TEN" },
  { week: 4, homeTeam: "NE", awayTeam: "BUF" },
  { week: 4, homeTeam: "PIT", awayTeam: "CLE" },

  // === WEEK 5 ===
  { week: 5, homeTeam: "BAL", awayTeam: "PIT" },
  { week: 5, homeTeam: "BUF", awayTeam: "NYJ" },
  { week: 5, homeTeam: "KC", awayTeam: "LV" },
  { week: 5, homeTeam: "SF", awayTeam: "LAR" },
  { week: 5, homeTeam: "PHI", awayTeam: "WAS" },
  { week: 5, homeTeam: "MIN", awayTeam: "GB" },
  { week: 5, homeTeam: "HOU", awayTeam: "IND" },
  { week: 5, homeTeam: "DAL", awayTeam: "NYG" },
  { week: 5, homeTeam: "DET", awayTeam: "CHI" },
  { week: 5, homeTeam: "NO", awayTeam: "TB" },
  { week: 5, homeTeam: "ATL", awayTeam: "CAR" },
  { week: 5, homeTeam: "LAC", awayTeam: "DEN" },
  { week: 5, homeTeam: "JAX", awayTeam: "TEN" },
  { week: 5, homeTeam: "SEA", awayTeam: "ARI" },
  { week: 5, homeTeam: "CIN", awayTeam: "CLE" },
  { week: 5, homeTeam: "MIA", awayTeam: "NE" },

  // === WEEK 6 ===
  { week: 6, homeTeam: "PIT", awayTeam: "BAL" },
  { week: 6, homeTeam: "NYJ", awayTeam: "BUF" },
  { week: 6, homeTeam: "LV", awayTeam: "KC" },
  { week: 6, homeTeam: "LAR", awayTeam: "SF" },
  { week: 6, homeTeam: "WAS", awayTeam: "PHI" },
  { week: 6, homeTeam: "GB", awayTeam: "MIN" },
  { week: 6, homeTeam: "IND", awayTeam: "JAX" },
  { week: 6, homeTeam: "NYG", awayTeam: "DAL" },
  { week: 6, homeTeam: "CHI", awayTeam: "DET" },
  { week: 6, homeTeam: "TB", awayTeam: "NO" },
  { week: 6, homeTeam: "CAR", awayTeam: "ATL" },
  { week: 6, homeTeam: "DEN", awayTeam: "LAC" },
  { week: 6, homeTeam: "TEN", awayTeam: "HOU" },
  { week: 6, homeTeam: "ARI", awayTeam: "SEA" },
  { week: 6, homeTeam: "CLE", awayTeam: "CIN" },
  { week: 6, homeTeam: "NE", awayTeam: "MIA" },

  // === WEEK 7 ===
  { week: 7, homeTeam: "BAL", awayTeam: "HOU" },
  { week: 7, homeTeam: "BUF", awayTeam: "KC" },
  { week: 7, homeTeam: "MIA", awayTeam: "NE" },
  { week: 7, homeTeam: "SF", awayTeam: "ARI" },
  { week: 7, homeTeam: "DAL", awayTeam: "CHI" },
  { week: 7, homeTeam: "GB", awayTeam: "LAR" },
  { week: 7, homeTeam: "MIN", awayTeam: "DET" },
  { week: 7, homeTeam: "PHI", awayTeam: "ATL" },
  { week: 7, homeTeam: "TEN", awayTeam: "CLE" },
  { week: 7, homeTeam: "WAS", awayTeam: "NYG" },
  { week: 7, homeTeam: "TB", awayTeam: "CAR" },
  { week: 7, homeTeam: "LAC", awayTeam: "DEN" },
  { week: 7, homeTeam: "IND", awayTeam: "CIN" },
  { week: 7, homeTeam: "NYJ", awayTeam: "JAX" },
  { week: 7, homeTeam: "LV", awayTeam: "SEA" },
  { week: 7, homeTeam: "NO", awayTeam: "PIT" },

  // === WEEK 8 ===
  { week: 8, homeTeam: "CLE", awayTeam: "BAL" },
  { week: 8, homeTeam: "NE", awayTeam: "BUF" },
  { week: 8, homeTeam: "DEN", awayTeam: "LV" },
  { week: 8, homeTeam: "ARI", awayTeam: "SF" },
  { week: 8, homeTeam: "CHI", awayTeam: "DAL" },
  { week: 8, homeTeam: "LAR", awayTeam: "GB" },
  { week: 8, homeTeam: "DET", awayTeam: "MIN" },
  { week: 8, homeTeam: "ATL", awayTeam: "PHI" },
  { week: 8, homeTeam: "CIN", awayTeam: "IND" },
  { week: 8, homeTeam: "JAX", awayTeam: "NYJ" },
  { week: 8, homeTeam: "SEA", awayTeam: "LV" },
  { week: 8, homeTeam: "CAR", awayTeam: "NO" },
  { week: 8, homeTeam: "PIT", awayTeam: "TEN" },
  { week: 8, homeTeam: "NYG", awayTeam: "WAS" },
  { week: 8, homeTeam: "KC", awayTeam: "MIA" },
  { week: 8, homeTeam: "HOU", awayTeam: "LAC" },

  // === WEEK 9 ===
  { week: 9, homeTeam: "BAL", awayTeam: "NYJ" },
  { week: 9, homeTeam: "BUF", awayTeam: "CIN" },
  { week: 9, homeTeam: "KC", awayTeam: "SF" },
  { week: 9, homeTeam: "LAR", awayTeam: "SEA" },
  { week: 9, homeTeam: "PHI", awayTeam: "MIN" },
  { week: 9, homeTeam: "GB", awayTeam: "CHI" },
  { week: 9, homeTeam: "TEN", awayTeam: "IND" },
  { week: 9, homeTeam: "DAL", awayTeam: "ATL" },
  { week: 9, homeTeam: "CLE", awayTeam: "PIT" },
  { week: 9, homeTeam: "NO", awayTeam: "WAS" },
  { week: 9, homeTeam: "TB", awayTeam: "NYG" },
  { week: 9, homeTeam: "DEN", awayTeam: "JAX" },
  { week: 9, homeTeam: "LV", awayTeam: "HOU" },
  { week: 9, homeTeam: "ARI", awayTeam: "LAC" },
  { week: 9, homeTeam: "MIA", awayTeam: "NE" },
  { week: 9, homeTeam: "DET", awayTeam: "CAR" },

  // === WEEK 10 ===
  { week: 10, homeTeam: "BAL", awayTeam: "TEN" },
  { week: 10, homeTeam: "IND", awayTeam: "JAX" },
  { week: 10, homeTeam: "KC", awayTeam: "GB" },
  { week: 10, homeTeam: "SF", awayTeam: "LAR" },
  { week: 10, homeTeam: "PHI", awayTeam: "DAL" },
  { week: 10, homeTeam: "MIN", awayTeam: "GB" },
  { week: 10, homeTeam: "MIA", awayTeam: "NYJ" },
  { week: 10, homeTeam: "HOU", awayTeam: "NE" },
  { week: 10, homeTeam: "PIT", awayTeam: "CLE" },
  { week: 10, homeTeam: "ATL", awayTeam: "CAR" },
  { week: 10, homeTeam: "TB", awayTeam: "NO" },
  { week: 10, homeTeam: "DEN", awayTeam: "LAC" },
  { week: 10, homeTeam: "SEA", awayTeam: "ARI" },
  { week: 10, homeTeam: "WAS", awayTeam: "CHI" },
  { week: 10, homeTeam: "NYG", awayTeam: "PHI" },
  { week: 10, homeTeam: "CIN", awayTeam: "BUF" },

  // === WEEK 11 ===
  { week: 11, homeTeam: "BAL", awayTeam: "PHI" },
  { week: 11, homeTeam: "BUF", awayTeam: "DEN" },
  { week: 11, homeTeam: "KC", awayTeam: "HOU" },
  { week: 11, homeTeam: "LAR", awayTeam: "ARI" },
  { week: 11, homeTeam: "DAL", awayTeam: "WAS" },
  { week: 11, homeTeam: "GB", awayTeam: "CHI" },
  { week: 11, homeTeam: "JAX", awayTeam: "TEN" },
  { week: 11, homeTeam: "PIT", awayTeam: "CIN" },
  { week: 11, homeTeam: "MIN", awayTeam: "DET" },
  { week: 11, homeTeam: "NO", awayTeam: "ATL" },
  { week: 11, homeTeam: "CAR", awayTeam: "TB" },
  { week: 11, homeTeam: "LV", awayTeam: "DEN" },
  { week: 11, homeTeam: "SEA", awayTeam: "SF" },
  { week: 11, homeTeam: "NYG", awayTeam: "NE" },
  { week: 11, homeTeam: "MIA", awayTeam: "LAC" },
  { week: 11, homeTeam: "IND", awayTeam: "CLE" },

  // === WEEK 12 ===
  { week: 12, homeTeam: "BAL", awayTeam: "LAR" },
  { week: 12, homeTeam: "NE", awayTeam: "MIA" },
  { week: 12, homeTeam: "DEN", awayTeam: "KC" },
  { week: 12, homeTeam: "SF", awayTeam: "CHI" },
  { week: 12, homeTeam: "WAS", awayTeam: "DAL" },
  { week: 12, homeTeam: "DET", awayTeam: "GB" },
  { week: 12, homeTeam: "TEN", awayTeam: "HOU" },
  { week: 12, homeTeam: "CIN", awayTeam: "PIT" },
  { week: 12, homeTeam: "ATL", awayTeam: "NO" },
  { week: 12, homeTeam: "TB", awayTeam: "CAR" },
  { week: 12, homeTeam: "LAC", awayTeam: "LV" },
  { week: 12, homeTeam: "ARI", awayTeam: "SEA" },
  { week: 12, homeTeam: "PHI", awayTeam: "NYG" },
  { week: 12, homeTeam: "JAX", awayTeam: "IND" },
  { week: 12, homeTeam: "NYJ", awayTeam: "CLE" },
  { week: 12, homeTeam: "CHI", awayTeam: "MIN" },

  // === WEEK 13 ===
  { week: 13, homeTeam: "BAL", awayTeam: "DEN" },
  { week: 13, homeTeam: "BUF", awayTeam: "MIA" },
  { week: 13, homeTeam: "KC", awayTeam: "CIN" },
  { week: 13, homeTeam: "SF", awayTeam: "GB" },
  { week: 13, homeTeam: "DAL", awayTeam: "DET" },
  { week: 13, homeTeam: "PHI", awayTeam: "WAS" },
  { week: 13, homeTeam: "HOU", awayTeam: "JAX" },
  { week: 13, homeTeam: "IND", awayTeam: "TEN" },
  { week: 13, homeTeam: "PIT", awayTeam: "CLE" },
  { week: 13, homeTeam: "ATL", awayTeam: "TB" },
  { week: 13, homeTeam: "NO", awayTeam: "CAR" },
  { week: 13, homeTeam: "LV", awayTeam: "LAC" },
  { week: 13, homeTeam: "SEA", awayTeam: "SF" },
  { week: 13, homeTeam: "ARI", awayTeam: "LAR" },
  { week: 13, homeTeam: "MIN", awayTeam: "CHI" },
  { week: 13, homeTeam: "NE", awayTeam: "NYJ" },

  // === WEEK 14 ===
  { week: 14, homeTeam: "BAL", awayTeam: "CIN" },
  { week: 14, homeTeam: "NYJ", awayTeam: "NE" },
  { week: 14, homeTeam: "DEN", awayTeam: "BAL" },
  { week: 14, homeTeam: "LAR", awayTeam: "DAL" },
  { week: 14, homeTeam: "PHI", awayTeam: "CHI" },
  { week: 14, homeTeam: "DET", awayTeam: "MIN" },
  { week: 14, homeTeam: "HOU", awayTeam: "CLE" },
  { week: 14, homeTeam: "GB", awayTeam: "SF" },
  { week: 14, homeTeam: "WAS", awayTeam: "ATL" },
  { week: 14, homeTeam: "NYG", awayTeam: "NO" },
  { week: 14, homeTeam: "TB", awayTeam: "CAR" },
  { week: 14, homeTeam: "LAC", awayTeam: "KC" },
  { week: 14, homeTeam: "IND", awayTeam: "LV" },
  { week: 14, homeTeam: "JAX", awayTeam: "TEN" },
  { week: 14, homeTeam: "MIA", awayTeam: "BUF" },
  { week: 14, homeTeam: "SEA", awayTeam: "ARI" },

  // === WEEK 15 ===
  { week: 15, homeTeam: "BAL", awayTeam: "WAS" },
  { week: 15, homeTeam: "BUF", awayTeam: "LAC" },
  { week: 15, homeTeam: "KC", awayTeam: "PIT" },
  { week: 15, homeTeam: "SF", awayTeam: "ARI" },
  { week: 15, homeTeam: "DAL", awayTeam: "PHI" },
  { week: 15, homeTeam: "GB", awayTeam: "MIN" },
  { week: 15, homeTeam: "HOU", awayTeam: "BAL" },
  { week: 15, homeTeam: "TEN", awayTeam: "JAX" },
  { week: 15, homeTeam: "CIN", awayTeam: "CLE" },
  { week: 15, homeTeam: "ATL", awayTeam: "NYG" },
  { week: 15, homeTeam: "NO", awayTeam: "TB" },
  { week: 15, homeTeam: "DEN", awayTeam: "LV" },
  { week: 15, homeTeam: "SEA", awayTeam: "LAR" },
  { week: 15, homeTeam: "CHI", awayTeam: "DET" },
  { week: 15, homeTeam: "MIA", awayTeam: "NE" },
  { week: 15, homeTeam: "IND", awayTeam: "NYJ" },

  // === WEEK 16 ===
  { week: 16, homeTeam: "BAL", awayTeam: "NE" },
  { week: 16, homeTeam: "NYJ", awayTeam: "MIA" },
  { week: 16, homeTeam: "KC", awayTeam: "JAX" },
  { week: 16, homeTeam: "LAR", awayTeam: "NO" },
  { week: 16, homeTeam: "PHI", awayTeam: "GB" },
  { week: 16, homeTeam: "DET", awayTeam: "CHI" },
  { week: 16, homeTeam: "HOU", awayTeam: "TEN" },
  { week: 16, homeTeam: "CIN", awayTeam: "PIT" },
  { week: 16, homeTeam: "DAL", awayTeam: "WAS" },
  { week: 16, homeTeam: "ATL", awayTeam: "CAR" },
  { week: 16, homeTeam: "TB", awayTeam: "NO" },
  { week: 16, homeTeam: "LV", awayTeam: "KC" },
  { week: 16, homeTeam: "ARI", awayTeam: "SF" },
  { week: 16, homeTeam: "SEA", awayTeam: "LAC" },
  { week: 16, homeTeam: "IND", awayTeam: "CLE" },
  { week: 16, homeTeam: "MIN", awayTeam: "NYG" },

  // === WEEK 17 ===
  { week: 17, homeTeam: "BAL", awayTeam: "BUF" },
  { week: 17, homeTeam: "KC", awayTeam: "DET" },
  { week: 17, homeTeam: "SF", awayTeam: "LAR" },
  { week: 17, homeTeam: "PHI", awayTeam: "DAL" },
  { week: 17, homeTeam: "MIA", awayTeam: "NYJ" },
  { week: 17, homeTeam: "MIN", awayTeam: "CHI" },
  { week: 17, homeTeam: "PIT", awayTeam: "BAL" },
  { week: 17, homeTeam: "IND", awayTeam: "HOU" },
  { week: 17, homeTeam: "CLE", awayTeam: "CIN" },
  { week: 17, homeTeam: "NO", awayTeam: "ATL" },
  { week: 17, homeTeam: "CAR", awayTeam: "TB" },
  { week: 17, homeTeam: "DEN", awayTeam: "LV" },
  { week: 17, homeTeam: "ARI", awayTeam: "SEA" },
  { week: 17, homeTeam: "WAS", awayTeam: "NYG" },
  { week: 17, homeTeam: "JAX", awayTeam: "TEN" },
  { week: 17, homeTeam: "NE", awayTeam: "BUF" },

  // === WEEK 18 ===
  { week: 18, homeTeam: "BAL", awayTeam: "PIT" },
  { week: 18, homeTeam: "BUF", awayTeam: "MIA" },
  { week: 18, homeTeam: "KC", awayTeam: "LV" },
  { week: 18, homeTeam: "SF", awayTeam: "SEA" },
  { week: 18, homeTeam: "PHI", awayTeam: "NYG" },
  { week: 18, homeTeam: "DAL", awayTeam: "WAS" },
  { week: 18, homeTeam: "HOU", awayTeam: "IND" },
  { week: 18, homeTeam: "TEN", awayTeam: "JAX" },
  { week: 18, homeTeam: "CIN", awayTeam: "CLE" },
  { week: 18, homeTeam: "ATL", awayTeam: "CAR" },
  { week: 18, homeTeam: "NO", awayTeam: "TB" },
  { week: 18, homeTeam: "DEN", awayTeam: "LAC" },
  { week: 18, homeTeam: "ARI", awayTeam: "LAR" },
  { week: 18, homeTeam: "CHI", awayTeam: "DET" },
  { week: 18, homeTeam: "MIN", awayTeam: "GB" },
  { week: 18, homeTeam: "NE", awayTeam: "NYJ" },
];

async function main() {
  console.log("Clearing picks and matches...");
  await db.execute(sql`DELETE FROM picks`);
  await db.execute(sql`DELETE FROM matches`);

  console.log(`Seeding ${schedule.length} matches...`);
  const rows = schedule.map((m) => ({
    week: m.week,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    gameTime: m.gameTime ?? null,
    pointSpread: spread(),
    injuryWeatherFlags: flag() ?? null,
    winner: null,
    isCompleted: false,
  }));

  await db.insert(schema.matchesTable).values(rows);

  console.log("Done! Week 1 games:");
  const week1 = schedule.filter((m) => m.week === 1);
  week1.forEach((m) => console.log(`  ${m.awayTeam} @ ${m.homeTeam}`));
}

main()
  .then(() => {
    console.log("Seed complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
