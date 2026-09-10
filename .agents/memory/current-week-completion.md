---
name: Current week completion
description: The active week advances only after every match in each sequential prior week has a recorded result.
---

The active week is based on contiguous, fully completed weeks. A single completed match must not advance the current-week default, and a later week must not be treated as current while an earlier week is incomplete.

**Why:** Commissioner result entry happens one match at a time, so using any completed match caused dashboards and recap filters to jump ahead prematurely.

**How to apply:** Reuse the shared completion calculation for season status, default week queries, standings filters, and any future current-week UI.