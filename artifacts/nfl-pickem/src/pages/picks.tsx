diff --git a/artifacts/nfl-pickem/src/pages/picks.tsx b/artifacts/nfl-pickem/src/pages/picks.tsx
index f13c2cb..0000000 100644
--- a/artifacts/nfl-pickem/src/pages/picks.tsx
+++ b/artifacts/nfl-pickem/src/pages/picks.tsx
@@
-        {teamFilterControl}
-
-        {/* Current week */}
-        {currentWeekEntry && renderWeekCard(currentWeekEntry.week, currentWeekEntry.matches, true)}
+        {teamFilterControl}
+
+        {/* Team Records (moved to top) */}
+        {teamRecordsSorted.length > 0 && (() => {
+          const recordMap = Object.fromEntries(teamRecordsSorted.map((r) => [r.team, r]));
+          const TeamRecordsCard = require("@/components/team-records/TeamRecordsCard").default;
+          return <TeamRecordsCard teamRecordsSorted={teamRecordsSorted} recordMap={recordMap} />;
+        })()}
+
+        {/* Current week */}
+        {currentWeekEntry && renderWeekCard(currentWeekEntry.week, currentWeekEntry.matches, true)}
@@
-      {/* Team records (if picks exist) */}
-      {teamRecordsSorted.length > 0 && (() => {
-        const recordMap = Object.fromEntries(teamRecordsSorted.map((r) => [r.team, r]));
-        return (
-          <Card>
-            <CardHeader className="pb-1 pt-3 px-4">
-              <CardTitle className="text-sm font-semibold text-muted-foreground">Your Team Records</CardTitle>
-            </CardHeader>
-            <CardContent className="px-4 pb-3 space-y-2">
-              {NFL_STRUCTURE.map(({ conf, divisions }) => {
-                const hasAny = divisions.some((d) => d.teams.some((t) => recordMap[t]));
-                if (!hasAny) return null;
-                return (
-                  <div key={conf}>
-                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{conf}</p>
-                    <div className="space-y-1">
-                      {divisions.map(({ div, teams }) => {
-                        const divTeams = teams
-                          .filter((t) => recordMap[t])
-                          .sort((a, b) => (recordMap[b].wins - recordMap[a].wins) || (recordMap[a].losses - recordMap[b].losses));
-                        if (divTeams.length === 0) return null;
-                        return (
-                          <div key={div} className="flex items-center gap-1.5">
-                            <span className="text-[8px] text-muted-foreground w-6 shrink-0 font-medium">{div}</span>
-                            <div className="flex gap-1 flex-wrap">
-                              {divTeams.map((team) => {
-                                const { wins, losses } = recordMap[team];
-                                return (
-                                  <div key={team} className="flex flex-col items-center gap-0 p-1 rounded-lg bg-secondary/30 border border-border/50 min-w-[40px]">
-                                    <TeamLogo team={team} size={18} />
-                                    <span className="text-[7px] font-bold text-muted-foreground uppercase">{team}</span>
-                                    <span className="text-[9px] font-bold text-foreground">{wins}-{losses}</span>
-                                  </div>
-                                );
-                              })}
-                            </div>
-                          </div>
-                        );
-                      })}
-                    </div>
-                  </div>
-                );
-              })}
-            </CardContent>
-          </Card>
-        );
-      })()}
+      {/* Team records removed from bottom (now shown at top) */}
