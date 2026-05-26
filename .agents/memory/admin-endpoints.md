---
name: Admin endpoints — reset week results and delete user
description: Two direct-fetch admin endpoints added without OpenAPI codegen
---

These endpoints are NOT in the OpenAPI spec — they use direct `fetch()` in admin.tsx.

**DELETE /api/admin/weeks/:week/results**
- Clears `winner` and `isCompleted` (false) for all matches in that week
- Resets `pointsEarned` to 0 for all picks for those matches
- Recalculates and updates `seasonConfig.lastCompletedWeek`
- Returns `{ success, week, matchesReset }`

**DELETE /api/users/:userId**
- Deletes user's picks first (FK constraint)
- Deletes user record
- Returns `{ success, userId, name }`
- 404 if user not found

**Why not in OpenAPI:** These are admin-only one-off actions; adding them to spec would require codegen rerun and add more surface area. Direct fetch is simpler for rare destructive operations.

**How to apply:** If more admin endpoints are needed, keep using direct fetch in admin.tsx rather than adding to OpenAPI spec, unless the endpoint is needed in other contexts.
