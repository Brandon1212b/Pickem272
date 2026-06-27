import React, { useState, useEffect, useCallback } from "react";
import {
  useListMatches,
  useGetSeasonStatus,
  useSetMatchResult,
  useUpdateSeasonMode,
  useSendWebhookNotification,
  useListUsers,
  getListMatchesQueryKey,
  getGetSeasonStatusQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { AlertTriangle, RefreshCw, Tv, Trash2, RotateCcw, Users } from "lucide-react";
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

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookMsg, setWebhookMsg] = useState("");
  const [userToDelete, setUserToDelete] = useState<{ id: number; name: string } | null>(null);
  const [weekToReset, setWeekToReset] = useState<number | null>(null);
  const [resettingWeek, setResettingWeek] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  // ESPN live scores state (fetched directly from ESPN, auto-refreshed)
  const [espnGames, setEspnGames] = useState<EspnGame[]>([]);
  const [espnWeek, setEspnWeek] = useState<number | null>(null);
  const [espnLoading, setEspnLoading] = useState(false);
  const [espnError, setEspnError] = useState<string | null>(null);
  const [espnLastFetched, setEspnLastFetched] = useState<Date | null>(null);

  const loadEspnScores = useCallback(async () => {
    setEspnLoading(true);
    setEspnError(null);
    try {
      const result = await fetchEspnScores();
      setEspnGames(result.games);
      setEspnWeek(result.week);
      setEspnLastFetched(new Date());
    } catch (e) {
      setEspnError(String(e));
    } finally {
      setEspnLoading(false);
    }
  }, []);

  // Auto-fetch on mount, then every 60 seconds
  useEffect(() => {
    loadEspnScores();
    const id = setInterval(loadEspnScores, 60_000);
    return () => clearInterval(id);
  }, [loadEspnScores]);

  const updateSeasonMode = useUpdateSeasonMode({
    mutation: {
      onSuccess: () => {
        toast.success("Season mode updated");
        queryClient.invalidateQueries({ queryKey: getGetSeasonStatusQueryKey() });
      },
    },
  });

  const setMatchResult = useSetMatchResult({
    mutation: {
      onSuccess: () => {
        toast.success("Match result set!");
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      },
      onError: () => toast.error("Failed to set result"),
    },
  });

  const sendWebhook = useSendWebhookNotification({
    mutation: {
      onSuccess: () => {
        toast.success("Notification sent!");
        setWebhookMsg("");
      },
      onError: () => toast.error("Failed to send notification"),
    },
  });

  const handleModeToggle = (checked: boolean) => {
    updateSeasonMode.mutate({ data: { mode: checked ? "in-season" : "pre-season" } });
  };

  const handleSetWinner = (matchId: number, winner: string) => {
    if (!winner) return;
    setMatchResult.mutate({ matchId, data: { winner } });
  };

  const handleSendWebhook = () => {
    if (!webhookUrl || !webhookMsg) return;
    sendWebhook.mutate({ data: { webhookUrl, message: webhookMsg } });
  };

  const handleResetWeek = async () => {
    if (weekToReset === null) return;
    setResettingWeek(true);
    try {
      const res = await fetch(`/api/admin/weeks/${weekToReset}/results`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Week ${weekToReset} results cleared`);
      queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
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

      {/* Live NFL Scores widget */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tv className="w-5 h-5" />
                Live NFL Scores
                {espnWeek && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">— Week {espnWeek}</span>
                )}
              </CardTitle>
              <CardDescription>
                Auto-refreshes every 60s via ESPN.
                {espnLastFetched && (
                  <span className="ml-1">
                    Last updated {espnLastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.
                  </span>
                )}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadEspnScores} disabled={espnLoading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${espnLoading ? "animate-spin" : ""}`} />
              {espnLoading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {espnError && (
            <div className="text-destructive text-sm bg-destructive/10 rounded-lg p-3">
              Could not load ESPN scores: {espnError}
            </div>
          )}
          {!espnError && espnGames.length === 0 && !espnLoading && (
            <p className="text-muted-foreground text-sm text-center py-4">
              No games currently on ESPN scoreboard (off-season or no games today).
            </p>
          )}
          {espnGames.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {espnGames.map((game, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 border rounded-xl bg-card text-sm">
                  <div className="flex items-center gap-2">
                    <TeamLogo team={game.awayTeam} size={18} />
                    <span className={`font-semibold ${game.winner === game.awayTeam ? "text-green-400" : ""}`}>
                      {game.awayTeam}
                    </span>
                    <span className="text-lg font-bold tabular-nums">{game.awayScore}</span>
                    <span className="text-muted-foreground text-xs">–</span>
                    <span className="text-lg font-bold tabular-nums">{game.homeScore}</span>
                    <span className={`font-semibold ${game.winner === game.homeTeam ? "text-green-400" : ""}`}>
                      {game.homeTeam}
                    </span>
                    <TeamLogo team={game.homeTeam} size={18} />
                  </div>
                  <Badge
                    variant={game.completed ? "secondary" : "outline"}
                    className={`text-[10px] shrink-0 ml-1 ${!game.completed && game.status.startsWith("Q") ? "bg-green-500/15 text-green-400 border-green-500/30" : ""}`}
                  >
                    {game.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Season Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Season Settings</CardTitle>
          <CardDescription>Control the global state of the league.</CardDescription>
        </CardHeader>
        <CardContent>
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
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 border rounded-xl bg-card">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: u.avatar ?? "#007AFF" }}
                    >
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-medium">{u.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setUserToDelete({ id: u.id, name: u.name })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">No users yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Blast Notification */}
      <Card>
        <CardHeader>
          <CardTitle>Blast Notification</CardTitle>
          <CardDescription>Send a webhook message to Discord/Slack.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={webhookMsg}
              onChange={(e) => setWebhookMsg(e.target.value)}
              placeholder="Don't forget to set your picks!"
            />
          </div>
          <Button onClick={handleSendWebhook} disabled={!webhookUrl || !webhookMsg || sendWebhook.isPending}>
            Blast Notification
          </Button>
        </CardContent>
      </Card>

      {/* Match Results */}
      <Card>
        <CardHeader>
          <CardTitle>Match Results</CardTitle>
          <CardDescription>
            Click a team button to set them as the winner. Live scores (if available) are shown inline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="space-y-2">
            {matchesByWeek &&
              Object.entries(matchesByWeek).map(([week, weekMatches]) => (
                <AccordionItem key={week} value={week} className="border rounded-xl px-2">
                  <AccordionTrigger className="px-2 hover:no-underline font-semibold">
                    Week {week}
                    <span className="ml-auto mr-3 text-xs text-muted-foreground font-normal">
                      {weekMatches.filter((m) => m.isCompleted).length}/{weekMatches.length} done
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 p-2">
                    {/* Reset week button */}
                    {weekMatches.some((m) => m.isCompleted) && (
                      <div className="flex justify-end mb-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive gap-1.5"
                          onClick={() => setWeekToReset(parseInt(week))}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset Week {week} Results
                        </Button>
                      </div>
                    )}

                    {weekMatches.map((match) => {
                      const live = findLiveGame(espnGames, match.awayTeam, match.homeTeam);
                      const hasLive = live !== null;
                      const awayWon = match.winner === match.awayTeam;
                      const homeWon = match.winner === match.homeTeam;

                      return (
                        <div key={match.id} className="p-3 border rounded-xl bg-card space-y-2">
                          {/* Game time + live status */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {match.gameTime && <span>{match.gameTime}</span>}
                            {hasLive && (
                              <Badge
                                variant={live.completed ? "secondary" : "outline"}
                                className={`text-[10px] ${live.status.startsWith("Q") ? "bg-green-500/15 text-green-400 border-green-500/30" : ""}`}
                              >
                                {live.status}
                              </Badge>
                            )}
                            {match.isCompleted && !hasLive && (
                              <Badge variant="secondary" className="text-[10px]">Final</Badge>
                            )}
                          </div>

                          {/* Away and Home team winner buttons */}
                          <div className="grid grid-cols-2 gap-2">
                            {/* Away team */}
                            <button
                              onClick={() => !match.isCompleted && handleSetWinner(match.id, match.awayTeam)}
                              disabled={match.isCompleted}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold
                                ${awayWon
                                  ? "border-green-500 bg-green-500/15 text-green-400"
                                  : match.isCompleted
                                  ? "border-border/40 bg-secondary/20 text-muted-foreground opacity-50 cursor-not-allowed"
                                  : "border-border bg-secondary/30 hover:border-primary/60 hover:bg-primary/10 cursor-pointer"
                                }`}
                            >
                              <TeamLogo team={match.awayTeam} size={20} className="shrink-0" />
                              <span className="truncate">{match.awayTeam}</span>
                              {hasLive && (
                                <span className="ml-auto text-base font-bold tabular-nums shrink-0">
                                  {live.awayScore}
                                </span>
                              )}
                              {awayWon && <span className="ml-auto text-green-400 shrink-0">✓</span>}
                            </button>

                            {/* Home team */}
                            <button
                              onClick={() => !match.isCompleted && handleSetWinner(match.id, match.homeTeam)}
                              disabled={match.isCompleted}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold
                                ${homeWon
                                  ? "border-green-500 bg-green-500/15 text-green-400"
                                  : match.isCompleted
                                  ? "border-border/40 bg-secondary/20 text-muted-foreground opacity-50 cursor-not-allowed"
                                  : "border-border bg-secondary/30 hover:border-primary/60 hover:bg-primary/10 cursor-pointer"
                                }`}
                            >
                              <TeamLogo team={match.homeTeam} size={20} className="shrink-0" />
                              <span className="truncate">{match.homeTeam}</span>
                              {hasLive && (
                                <span className="ml-auto text-base font-bold tabular-nums shrink-0">
                                  {live.homeScore}
                                </span>
                              )}
                              {homeWon && <span className="ml-auto text-green-400 shrink-0">✓</span>}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </AccordionContent>
                </AccordionItem>
              ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Delete user confirmation */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {userToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{userToDelete?.name}</strong> and all their picks from the league.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteUser}
              disabled={deletingUser}
            >
              {deletingUser ? "Deleting…" : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset week confirmation */}
      <AlertDialog open={weekToReset !== null} onOpenChange={(open) => !open && setWeekToReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Week {weekToReset} results?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears all winners and points for Week {weekToReset}. All pick scores for that week will be set to 0.
              You'll need to re-enter the results. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleResetWeek}
              disabled={resettingWeek}
            >
              {resettingWeek ? "Resetting…" : "Yes, reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
