---
name: User avatar column and profile editing
description: Avatar emoji stored in users table; profile editing via header popover; commish access for Bfabs
---

`users` table has a nullable `avatar` text column (stores emoji string up to 10 chars).

Profile editing via `ProfileButton` component in `layout.tsx` — clicking the avatar circle in the header opens a Popover with:
- Emoji grid picker (20 options)
- Name rename field (calls PATCH /api/users/:id)
- Sign out button
- "Commish Tools" link → /admin (only shown when `user.name === "Bfabs"`)

PATCH endpoint in `artifacts/api-server/src/routes/users.ts` validates name (1-32 chars) and avatar (null or ≤10 char string) without zod (api-server doesn't import zod directly).

**Why:** No zod import in api-server — use manual type narrowing instead.

**How to apply:** Avatar is stored in localStorage alongside id/name; update localStorage directly for immediate UI refresh after emoji change.
