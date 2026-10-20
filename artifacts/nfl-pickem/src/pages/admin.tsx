import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  useListMatches,
  useGetSeasonStatus,
  useSetMatchResult,
  useUpdateSeasonMode,
  useListUsers,
  useSetWeekStoryline,
  getListMatchesQueryKey,
  getGetLeaderboardQueryKey,
  getGetLeaderboardTrendsQueryKey,
  getGetWeeklyExtremesQueryKey,
  getGetSeasonStatusQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Tv, Trash2, RotateCcw, Users, Newspaper } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { TeamLogo } from "@/lib/team-logos";

// ── ESPN live score types ─────────────────────────────────────────────────────

interface EspnGame {
  awayTeam: string;    // our abbreviation
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  status: string;      // "Final", "Q2 4:32", "Scheduled", etc.
  completed: boolean;
  winner: string | null; // our abbreviation of winner, or null
}

// Normalize ESPN abbreviations to our internal codes
function normalizeEspn(abbr: string): string {
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
  return map[abbr] ?? abbr;
}

async function fetchEspnScores(): Promise<{ week: number | null; games: EspnGame[] }> {
  const res = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();

  const week: number | null = data?.week?.number ?? null;
  const games: EspnGame[] = (data?.events ?? []).map((event: any) => {
    const comp = event.competitions?.[0];
    const competitors: any[] = comp?.competitors ?? [];
    const away = competitors.find((c: any) => c.homeAway === "away");
    const home = competitors.find((c: any) => c.homeAway === "home");
    const statusType = comp?.status?.type ?? {};
    const completed: boolean = statusType.completed ?? false;
    const period: number = comp?.status?.period ?? 0;
    const clock: string = comp?.status?.displayClock ?? "";

    let statusLabel: string;
    if (completed) {
      statusLabel = "Final";
    } else if (period > 0) {
       statusLabel = `Q${period} ${clock}`;
    } else {
      statusLabel = statusType.shortDetail ?? statusType.description ?? "—";
    }

    const awayAbbr = normalizeEspn(away?.team?.abbreviation ?? "");
    const homeAbbr = normalizeEspn(home?.team?.abbreviation ?? "");
    const awayScore = parseInt(away?.score ?? "0", 10);
    const homeScore = parseInt(home?.score ?? "0", 10);

    let winner: string | null = null;
    if (completed) {
      winner = awayScore > homeScore ? awayAbbr : homeScore > awayScore ? homeAbbr : null;
    }

    return { awayTeam: awayAbbr, homeTeam: homeAbbr, awayScore, homeScore, status: statusLabel, completed, winner };
  });

  return { week, games };
}

// Look up ESPN live game for a given match
function findLiveGame(games: EspnGame[], awayTeam: string, homeTeam: string): EspnGame | null {
  return games.find((g) => g.awayTeam === awayTeam && g.homeTeam === homeTeam) ?? null;
}

// ── Admin component ───────────────────────────────────────────────────────────

