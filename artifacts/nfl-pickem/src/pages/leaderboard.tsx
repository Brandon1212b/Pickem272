import React from "react";
import {
  useGetLeaderboard,
  useGetLeaderboardTrends,
  useGetWeeklyExtremes,
  useGetSeasonStatus,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const FALLBACK_COLORS = [
  "#007AFF", "#FF6B35", "#34C759", "#AF52DE",
  "#FF2D55", "#5AC8FA", "#FFCC00", "#FF9500",
];

const BADGE_KEY = [
  { emoji: "👑", name: "League Leader", desc: "Currently #1 in total points" },
  { emoji: "🏆", name: "Perfect Week", desc: "Picked every game correctly in a completed week" },
  { emoji: "🔥", name: "Week High Score", desc: "One per week you had the top score" },
  { emoji: "💩", name: "Week Low Score", desc: "One per week you had the lowest score" },
];

function badgeEmoji(b: string): string {
  if (b === "Perfect Week") return "🏆";
  if (b === "League Leader") return "👑";
  return "";
}

export default function Leaderboard() {
  const { data: leaderboard, isLoading: loadingBoard } = useGetLeaderboard();
  const { data: trends, isLoading: loadingTrends } = useGetLeaderboardTrends();
  const { data: extremes, isLoading: loadingExtremes } = useGetWeeklyExtremes();

  if (loadingBoard || loadingTrends || loadingExtremes) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const chartData: Record<string, string | number>[] = [];
  if (trends && trends.length > 0) {
    const numWeeks = trends[0].weeklyPoints.length;
    for (let w = 0; w < numWeeks; w++) {
      const dataPoint: Record<string, string | number> = { week: `W${w + 1}` };
      trends.forEach((u) => { dataPoint[u.name] = u.weeklyPoints[w]; });
      chartData.push(dataPoint);
    }
  }

  const getUserColor = (userId: number, idx: number): string => {
    const entry = leaderboard?.find((e) => e.userId === userId);
    return entry?.avatar ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Standings</h1>
        <p className="text-muted-foreground">League performance and analytics</p>
      </div>

      {/* League Standings */}
      <Card>
        <CardHeader>
          <CardTitle>League Standings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard?.map((entry) => (
                <TableRow key={entry.userId}>
                  <TableCell className="font-bold text-lg">{entry.rank}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-semibold">{entry.name}</span>
                      {entry.weekHighScoreCount > 0 && (
                        <span title={`Week high score ${entry.weekHighScoreCount}x`}>
                          {"🔥".repeat(Math.min(entry.weekHighScoreCount, 10))}
                        </span>
                      )}
                      {entry.weekLowScoreCount > 0 && (
                        <span title={`Week low score ${entry.weekLowScoreCount}x`}>
                          {"💩".repeat(Math.min(entry.weekLowScoreCount, 10))}
                        </span>
                      )}
                      <span className="inline-flex gap-0.5">
                        {entry.badges.map((b, i) => {
                          const emoji = badgeEmoji(b);
                          return emoji ? (
                            <span key={i} title={b} className="text-base">{emoji}</span>
                          ) : null;
                        })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-lg">{entry.totalPoints}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {entry.correctPicks}-{entry.wrongPicks}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Badge Key */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Badge Key</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BADGE_KEY.map(({ emoji, name, desc }) => (
              <div key={name} className="flex items-center gap-2.5 p-2 rounded-lg bg-secondary/30">
                <span className="text-xl shrink-0">{emoji}</span>
                <div>
                  <p className="text-xs font-semibold text-foreground">{name}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Weekly extremes */}
      {(extremes?.topUsers?.length || 0) + (extremes?.bottomUsers?.length || 0) > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {extremes?.topUsers && extremes.topUsers.length > 0 && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5 text-center">
                <div className="text-3xl mb-1">🔥</div>
                <h3 className="font-bold text-lg mb-0.5">Week {extremes.week} High Score</h3>
                <div className="font-semibold text-primary">
                  {extremes.topUsers.map((u) => `${u.name} (${u.points} pts)`).join(", ")}
                </div>
              </CardContent>
            </Card>
          )}
          {extremes?.bottomUsers && extremes.bottomUsers.length > 0 && (
            <Card className="bg-destructive/5 border-destructive/20">
              <CardContent className="p-5 text-center">
                <div className="text-3xl mb-1">💩</div>
                <h3 className="font-bold text-lg mb-0.5">Week {extremes.week} Low Score</h3>
                <div className="font-semibold text-destructive">
                  {extremes.bottomUsers.map((u) => `${u.name} (${u.points} pts)`).join(", ")}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Season Trajectory */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Season Trajectory</CardTitle>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="week" className="text-xs" tickLine={false} axisLine={false} />
                <YAxis className="text-xs" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: "16px" }} />
                {trends?.map((u, idx) => (
                  <Line
                    key={u.userId}
                    type="monotone"
                    dataKey={u.name}
                    stroke={getUserColor(u.userId, idx)}
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
