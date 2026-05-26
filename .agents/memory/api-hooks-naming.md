---
name: Orval-generated hook naming conventions
description: How Orval names hooks from the OpenAPI spec operationIds/paths
---

Orval generates hooks based on the `operationId` in the OpenAPI spec, NOT the path.

Known mappings (operationId → hook name):
- `listUsers` (GET /api/users) → `useListUsers` + `getListUsersQueryKey`
- `loginUser` (POST /api/users/login) → `useLoginUser`
- `getLeaderboard` → `useGetLeaderboard` + `getGetLeaderboardQueryKey`
- `listMatches` → `useListMatches` + `getListMatchesQueryKey`
- `getSeasonStatus` → `useGetSeasonStatus` + `getGetSeasonStatusQueryKey`
- `savePicks` → `useSavePicks`
- `autofillPicks` → `useAutofillPicks`
- `getUserPicks` → `useGetUserPicks` + `getGetUserPicksQueryKey`
- `getUserPicksForWeek` → `useGetUserPicksForWeek` + `getGetUserPicksForWeekQueryKey`
- `updateUser` → `useUpdateUser`
- `setMatchResult` → `useSetMatchResult`
- `updateSeasonMode` → `useUpdateSeasonMode`
- `sendWebhookNotification` → `useSendWebhookNotification`

**Why:** The naming is NOT predictable from the path alone (e.g. GET /api/users is `useListUsers` not `useGetUsers`). Always verify against `lib/api-client-react/src/generated/api.ts` grep when unsure.

**How to apply:** Before adding a hook, grep `lib/api-client-react/src/generated/api.ts` for `export.*use` to confirm exact name.
