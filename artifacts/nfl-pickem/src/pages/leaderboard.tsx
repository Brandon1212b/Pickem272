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
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-max max-w-[180px] rounded-xl border bg-popover shadow-lg px-3 py-2 text-sm pointer-events-none"
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

  // null = follow active week; number = user-selected week
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

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

  // currentWeek = last completed week from extremes
  const currentWeek = extremes?.week ?? 0;
  const activeWeek = selectedWeek ?? currentWeek;

  // Per-week points for a given week (derived from cumulative trends)
  const getWeekPts = (userId: number, week: number): number => {
    if (!trends || week <= 0) return 0;
    const u = trends.find((t) => t.userId === userId);
    if (!u) return 0;
    const cumNow = u.weeklyPoints[week - 1] ?? 0;
    const cumPrev = week > 1 ? (u.weeklyPoints[week - 2] ?? 0) : 0;
    return cumNow - cumPrev;
  };

  const completedWeeks = currentWeek > 0
    ? Array.from({ length: currentWeek }, (_, i) => i + 1)
    : [];

  // Biggest Mover: compare rank at previous week vs current week
  type Mover = { name: string; avatar: string | null; delta: number };
  let biggestMover: Mover | null = null;
  if (trends && trends.length >= 2 && trends[0].weeklyPoints.length >= 2) {
    const numWeeks = trends[0].weeklyPoints.length;
    const rank = (weekIdx: number) =>
      [...trends]
        .sort((a, b) => (b.weeklyPoints[weekIdx] ?? 0) - (a.weeklyPoints[weekIdx] ?? 0))
        .map((u, i) => ({ userId: u.userId, rank: i + 1 }));
    const prevRanks = rank(numWeeks - 2);
    const currRanks = rank(numWeeks - 1);
    const movers: Mover[] = trends.map((u) => {
      const prev = prevRanks.find((r) => r.userId === u.userId)?.rank ?? 0;
      const curr = currRanks.find((r) => r.userId === u.userId)?.rank ?? 0;
      return { name: u.name, avatar: u.avatar, delta: prev - curr }; // positive = moved up
    });
    movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    if (movers[0] && movers[0].delta !== 0) biggestMover = movers[0];
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

      {/* Biggest Mover callout */}
      {biggestMover && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${biggestMover.delta > 0 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
          <span className="text-xl leading-none">{biggestMover.delta > 0 ? "📈" : "📉"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none mb-0.5">Biggest Mover</p>
            <p className="text-sm font-semibold text-foreground truncate">
              {biggestMover.name}
              <span className={`ml-1.5 font-bold ${biggestMover.delta > 0 ? "text-green-500" : "text-red-500"}`}>
                {biggestMover.delta > 0 ? "↑" : "↓"}{Math.abs(biggestMover.delta)}&nbsp;{Math.abs(biggestMover.delta) === 1 ? "spot" : "spots"}
              </span>
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground whitespace-nowrap">vs last wk</p>
        </div>
      )}

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
                <TableHead className="text-right whitespace-nowrap">
                  {completedWeeks.length > 0 ? (
                    <select
                      value={activeWeek}
                      onChange={(e) => setSelectedWeek(Number(e.target.value))}
                      className="bg-transparent text-right font-medium text-sm cursor-pointer focus:outline-none appearance-none pr-3 relative"
                      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%236b7280' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0 center" }}
                    >
                      {completedWeeks.map((w) => (
                        <option key={w} value={w}>Wk {w}</option>
                      ))}
                    </select>
                  ) : "Pts"}
                </TableHead>
                <TableHead className="text-right">Total</TableHead>
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
                  <TableCell className="text-right font-bold text-lg">
                    {activeWeek > 0 ? getWeekPts(entry.userId, activeWeek) : entry.totalPoints}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground font-medium">
                    {entry.totalPoints}
                  </TableCell>
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
        <div className="grid grid-cols-2 gap-3">
          {extremes?.topUsers && extremes.topUsers.length > 0 && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-3 text-center">
                <div className="text-xl mb-0.5">🔥</div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                  Wk {extremes.week} High
                </p>
                <p className="font-bold text-sm text-primary leading-snug">
                  {extremes.topUsers.map((u) => `${u.name} (${u.points})`).join(", ")}
                </p>
              </CardContent>
            </Card>
          )}
          {extremes?.bottomUsers && extremes.bottomUsers.length > 0 && (
            <Card className="bg-destructive/5 border-destructive/20">
              <CardContent className="p-3 text-center">
                <div className="text-xl mb-0.5">💩</div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                  Wk {extremes.week} Low
                </p>
                <p className="font-bold text-sm text-destructive leading-snug">
                  {extremes.bottomUsers.map((u) => `${u.name} (${u.points})`).join(", ")}
                </p>
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
