---
name: Scoring is 1pt flat — no lock of the week
description: Lock of the week concept fully removed; correct pick = 1pt always
---

Lock of the week is **completely removed** from the app as of batch 3.

**Backend changes:**
- admin.ts: `points = pick.isLock ? 2 : 1` → `points = 1` (flat)
- picks.ts: Removed lock-per-week validation; autofill always sets isLock: false; save always stores isLock: false
- leaderboard.ts: Lock-related badge logic was never there (badges were Against the Grain and The Cellar — both also removed)

**Frontend changes:**
- picks.tsx: Lock button, handleLock, totalLocks display, weekLock indicator all removed
- help.tsx: Lock of the Week section removed from How to Play
- localPicks state simplified from `Record<number, { selectedTeam, isLock }>` to `Record<number, string>` (matchId → selectedTeam)

**DB:** `isLock` column stays in picks table (avoid migration); always saved as false going forward.

**Why:** Simplifies the game. No more strategic penalty risk.

**How to apply:** Never add isLock logic back. Any save payload sends `isLock: false` explicitly (Zod schema still requires the field).
