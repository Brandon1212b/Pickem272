---
name: Pick popularity API behavior
description: The pick-popularity endpoint filters to active week and returns counts + picker names
---

`GET /api/leaderboard/pick-popularity` returns games for `lastCompletedWeek + 1` (the current active week), not all weeks.

Response includes: `homePickCount`, `awayPickCount`, `homePickPct`, `awayPickPct`, `homePickerNames[]`, `awayPickerNames[]`.

**Why:** Showing all 288 games' popularity was overwhelming; active week is what matters in-season. Picker names enable the overlapping avatar UI in leaderboard.tsx.

**How to apply:** The PickPopularity OpenAPI schema must include count + names fields. The frontend PickerAvatars component renders stacked initials circles.
