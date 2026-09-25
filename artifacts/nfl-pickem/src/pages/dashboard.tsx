import React, { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import {
  useGetSeasonStatus,
  useListMatches,
  useGetUserPicks,
  useGetLeaderboard,
  getGetUserPicksQueryKey,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TeamLogo } from "@/lib/team-logos";
import { getTeamSplitColors } from "@/lib/team-colors";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function PickerAvatars({
  names,
  colorMap = {},
  limit = 5,
  onClick,
}: {
  names: string[];
  colorMap?: Record<string, string>;
  limit?: number;
  onClick?: () => void;
}) {
  const shown = names.slice(0, limit);
  const extra = names.length - limit;
  const content = (
    <>
      <div className="flex -space-x-1.5">
        {shown.map((name, i) => (
          <div
            key={i}
            title={name}
            className="w-5 h-5 rounded-full border border-card flex items-center justify-center text-[8px] font-bold text-white select-none shrink-0"
            style={{ backgroundColor: colorMap[name] ?? "#888888" }}
          >
            {getInitials(name)}
          </div>
        ))}
        {extra > 0 && (
          <div className="w-5 h-5 rounded-full bg-muted border border-card flex items-center justify-center text-[8px] font-medium text-muted-foreground shrink-0">
            +{extra}
          </div>
        )}
      </div>
      {names.length > 0 && (
        <span className="ml-1 text-[10px] text-muted-foreground font-medium">{names.length}</span>
      )}
    </>
  );

  if (names.length === 0) return <div className="flex items-center">{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center rounded-md hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      aria-label={`Show ${names.length} picker${names.length === 1 ? "" : "s"}`}
    >
      {content}
    </button>
  );
}

// Day order within a week: Wed opener → Thu night → Fri (Black Friday) → Sat → Sun → Mon night
const DAY_ORDER: Record<string, number> = { Wed: 0, Thu: 1, Fri: 2, Sat: 3, Sun: 4, Mon: 5 };

function gameTimeSortKey(gameTime: string | null): number {
  if (!gameTime) return 9999;
  const [day, time] = gameTime.split(" ");
  const dayNum = DAY_ORDER[day] ?? 10;
  if (!time) return dayNum * 10000;
  const isPM = time.endsWith("pm");
  const timeStr = time.replace(/[ap]m$/, "");
  const [hoursStr, minutesStr] = timeStr.split(":");
  let h = parseInt(hoursStr, 10);
  const m = parseInt(minutesStr ?? "0", 10);
  if (isPM && h !== 12) h += 12;
  if (!isPM && h === 12) h = 0;
  return dayNum * 10000 + h * 60 + m;
}

interface PopularityItem {
  matchId: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homePickCount: number;
  awayPickCount: number;
  homePickPct: number;
  awayPickPct: number;
  homePickerNames: string[];
  awayPickerNames: string[];
  gameTime: string | null;
  isCompleted?: boolean;
  winner?: string | null;
}

interface LiveScoreGame {
  awayTeam: string;
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  status: string;
  completed: boolean;
  clock: string;
  period: number;
}

interface LiveScoreResponse {
  week: number | null;
  games: LiveScoreGame[];
}

function normalizeScoreboardTeam(team: string): string {
  const map: Record<string, string> = {
    JAC: "JAX",
    WSH: "WAS",
    LVR: "LV",
    SFO: "SF",
    GNB: "GB",
    NWE: "NE",
    KAN: "KC",
    NOR: "NO",
    TAM: "TB",
  };
  return map[team] ?? team;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  // null = default (active week), number = user-selected week
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedPickers, setSelectedPickers] = useState<{ team: string; names: string[] } | null>(null);

  const { data: status } = useGetSeasonStatus();
  const { data: allMatches } = useListMatches();
  const { data: picks } = useGetUserPicks(user?.id || 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserPicksQueryKey(user?.id || 0) },
  });
  const { data: leaderboard } = useGetLeaderboard();
  const { data: liveScores } = useQuery<LiveScoreResponse>({
    queryKey: ["live-scores"],
    queryFn: async () => {
      const res = await fetch("/api/admin/live-scores");
      if (!res.ok) throw new Error("Failed to fetch live scores");
      return res.json() as Promise<LiveScoreResponse>;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  const userStats = leaderboard?.find((e) => e.userId === user?.id);
  const activeWeek = Math.min((status?.lastCompletedWeek ?? 0) + 1, 18);
  const displayWeek = selectedWeek ?? activeWeek;

  // Fetch pick popularity for the selected week via direct fetch (supports week param)
  const { data: popularity } = useQuery<PopularityItem[]>({
    queryKey: ["pick-popularity", displayWeek],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard/pick-popularity?week=${displayWeek}`);
      if (!res.ok) throw new Error("Failed to fetch popularity");
      return res.json() as Promise<PopularityItem[]>;
    },
    enabled: displayWeek > 0,
  });

  // Map user names → their avatar color (for picker avatars)
  const userColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of leaderboard ?? []) {
      map[entry.name] = entry.avatar ?? "#007AFF";
    }
    return map;
  }, [leaderboard]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card
          className="bg-primary text-primary-foreground border-none cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => setLocation("/leaderboard")}
        >
          <CardContent className="p-4 flex flex-col">
            <p className="text-primary-foreground/70 text-xs font-medium">Rank</p>
            <h2 className="text-3xl font-bold">{userStats ? `#${userStats.rank}` : "—"}</h2>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs font-medium">Points</p>
            <h2 className="text-3xl font-bold">{userStats?.totalPoints ?? 0}</h2>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs font-medium">Record</p>
            <h2 className="text-2xl font-bold">
              {userStats ? `${userStats.correctPicks}-${userStats.wrongPicks}` : "0-0"}
            </h2>
          </CardContent>
        </Card>
      </div>

      {/* Week Pick Split */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>
              Week {displayWeek} Pick Split
              {displayWeek !== activeWeek && (
                <button
                  onClick={() => setSelectedWeek(null)}
                  className="ml-2 text-xs font-normal text-primary hover:underline"
                >
                  ← Back to current
                </button>
              )}
            </CardTitle>
          </div>
          {/* Week selector */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 mt-2 no-scrollbar">
            {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
              <button
                key={week}
                onClick={() => setSelectedWeek(week === activeWeek ? null : week)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  displayWeek === week
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                W{week}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          {popularity && popularity.length > 0 ? (
            [...popularity].sort((a, b) => gameTimeSortKey(a.gameTime) - gameTimeSortKey(b.gameTime)).map((pop) => {
              const userPickedTeam = picks?.find((p) => p.matchId === pop.matchId)?.selectedTeam;
              const userPickedAway = userPickedTeam === pop.awayTeam;
              const userPickedHome = userPickedTeam === pop.homeTeam;

              // Result indicators — look up from allMatches for accuracy
              const match = allMatches?.find((m) => m.id === pop.matchId);
              const isCompleted = match?.isCompleted ?? false;
              const matchWinner = match?.winner ?? null;
              const userCorrect = isCompleted && !!matchWinner && !!userPickedTeam && userPickedTeam === matchWinner;
              const userWrong = isCompleted && !!matchWinner && !!userPickedTeam && userPickedTeam !== matchWinner;
              const liveGame = liveScores?.week === pop.week
                ? liveScores.games.find((game) =>
                    normalizeScoreboardTeam(game.awayTeam) === pop.awayTeam &&
                    normalizeScoreboardTeam(game.homeTeam) === pop.homeTeam
                  )
                : undefined;
              const hasLiveScore = !!liveGame && (
                liveGame.completed ||
                liveGame.period > 0 ||
                liveGame.status !== "STATUS_SCHEDULED"
              );
              const myPickBadgeClass = userCorrect
                ? "bg-green-500/20 text-green-600 dark:text-green-400"
                : userWrong
                ? "bg-destructive/20 text-destructive"
                : "bg-primary/20 text-primary";
              const splitColors = getTeamSplitColors(pop.awayTeam, pop.homeTeam);

              return (
                <div
                  key={pop.matchId}
                  className={`rounded-xl border-2 p-3 space-y-2 relative ${
                    userCorrect
                      ? "border-green-500 bg-green-500/5"
                      : userWrong
                      ? "border-destructive/50 bg-destructive/5"
                      : userPickedTeam
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  {/* Result badge */}
                  {userCorrect && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-[9px] text-white font-bold leading-none">✓</div>
                  )}
                  {userWrong && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-destructive rounded-full flex items-center justify-center text-[9px] text-white font-bold leading-none">✗</div>
                  )}

                  {pop.gameTime && (
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {pop.gameTime}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${userPickedAway ? "font-bold text-primary" : ""}`}>
                      <TeamLogo team={pop.awayTeam} size={20} />
                      <span className="text-sm truncate">{pop.awayTeam}</span>
                      {hasLiveScore && liveGame && (
                        <span className="text-sm font-bold text-foreground">{liveGame.awayScore}</span>
                      )}
                      {userPickedAway && (
                        <span className={`text-[10px] ${myPickBadgeClass} px-1.5 py-0.5 rounded-full font-semibold shrink-0`}>✓ my pick</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">@</span>
                    <div className={`flex items-center gap-1.5 flex-1 min-w-0 justify-end ${userPickedHome ? "font-bold text-primary" : ""}`}>
                      {userPickedHome && (
                        <span className={`text-[10px] ${myPickBadgeClass} px-1.5 py-0.5 rounded-full font-semibold shrink-0`}>✓ my pick</span>
                      )}
                      {hasLiveScore && liveGame && (
                        <span className="text-sm font-bold text-foreground">{liveGame.homeScore}</span>
                      )}
                      <span className="text-sm truncate text-right">{pop.homeTeam}</span>
                      <TeamLogo team={pop.homeTeam} size={20} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <PickerAvatars
                      names={pop.awayPickerNames}
                      colorMap={userColorMap}
                      onClick={() => setSelectedPickers({ team: pop.awayTeam, names: pop.awayPickerNames })}
                    />
                    <PickerAvatars
                      names={pop.homePickerNames}
                      colorMap={userColorMap}
                      onClick={() => setSelectedPickers({ team: pop.homeTeam, names: pop.homePickerNames })}
                    />
                  </div>

                  {(pop.awayPickCount + pop.homePickCount) > 0 ? (
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden flex">
                      {pop.awayPickCount > 0 && (
                        <div
                          className="h-full rounded-l-full"
                          style={{ width: `${pop.awayPickPct}%`, backgroundColor: splitColors.away }}
                        />
                      )}
                      {pop.homePickCount > 0 && (
                        <div
                          className="h-full rounded-r-full"
                          style={{ width: `${pop.homePickPct}%`, backgroundColor: splitColors.home }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="h-2 w-full bg-secondary rounded-full" />
                  )}

                  <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                    <span>{pop.awayPickPct}%</span>
                    <span>{pop.homePickPct}%</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No picks made for Week {displayWeek} yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={selectedPickers !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPickers(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selectedPickers?.team} pickers</DialogTitle>
            <DialogDescription>
              {selectedPickers?.names.length ?? 0} player{selectedPickers?.names.length === 1 ? "" : "s"} picked this team.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {selectedPickers?.names.map((name, index) => (
              <div key={`${name}-${index}`} className="flex items-center gap-3 rounded-lg bg-secondary/60 px-3 py-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: userColorMap[name] ?? "#888888" }}
                >
                  {getInitials(name)}
                </div>
                <span className="text-sm font-medium">{name}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
