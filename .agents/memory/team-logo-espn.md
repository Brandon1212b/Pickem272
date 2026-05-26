---
name: Team logo ESPN mappings
description: ESPN CDN abbreviation exceptions for NFL team logos used in team-logos.tsx
---

URL pattern: `https://a.espncdn.com/i/teamlogos/nfl/500/{espnAbbrev}.png`

Key exception: WAS → "wsh" (Washington Commanders). All others are lowercase of our app abbreviation.

Full map lives in `artifacts/nfl-pickem/src/lib/team-logos.tsx` as `ESPN_ABBREV`.

**Why:** ESPN uses "wsh" historically for Washington; using "was" returns a 404.

**How to apply:** Always use `getTeamLogo(abbrev)` from team-logos.tsx rather than `.toLowerCase()` directly.
