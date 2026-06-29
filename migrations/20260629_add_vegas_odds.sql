---
name: Add vegas_odds table
---

CREATE TABLE IF NOT EXISTS vegas_odds (
  id SERIAL PRIMARY KEY,
  team TEXT NOT NULL UNIQUE,
  ou_wins NUMERIC(5,2) NOT NULL DEFAULT 0,
  source TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