export default function Admin() {
  const queryClient = useQueryClient();

  const { data: status, isLoading: loadingStatus } = useGetSeasonStatus();
  const { data: matches, isLoading: loadingMatches } = useListMatches();
  const { data: users, isLoading: loadingUsers } = useListUsers();

  const invalidateResultQueries = () => {
    const queryKeys = [
      getListMatchesQueryKey(),
      getGetLeaderboardQueryKey(),
      getGetLeaderboardTrendsQueryKey(),
      getGetWeeklyExtremesQueryKey(),
      getGetSeasonStatusQueryKey(),
      ["pick-popularity"],
      ["weekly-recap"],
      ["season-recap"],
    ];
    for (const queryKey of queryKeys) {
      void queryClient.invalidateQueries({ queryKey });
    }
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const firstKey = query.queryKey[0];
        return typeof firstKey === "string" && firstKey.startsWith("/api/picks/user/");
      },
    });
  };

  const [userToDelete, setUserToDelete] = useState<{ id: number; name: string } | null>(null);
  const [weekToReset, setWeekToReset] = useState<number | null>(null);
  const [resettingWeek, setResettingWeek] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [syncingSpreads, setSyncingSpreads] = useState(false);

  // Storyline editor state
  const [storylineWeek, setStorylineWeek] = useState<number>(1);
  const [storylineText, setStorylineText] = useState("");
  const [storylineSaving, setStorylineSaving] = useState(false);

  const setWeekStoryline = useSetWeekStoryline({
    mutation: {
      onSuccess: () => {
        toast.success(`Week ${storylineWeek} storyline saved`);
        setStorylineSaving(false);
      },
      onError: () => {
        toast.error("Failed to save storyline");
        setStorylineSaving(false);
      },
    },
  });

  const handleSaveStoryline = async () => {
    if (!storylineText.trim()) return;
    setStorylineSaving(true);
    setWeekStoryline.mutate({ week: storylineWeek, data: { text: storylineText.trim() } });
  };

  // Load existing storyline when week changes
  useEffect(() => {
    setStorylineText("");
    fetch(`/api/leaderboard/weekly-recap?week=${storylineWeek}`)
      .then((r) => r.json())
      .then((data: { storyline?: string | null }) => {
        if (data.storyline) setStorylineText(data.storyline);
      })
      .catch(() => { /* ignore */ });
  }, [storylineWeek]);

  const handleSeedMatches = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/seed-matches", { method: "POST" });
      const data = await res.json();
      if (data.seeded) {
        toast.success(data.message);
        queryClient.invalidateQueries();
      } else {
        toast.info(data.message);
      }
    } catch {
      toast.error("Failed to seed match data");
    } finally {
      setSeeding(false);
    }
  };

  const handleSyncSpreads = async () => {
    setSyncingSpreads(true);
    try {
      const res = await fetch("/api/admin/sync-spreads", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as {
        updated: number;
        noOdds: string[];
        unmatched: string[];
        errors: string[];
      };
      queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      if (data.errors.length > 0) {
        toast.error(`Spread refresh completed with ${data.errors.length} week error${data.errors.length === 1 ? "" : "s"}`);
      } else if (data.updated > 0) {
        toast.success(`Updated ${data.updated} live spread${data.updated === 1 ? "" : "s"}`);
      } else if (data.noOdds.length > 0) {
        toast.info(`No spread changes. ${data.noOdds.length} game${data.noOdds.length === 1 ? "" : "s"} do not have odds yet.`);
      } else {
        toast.success("Spreads are already up to date");
      }
    } catch {
      toast.error("Failed to refresh spreads from ESPN");
    } finally {
      setSyncingSpreads(false);
    }
  };

  // ESPN live scores state (fetched directly from ESPN, auto-refreshed)
  const [espnGames, setEspnGames] = useState<EspnGame[]>([]);
  const [espnWeek, setEspnWeek] = useState<number | null>(null);
  const [espnLoading, setEspnLoading] = useState(false);
  const [espnError, setEspnError] = useState<string | null>(null);
  const [espnLastFetched, setEspnLastFetched] = useState<Date | null>(null);
  const autoResultIds = useRef<Set<number>>(new Set());

  // Last pick update timestamps per user
  const [lastPicks, setLastPicks] = useState<Record<number, string>>({});

  const setMatchResult = useSetMatchResult({
    mutation: {
      onSuccess: () => {
        invalidateResultQueries();
      },
    },
  });

  const handleSetWinner = (matchId: number, winner: string) => {
    if (!winner) return;
    setMatchResult.mutate(
      { matchId, data: { winner } },
      {
        onSuccess: () => toast.success("Match result set!"),
        onError: () => toast.error("Failed to set result"),
      },
    );
  };

  const loadEspnScores = useCallback(async () => {
    setEspnLoading(true);
    setEspnError(null);
    try {
      const result = await fetchEspnScores();
      setEspnGames(result.games);
      setEspnWeek(result.week);
      setEspnLastFetched(new Date());

      const automaticResults = (matches ?? [])
        .filter((match) => !match.isCompleted)
        .map((match) => {
          const live = findLiveGame(result.games, match.awayTeam, match.homeTeam);
          if (!live?.completed) return null;
          // Record ties (no winner) as the "TIE" sentinel so the match is marked completed
          const winner = live.winner ?? "TIE";
          return { matchId: match.id, winner };
        })
        .filter((result): result is { matchId: number; winner: string } => result !== null)
        .filter((result) => !autoResultIds.current.has(result.matchId));

      if (automaticResults.length > 0) {
        const recorded = await Promise.all(
          automaticResults.map(async ({ matchId, winner }) => {
            autoResultIds.current.add(matchId);
            try {
              await setMatchResult.mutateAsync({ matchId, data: { winner } });
              return true;
            } catch {
              autoResultIds.current.delete(matchId);
              return false;
            }
          }),
        );
        const recordedCount = recorded.filter(Boolean).length;
        if (recordedCount > 0) {
          toast.success(
            `Automatically recorded ${recordedCount} final result${recordedCount === 1 ? "" : "s"}.`,
          );
        }
      }
    } catch (e) {
      setEspnError(String(e));
    } finally {
      setEspnLoading(false);
    }
  }, [matches, setMatchResult]);

  // Auto-fetch on mount, then every 60 seconds
  useEffect(() => {
    loadEspnScores();
    const id = setInterval(loadEspnScores, 60_000);
    return () => clearInterval(id);
  }, [loadEspnScores]);

  // Fetch last pick update timestamps per user
  useEffect(() => {
    fetch("/api/admin/users/last-pick-updates")
      .then((r) => r.json())
      .then((data: { userId: number; lastUpdated: string }[]) => {
        const map: Record<number, string> = {};
        for (const row of data) map[row.userId] = row.lastUpdated;
        setLastPicks(map);
      })
      .catch(() => {
        /* silently ignore — admin convenience feature */
      });
  }, []);

  const updateSeasonMode = useUpdateSeasonMode({
    mutation: {
      onSuccess: () => {
        toast.success("Season mode updated");
        queryClient.invalidateQueries({ queryKey: getGetSeasonStatusQueryKey() });
      },
    },
  });

  const handleModeToggle = (checked: boolean) => {
    updateSeasonMode.mutate({ data: { mode: checked ? "in-season" : "pre-season" } });
  };


  const handleResetWeek = async () => {
    if (weekToReset === null) return;
    setResettingWeek(true);
    try {
      const res = await fetch(`/api/admin/weeks/${weekToReset}/results`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Week ${weekToReset} results cleared`);
      invalidateResultQueries();
      setWeekToReset(null);
    } catch {
      toast.error("Failed to reset week results");
    } finally {
      setResettingWeek(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    try {
      const res = await fetch(`/api/users/${userToDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success(`${userToDelete.name} removed`);
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setUserToDelete(null);
    } catch {
      toast.error("Failed to delete user");
    } finally {
      setDeletingUser(false);
    }
  };

  if (loadingStatus || loadingMatches) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const matchesByWeek = matches?.reduce(
    (acc, m) => {
      if (!acc[m.week]) acc[m.week] = [];
      acc[m.week].push(m);
      return acc;
    },
    {} as Record<number, typeof matches>
  );

  return (
    <div className="space-y-6">
      {/* Commissioner banner */}
      <div className="bg-destructive/10 border-destructive/20 border text-destructive p-4 rounded-xl flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 shrink-0" />
        <div>
          <h2 className="font-bold">Commissioner Access Only</h2>
          <p className="text-sm opacity-80">Actions taken here affect all users in the league.</p>
        </div>
      </div>
      {/* Season Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Season Settings</CardTitle>
          <CardDescription>Control the global state of the league.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-4 border rounded-xl bg-secondary/30">
            <div>
              <Label className="text-base font-semibold">In-Season Mode</Label>
              <p className="text-sm text-muted-foreground">Locks all picks and begins live scoring</p>
            </div>
            <Switch
              checked={status?.mode === "in-season"}
              onCheckedChange={handleModeToggle}
              disabled={updateSeasonMode.isPending}
            />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-xl bg-secondary/30">
            <div>
              <Label className="text-base font-semibold">Seed Match Data</Label>
              <p className="text-sm text-muted-foreground">Insert all 272 games into the database (only runs if empty)</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleSeedMatches} disabled={seeding}>
              {seeding ? "Seeding…" : "Seed Matches"}
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-xl bg-secondary/30">
            <div>
              <Label className="text-base font-semibold">Refresh Live Spreads</Label>
              <p className="text-sm text-muted-foreground">Pull the latest sportsbook lines from ESPN for all weeks</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleSyncSpreads} disabled={syncingSpreads}>
              {syncingSpreads ? "Refreshing…" : "Refresh Spreads"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Storyline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="w-5 h-5" />
            Weekly Storyline
          </CardTitle>
          <CardDescription>Write a short summary for the selected week — shown at the top of the League Recap page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
              <button
                key={week}
                onClick={() => setStorylineWeek(week)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  storylineWeek === week
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                W{week}
              </button>
            ))}
          </div>
          <Textarea
            value={storylineText}
            onChange={(e) => setStorylineText(e.target.value)}
            placeholder={`Write a storyline for Week ${storylineWeek}… e.g. "The Ravens came in as heavy favorites but it was the underdog Browns who stunned the league…"`}
            rows={5}
            maxLength={2000}
            className="resize-none text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{storylineText.length}/2000 characters</span>
            <Button
              size="sm"
              onClick={handleSaveStoryline}
              disabled={!storylineText.trim() || storylineSaving}
            >
              {storylineSaving ? "Saving…" : `Save Week ${storylineWeek} Storyline`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            User Management
          </CardTitle>
          <CardDescription>Remove players from the league. This deletes all their picks too.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : users && users.length > 0 ? (
            <div className="space-y-2">
              {users.map((u) => {
                const last = lastPicks[u.id];
                const lastLabel = last
                  ? new Date(last).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                  : "No picks";
                return (
                  <div key={u.id} className="flex items-center justify-between p-3 border rounded-xl bg-secondary/20">
                    <div>
                      <p className="font-semibold text-sm">{u.name}</p>
                      <p className="text-xs text-muted-foreground">Last pick: {lastLabel}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setUserToDelete({ id: u.id, name: u.name })}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No users yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Live Scores / Match Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv className="w-5 h-5" />
            Live Scores & Results
          </CardTitle>
          <CardDescription>
            ESPN scores refresh automatically. Final games are recorded for you (including ties as TIE).
            {espnLastFetched && <span className="block text-xs mt-1">Last refreshed {espnLastFetched.toLocaleTimeString()}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {espnError && <p className="text-sm text-destructive mb-3">{espnError}</p>}
          {espnLoading && espnGames.length === 0 ? (
            <Skeleton className="h-40 w-full" />
          ) : matchesByWeek ? (
            <Accordion type="multiple" className="space-y-2">
              {Object.entries(matchesByWeek).map(([week, weekMatches]) => (
                <AccordionItem key={week} value={week} className="border rounded-xl px-3">
                  <AccordionTrigger className="text-sm font-semibold">
                    Week {week}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {weekMatches?.filter(m => m.isCompleted).length ?? 0}/{weekMatches?.length ?? 0} done
                    </Badge>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-3">
                    {weekMatches?.map((match) => {
                      const live = findLiveGame(espnGames, match.awayTeam, match.homeTeam);
                      const awayWon = match.isCompleted && match.winner === match.awayTeam;
                      const homeWon = match.isCompleted && match.winner === match.homeTeam;
                      const isTie = match.isCompleted && !match.winner;
                      return (
                        <div key={match.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 text-sm">
                          <button
                            onClick={() => handleSetWinner(match.id, match.awayTeam)}
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border-2 transition-all font-semibold flex-1 min-w-0
                              ${awayWon
                                ? "border-green-500 bg-green-500/15 text-green-400"
                                : match.isCompleted
                                ? "border-border/40 bg-secondary/20 text-muted-foreground opacity-50"
                                : "border-border bg-secondary/30 hover:border-primary/60 hover:bg-primary/10 cursor-pointer"
                              }`}
                          >
                            <TeamLogo team={match.awayTeam} size={18} className="shrink-0" />
                            <span className="truncate text-xs">{match.awayTeam}</span>
                            {live && <span className="text-xs opacity-70">{live.awayScore}</span>}
                          </button>
                          <div className="flex flex-col items-center shrink-0 min-w-[60px]">
                            {isTie && <Badge variant="secondary" className="text-[10px]">TIE</Badge>}
                            {live && <span className="text-[10px] text-muted-foreground">{live.status}</span>}
                            {!match.isCompleted && live?.completed && !live.winner && (
                              <button
                                onClick={() => handleSetWinner(match.id, "TIE")}
                                className="text-[10px] text-primary underline mt-0.5"
                              >
                                Mark tie
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => handleSetWinner(match.id, match.homeTeam)}
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border-2 transition-all font-semibold flex-1 min-w-0 justify-end
                              ${homeWon
                                ? "border-green-500 bg-green-500/15 text-green-400"
                                : match.isCompleted
                                ? "border-border/40 bg-secondary/20 text-muted-foreground opacity-50"
                                : "border-border bg-secondary/30 hover:border-primary/60 hover:bg-primary/10 cursor-pointer"
                              }`}
                          >
                            {live && <span className="text-xs opacity-70">{live.homeScore}</span>}
                            <span className="truncate text-xs">{match.homeTeam}</span>
                            <TeamLogo team={match.homeTeam} size={18} className="shrink-0" />
                          </button>
                        </div>
                      );
                    })}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setWeekToReset(Number(week))}>
                      <RotateCcw className="w-3 h-3 mr-1" /> Reset week {week}
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : null}
        </CardContent>
      </Card>

      {/* Reset week dialog */}
      <AlertDialog open={weekToReset !== null} onOpenChange={() => setWeekToReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Week {weekToReset} results?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears all winners and points for the week. The week will no longer count as completed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetWeek} disabled={resettingWeek}>
              {resettingWeek ? "Resetting…" : "Yes, reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete user dialog */}
      <AlertDialog open={userToDelete !== null} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {userToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the user and all of their picks. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deletingUser} className="bg-destructive text-destructive-foreground">
              {deletingUser ? "Removing…" : "Yes, remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
