import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  useGetLeaderboard,
  useGetLeaderboardTrends,
  useGetWeeklyExtremes,
  useGetUserPicks,
  useListMatches,
  getGetUserPicksQueryKey,
  getGetLeaderboardQueryKey,
  getGetLeaderboardTrendsQueryKey,
  getGetWeeklyExtremesQueryKey,
  getListMatchesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ALL_NFL_TEAMS, TeamRecordsCard } from "@/components/team-records-card";
import type { TeamRecord } from "@/components/team-records-card";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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

// Truncate username to 10 characters with ellipsis
const truncateName = (name: string, maxLength: number = 10): string => {
  if (name.length > maxLength) {
    return name.substring(0, maxLength - 1) + '…';
  }
  return name;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface SeasonRecapData {
  achievements: { type: string; label: string; userId: number; name: string; avatar: string | null; value: number; detail: string }[];
  weeklyWinners: {
    week: number;
    winners: { userId: number; name: string; avatar: string | null; points: number }[];
  }[];
}

function AvatarBubble({ name, color, size = 20 }: { name: string; color?: string | null; size?: number }) {
  return (
    <div
      title={name}
      className="rounded-full flex items-center justify-center text-white font-bold select-none shrink-0"
      style={{ backgroundColor: color ?? "#007AFF", width: size, height: size, fontSize: size * 0.38 }}
    >
      {getInitials(name)}
    </div>
  );
}

function SeasonAwardsSection({
  data,
  loading,
  userColorMap,
}: {
  data: SeasonRecapData | null;
  loading: boolean;
  userColorMap: Record<string, string>;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data || (data.achievements.length === 0 && data.weeklyWinners.length === 0)) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Trophy className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Season awards unlock once games are completed</p>
          <p className="text-xs mt-1">Check back after Week 1!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.achievements.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-500" />
              Season Awards
            </CardTitle>
            <p className="text-xs text-muted-foreground">Updated as games complete</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.achievements.map((a, i) => {
              const isTieList = a.name.includes(",");
              return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/50">
                <div className="shrink-0">
                  {isTieList ? (
                    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold">
                      {a.name.split(",").length}
                    </div>
                  ) : (
                    <AvatarBubble name={a.name} color={userColorMap[a.name] ?? a.avatar} size={36} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-bold shrink-0">{a.label}</Badge>
                    <span className="font-semibold text-sm">{a.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-primary">{a.value}</p>
                </div>
              </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {data.weeklyWinners.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weekly Winners</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.weeklyWinners.map((w) => (
              <div key={w.week} className="flex items-start gap-3 py-1.5">
                <span className="text-xs font-bold text-muted-foreground w-10 shrink-0">Wk {w.week}</span>
                <div className="flex -space-x-1.5 pt-0.5 shrink-0">
                  {w.winners.map((winner) => (
                    <AvatarBubble
                      key={winner.userId}
                      name={winner.name}
                      color={userColorMap[winner.name] ?? winner.avatar}
                      size={26}
                    />
                  ))}
                </div>
                <span className="flex-1 min-w-0 text-sm font-semibold">
                  {w.winners.map((winner) => winner.name).join(", ")}
                </span>
                <span className="text-xs font-bold text-primary whitespace-nowrap">
                  {w.winners[0]?.points ?? 0} pts
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type TrajectoryDotProps = {
  cx?: number;
  cy?: number;
  index?: number;
  fill?: string;
  latestIndex: number;
  initials: string;
  showLatestBadge: boolean;
};

function TrajectoryDot({
  cx,
  cy,
  index,
  fill = "#007AFF",
  latestIndex,
  initials,
  showLatestBadge,
}: TrajectoryDotProps) {
  if (cx === undefined || cy === undefined) return null;

  if (index === latestIndex && showLatestBadge) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={11} fill={fill} stroke="hsl(var(--card))" strokeWidth={2} />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={7}
          fontWeight={700}
          pointerEvents="none"
        >
          {initials}
        </text>
      </g>
    );
  }

  return <circle cx={cx} cy={cy} r={3} fill={fill} stroke={fill} strokeWidth={2} />;
}

type TrajectoryLegendEntry = {
  dataKey?: string | number;
  value?: string | number;
  color?: string;
};

function TrajectoryLegend({
  payload,
  visibleUserIds,
  showFullLeague,
}: {
  payload?: TrajectoryLegendEntry[];
  visibleUserIds: Set<number>;
  showFullLeague: boolean;
}) {
  const entries = (payload ?? []).filter((entry) => {
    if (showFullLeague) return true;
    if (typeof entry.dataKey !== "string" || !entry.dataKey.startsWith("user_")) return false;
    return visibleUserIds.has(Number(entry.dataKey.slice("user_".length)));
  });

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-4 text-xs">
      {entries.map((entry) => (
        <span key={String(entry.dataKey)} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color ?? "hsl(var(--muted-foreground))" }}
          />
          <span className="text-muted-foreground">{entry.value ?? entry.dataKey}</span>
        </span>
      ))}
    </div>
  );
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

  const display = count && count > 1 ? `${emoji}x${count}` : emoji;

  return (
    <span className="relative inline-flex">
      <button
        ref={ref}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((o) => !o);
        }}
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
  const { data: leaderboard, isLoading: loadingBoard } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey(), refetchInterval: 30_000 },
  });
  const { data: trends, isLoading: loadingTrends } = useGetLeaderboardTrends({
    query: { queryKey: getGetLeaderboardTrendsQueryKey(), refetchInterval: 30_000 },
  });
  const { data: extremes, isLoading: loadingExtremes } = useGetWeeklyExtremes({
    query: { queryKey: getGetWeeklyExtremesQueryKey(), refetchInterval: 30_000 },
  });
  const { data: matches, isLoading: loadingMatches } = useListMatches(undefined, {
    query: { queryKey: getListMatchesQueryKey(), refetchInterval: 30_000 },
  });

  const { data: seasonRecap, isLoading: loadingSeasonRecap } = useQuery<SeasonRecapData>({
    queryKey: ["season-recap"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard/season-recap");
      if (!res.ok) throw new Error("Failed to fetch season recap");
      return res.json() as Promise<SeasonRecapData>;
    },
    refetchInterval: 30_000,
  });

  const userColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of leaderboard ?? []) {
      map[entry.name] = entry.avatar ?? "#007AFF";
    }
    return map;
  }, [leaderboard]);

  // null = follow active week; number = user-selected week
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showFullLeague, setShowFullLeague] = useState(false);
  const { data: selectedUserPicks, isLoading: loadingSelectedUserPicks } = useGetUserPicks(selectedUserId ?? 0, {
    query: {
      enabled: selectedUserId !== null,
      queryKey: getGetUserPicksQueryKey(selectedUserId ?? 0),
    },
  });

  if (loadingBoard || loadingTrends || loadingExtremes || loadingMatches) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Standings follow the latest week with at least one completed game.
  // This differs from weekly extremes, which intentionally uses the last
  // fully completed week for its high/low comparison.
  const currentWeek = Math.max(
    1,
    ...(matches ?? []).filter((match) => match.isCompleted).map((match) => match.week),
  );
  const activeWeek = selectedWeek ?? currentWeek;

  // Keep trajectory series in the same order as the current standings.
  const rankedTrends = [...(trends ?? [])].sort((a, b) => {
    const rankA = leaderboard?.find((entry) => entry.userId === a.userId)?.rank ?? Number.MAX_SAFE_INTEGER;
    const rankB = leaderboard?.find((entry) => entry.userId === b.userId)?.rank ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB || a.name.localeCompare(b.name);
  });
  const topFiveTrends = rankedTrends.slice(0, 5);
  const topFiveIds = new Set(topFiveTrends.map((user) => user.userId));
  // Draw background lines first so the highlighted top five stay visually prominent.
  const trajectoryUsers = showFullLeague
    ? rankedTrends
    : [...rankedTrends.slice(5), ...topFiveTrends];
  const totalTrendWeeks = rankedTrends.reduce(
    (maxWeeks, user) => Math.max(maxWeeks, user.weeklyPoints.length),
    0,
  );
  const firstTrajectoryWeek = showFullLeague ? 0 : Math.max(0, totalTrendWeeks - 4);
  const trajectoryWeekIndexes = Array.from(
    { length: Math.max(0, totalTrendWeeks - firstTrajectoryWeek) },
    (_, index) => firstTrajectoryWeek + index,
  );
  const chartData: Record<string, string | number>[] = trajectoryWeekIndexes.map((weekIndex) => {
    const dataPoint: Record<string, string | number> = { week: `W${weekIndex + 1}` };
    trajectoryUsers.forEach((user) => {
      dataPoint[`user_${user.userId}`] = user.weeklyPoints[weekIndex] ?? 0;
    });
    return dataPoint;
  });
  const topFiveValues = trajectoryWeekIndexes.flatMap((weekIndex) =>
    topFiveTrends.map((user) => user.weeklyPoints[weekIndex] ?? 0),
  );
  const compactYAxisDomain: [number, number] = topFiveValues.length > 0
    ? [
        Math.max(0, Math.min(...topFiveValues) - 2),
        Math.max(...topFiveValues) + 2,
      ]
    : [0, 2];

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

  const selectedUser = leaderboard?.find((entry) => entry.userId === selectedUserId);
  const selectedUserRecords: TeamRecord[] = (() => {
    const records: Record<string, TeamRecord> = {};
    for (const team of ALL_NFL_TEAMS) records[team] = { team, wins: 0, losses: 0 };
    const picksByMatch = new Map((selectedUserPicks ?? []).map((pick) => [pick.matchId, pick.selectedTeam]));
    for (const match of matches ?? []) {
      const pickedTeam = picksByMatch.get(match.id);
      if (!pickedTeam) continue;
      const otherTeam = pickedTeam === match.homeTeam ? match.awayTeam : match.homeTeam;
      records[pickedTeam].wins += 1;
      records[otherTeam].losses += 1;
    }
    return Object.values(records);
  })();

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
          <p className="text-xs text-muted-foreground">Click a player to view their full-season team records.</p>
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
                <TableHead className="text-right">Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard?.map((entry) => (
                <TableRow
                  key={entry.userId}
                  tabIndex={0}
                  className="cursor-pointer hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => setSelectedUserId(entry.userId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedUserId(entry.userId);
                    }
                  }}
                  aria-label={`View ${entry.name}'s team records`}
                >
                  <TableCell className="font-bold text-lg">
                    <span className="flex items-center gap-1">
                      {entry.rank}
                      {(() => {
                        if (!trends || trends[0]?.weeklyPoints.length < 2) return null;
                        const numWeeks = trends[0].weeklyPoints.length;
                        const rank = (weekIdx: number) =>
                          [...trends]
                            .sort((a, b) => (b.weeklyPoints[weekIdx] ?? 0) - (a.weeklyPoints[weekIdx] ?? 0))
                            .map((u, i) => ({ userId: u.userId, rank: i + 1 }));
                        const prevRanks = rank(numWeeks - 2);
                        const currRanks = rank(numWeeks - 1);
                        const prev = prevRanks.find((r) => r.userId === entry.userId)?.rank ?? 0;
                        const curr = currRanks.find((r) => r.userId === entry.userId)?.rank ?? 0;
                        const delta = prev - curr;
                        if (delta > 0) return <span className="text-green-500 text-sm">↑{delta}</span>;
                        if (delta < 0) return <span className="text-red-500 text-sm">↓{Math.abs(delta)}</span>;
                        return <span className="text-muted-foreground text-sm">—</span>;
                      })()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold" title={entry.name}>{truncateName(entry.name)}</span>
                      <div className="flex items-center gap-1 flex-wrap">
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
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-lg">
                    {activeWeek > 0 ? getWeekPts(entry.userId, activeWeek) : entry.totalPoints}
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

      <Dialog open={selectedUserId !== null} onOpenChange={(open) => !open && setSelectedUserId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedUser?.name ?? "Player"}’s Team Records</DialogTitle>
            <DialogDescription>
              How this player has each team finishing based on their season picks.
            </DialogDescription>
          </DialogHeader>
          {loadingMatches || loadingSelectedUserPicks ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <TeamRecordsCard
              records={selectedUserRecords}
              title="Full Season Picks"
              description="Wins are the teams they selected; losses are the opponents in those games."
            />
          )}
        </DialogContent>
      </Dialog>

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Season Trajectory</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {showFullLeague ? "Full league · entire season" : "Top 5 · last 4 weeks"}
                </p>
              </div>
              <div className="flex items-center rounded-lg border bg-secondary/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setShowFullLeague(false)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    !showFullLeague ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Top 5
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullLeague(true)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    showFullLeague ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Full league
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="week" className="text-xs" tickLine={false} axisLine={false} />
                <YAxis
                  className="text-xs"
                  tickLine={false}
                  axisLine={false}
                  domain={showFullLeague ? [0, "auto"] : compactYAxisDomain}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                  }}
                />
                <Legend
                  content={
                    <TrajectoryLegend
                      visibleUserIds={topFiveIds}
                      showFullLeague={showFullLeague}
                    />
                  }
                />
                {trajectoryUsers.map((u, idx) => (
                  (() => {
                    const isHighlighted = showFullLeague || topFiveIds.has(u.userId);
                    const colorIndex = rankedTrends.findIndex((trend) => trend.userId === u.userId);
                    const color = isHighlighted
                      ? getUserColor(u.userId, colorIndex)
                      : "hsl(var(--muted-foreground) / 0.35)";

                    return (
                      <Line
                        key={u.userId}
                        type="monotone"
                        dataKey={`user_${u.userId}`}
                        name={u.name}
                        legendType={isHighlighted ? "line" : "none"}
                        stroke={color}
                        strokeWidth={isHighlighted ? 2.5 : 1.5}
                        dot={(props) => (
                          <TrajectoryDot
                            {...props}
                            fill={color}
                            initials={getInitials(u.name)}
                            latestIndex={chartData.length - 1}
                            showLatestBadge={isHighlighted}
                          />
                        )}
                        activeDot={isHighlighted ? { r: 5 } : false}
                      />
                    );
                  })()
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Season Awards — moved from Recap */}
      <SeasonAwardsSection
        data={seasonRecap ?? null}
        loading={loadingSeasonRecap}
        userColorMap={userColorMap}
      />
    </div>
  );
}
