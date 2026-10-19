---
name: Current week completion
description: The active week advances only after every match in each sequential prior week has a recorded result. Ties are treated as completed (winner null, isCompleted true) so they do not block week advancement.
---

The active week is based on contiguous, fully completed weeks. A single completed match must not advance the current-week default, and a later week must not be treated as current while an earlier week is incomplete.

**Why:** Commissioner result entry happens one match at a time, so using any completed match caused dashboards and recap filters to jump ahead prematurely. Ties previously skipped completion entirely (no winner set), leaving the week stuck.

**How to apply:** Reuse the shared completion calculation for season status, default week queries, standings filters, and any future current-week UI. ESPN live sync and manual result entry both mark ties as completed with null winner and award 0 points.
