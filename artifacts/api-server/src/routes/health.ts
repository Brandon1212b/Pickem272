import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/setup-db", async (_req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id serial PRIMARY KEY,
        name text NOT NULL UNIQUE,
        avatar text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS matches (
        id serial PRIMARY KEY,
        week integer NOT NULL,
        home_team text NOT NULL,
        away_team text NOT NULL,
        winner text,
        is_completed boolean NOT NULL DEFAULT false,
        point_spread text,
        injury_weather_flags text,
        game_time text
      );

      CREATE TABLE IF NOT EXISTS picks (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        match_id integer NOT NULL REFERENCES matches(id),
        selected_team text NOT NULL,
        is_lock boolean NOT NULL DEFAULT false,
        points_earned integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS smackboard (
        id serial PRIMARY KEY,
        name text NOT NULL,
        message text NOT NULL,
        timestamp timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS season_config (
        id serial PRIMARY KEY,
        mode text NOT NULL DEFAULT 'pre-season',
        last_completed_week integer NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS storylines (
        id serial PRIMARY KEY,
        week integer NOT NULL UNIQUE,
        text text NOT NULL,
        updated_at timestamp NOT NULL DEFAULT now()
      );

      INSERT INTO season_config (mode, last_completed_week)
      SELECT 'pre-season', 0
      WHERE NOT EXISTS (SELECT 1 FROM season_config);
    `);

    res.json({ ok: true, message: "Database tables are ready." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
