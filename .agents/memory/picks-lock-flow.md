---
name: Picks lock flow
description: After all 288 picks submitted, auto-locks into a summary view via localStorage
---

When user saves and all 288 picks are filled, picks.tsx auto-sets localStorage key `picks_locked_${userId}` to `"true"` and shows a locked summary view.

**Lock trigger:** In `savePicks.onSuccess`, uses refs (`localPicksRef`, `matchesLengthRef`) to check pick count vs total matches count at callback time (avoids stale closure).

**Locked view:** Week-by-week cards showing team logos the user picked to win.
- Green border + ✓ badge = correct pick (match.isCompleted && selectedTeam === winner)
- Red border + ✗ badge = wrong pick (completed, different winner)
- Gray border = pending (not yet completed)
- Header shows: "Week N" + W-L record for that week's completed games

**Unlock:** `localStorage.removeItem(picksLockedKey)` → `setPicksSubmitted(false)` → returns to editing view. Only shown in pre-season (season mode !== "in-season").

**Why:** Provides a clean "submitted" confirmation state so users see their full 18-week ballot at a glance without the editing UI getting in the way.

**How to apply:** The lock is purely client-side (localStorage). Server doesn't know about it. The season mode toggle in admin is the server-side lock.
