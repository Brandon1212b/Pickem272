---
name: Weekly Recap Page
description: Architecture and decisions for the /recap page and its supporting backend
---

## What was built

A `/recap` page that replaces "My Picks" in the nav when `status.mode === "in-season"`. Pre-season still shows "My Picks" nav item.

## Routes
- `GET /api/leaderboard/weekly-recap?week=N` — pick trends, highlights, splits, storyline, nobody-picked
- `GET /api/leaderboard/season-recap` — season achievements + weekly winners
- `PATCH /api/admin/weeks/:week/storyline` — upsert commissioner storyline text

## DB
- `storylines` table: `id, week (unique), text, updated_at` — created via raw SQL (drizzle push requires TTY)

## Frontend
- `artifacts/nfl-pickem/src/pages/recap.tsx` — full recap page
- Nav in `layout.tsx`: `isInSeason ? { href: "/recap", ... } : { href: "/picks", ... }`
- Route added in `App.tsx`

## Admin
- Storyline editor added to `admin.tsx` — week selector + textarea + save button
- Loads existing storyline via `/api/leaderboard/weekly-recap?week=N` on week change

## Key decisions
**Why:** The recap page uses direct `useQuery` (not generated hooks) for weekly-recap and season-recap because these endpoints take optional query params that codegen doesn't handle gracefully.

**How to apply:** Any future endpoints with optional query params that gate major page sections should use direct `useQuery` in the frontend.

## Smack Board
Smack Board was moved from Dashboard to the Recap page (bottom section). It still uses the same `/api/smackboard` endpoints and polls every 15 seconds. The Dashboard still has its own Smack Board card — it was not removed from Dashboard to avoid breaking that page.
