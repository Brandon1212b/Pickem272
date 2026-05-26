---
name: Scripts typecheck pre-existing errors
description: scripts/src/seed-schedule.ts has pre-existing TS errors; safe to ignore in CI
---

`pnpm run typecheck` (root) runs typechecks for all workspace packages including `scripts`. The `scripts` package has pre-existing errors in `src/seed-schedule.ts`:
- Cannot find module 'drizzle-orm/node-postgres' or 'pg'
- Files from lib/db are not under rootDir

These are NOT caused by app code changes. The scripts package is a one-time seed utility, not part of the running app.

**How to apply:** When verifying typecheck results, run per-package checks (`pnpm --filter @workspace/nfl-pickem run typecheck` and `pnpm --filter @workspace/api-server run typecheck`) to get a clean signal. The root typecheck will always show these script errors.
