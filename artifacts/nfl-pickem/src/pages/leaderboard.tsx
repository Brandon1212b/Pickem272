import React, { useState, useEffect, useRef } from "react";
import {
  useGetLeaderboard,
  useGetLeaderboardTrends,
  useGetWeeklyExtremes,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const FALLBACK_COLORS = [
  "#007AFF", "#FF6B35", "#34C759", "#AF52DE",
  "#FF2D55", "#5AC8FA", "#FFCC00", "#FF9500",
];

const BADGE_DEFS: Record<string, { name: string; desc: string }> = {
  "👑": { name: "League Leader",  desc: "Currently #1 in total points" },
  "🏆": { name: "Perfect Week",   desc: "Picked every game correctly in a completed week" },
  "🔥": { name: "Week High Score", desc: "Had the highest score that week" },
  "💩": { name: "Week Low Score",  desc: "Had the lowest score that week" },
};

function badgeEmoji(b: string): string {
  if (b === "Perfect Week") return "🏆";
  if (b === "League Leader") return "👑";
  return "";
}

// Click-to-open badge popover — no extra dependencies needed
function BadgePop({
  emoji,
  count,
}: {
  emoji: string;
  count?: number;
}) {
  const def = BADGE_DEFS[emoji];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const display = count && count > 1 ? emoji.repeat(Math.min(count, 5)) : emoji;

  return (
    <span className="relative inline-flex">
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer hover:opacity-70 transition-opacity text-base leading-none focus:outline-none"
        aria-label={def?.name ?? emoji}
      >
        {display}
      </button>
      {open && def && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-[180px] rounded-xl border bg-popover shadow-lg px-3 py-2 text-sm pointer-events-none"
        >
          <p className="font-semibold text-foreground leading-snug">{def.name}</p>
          <p className="text-muted-foreground text-xs mt-0.5 leading-snug">{def.desc}</p>
          {count && count > 1 && (
            <p className="text-primary text-xs font-semibold mt-1">{count}× this season</p>
          )}
        </div>
      )}
    </span>
  );
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
                        <BadgePop emoji="🔥" count={entry.weekHighScoreCount} />
                      )}
                      {entry.weekLowScoreCount > 0 && (
                        <BadgePop emoji="💩" count={entry.weekLowScoreCount} />
                      )}
                      {entry.badges.map((b, i) => {
                        const emoji = badgeEmoji(b);
                        return emoji ? <BadgePop key={i} emoji={emoji} /> : null;
                      })}
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
