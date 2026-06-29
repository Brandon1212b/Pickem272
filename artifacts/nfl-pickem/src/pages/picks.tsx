import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth";
import {
  useListMatches,
  useGetUserPicks,
  useGetSeasonStatus,
  useSavePicks,
  useAutofillPicks,
  getGetUserPicksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Save, Shuffle, Wand2, Star, RotateCcw, CheckCircle2, Pencil, Plane, Clock, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/lib/team-logos";
import { getTeamColor } from "@/lib/team-colors";

type AutofillMode = "home" | "away" | "favorites" | "random";

const AUTOFILL_OPTIONS: { mode: AutofillMode; label: string; icon: React.ElementType; description: string }[] = [
  { mode: "home", label: "Home Teams", icon: Wand2, description: "Pick the home team for every unpicked game." },
  { mode: "away", label: "Away Teams", icon: Plane, description: "Pick the away team for every unpicked game." },
  { mode: "favorites", label: "Favorites", icon: Star, description: "Pick the Vegas spread favorite for every unpicked game." },
  { mode: "random", label: "Random", icon: Shuffle, description: "Randomly pick a winner for every unpicked game." },
];

// Sept 3, 2026 8:20 PM ET — estimated NFL 2026 season opener
const PICKS_LOCK_DATE = new Date("2026-09-04T00:20:00.000Z");

const NFL_STRUCTURE = [
  { conf: "AFC", divisions: [
    { div: "East",  teams: ["BUF", "MIA", "NE",  "NYJ"] },
    { div: "North", teams: ["BAL", "CIN", "CLE", "PIT"] },
    { div: "South", teams: ["HOU", "IND", "JAX", "TEN"] },
    { div: "West",  teams: ["DEN", "KC",  "LAC", "LV"]  },
  ]},
  { conf: "NFC", divisions: [
    { div: "East",  teams: ["DAL", "NYG", "PHI", "WAS"] },
    { div: "North", teams: ["CHI", "DET", "GB",  "MIN"] },
    { div: "South", teams: ["ATL", "CAR", "NO",  "TB"]  },
    { div: "West",  teams: ["ARI", "LAR", "SF",  "SEA"] },
  ]},
];

const ALL_TEAMS = NFL_STRUCTURE.flatMap((c) => c.divisions.flatMap((d) => d.teams));

function useCountdown(target: Date) {
  const calc = () => {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return null;
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  };
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(id);
  }, []);
  return left;
}

function getTeamSpread(pointSpread: string | null | undefined, team: "home" | "away"): string {
  if (!pointSpread || pointSpread === "") return "*";
  if (pointSpread === "PK") return "PK";
  const num = parseFloat(pointSpread);
  if (isNaN(num) || num === 0) return "PK";
  const val = team === "home" ? num : -num;
  return val > 0 ? `+${val}` : `${val}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function Picks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: status, isLoading: loadingStatus } = useGetSeasonStatus();
  const { data: matches, isLoading: loadingMatches } = useListMatches();
  const { data: picks, isLoading: loadingPicks } = useGetUserPicks(user?.id || 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserPicksQueryKey(user?.id || 0) },
  });

  const [localPicks, setLocalPicks] = useState<Record<number, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingAutofill, setPendingAutofill] = useState<AutofillMode | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resettingPicks, setResettingPicks] = useState(false);
  const [showFutureWeeks, setShowFutureWeeks] = useState(false);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("all");
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>(["1"]);

  // Tutorial popup — shows on first visit to picks page
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem("picks_tutorial_seen"));

  // Lock state: show locked view when server has all picks AND user hasn't explicitly unlocked
  const picksUnlockedKey = `picks_unlocked_${user?.id}`;
  const [isUnlocked, setIsUnlocked] = useState(() =>
    localStorage.getItem(`picks_unlocked_${user?.id}`) === "true"
  );

  // Skip resetting hasUnsavedChanges after autofill refetch
  const skipHasUnsavedChangesReset = useRef(false);

  // Refs for reading inside callbacks
  const localPicksRef = useRef<Record<number, string>>({});
  const matchesLengthRef = useRef(0);
  useEffect(() => { localPicksRef.current = localPicks; }, [localPicks]);
  useEffect(() => { matchesLengthRef.current = matches?.length ?? 288; }, [matches]);

  // Load picks from server — skip resetting hasUnsavedChanges if autofill just ran
  useEffect(() => {
    if (!picks) return;
    const picksMap = picks.reduce((acc, p) => { acc[p.matchId] = p.selectedTeam; return acc; }, {} as Record<number, string>);
    setLocalPicks(picksMap);
    if (!skipHasUnsavedChangesReset.current) {
      setHasUnsavedChanges(false);
    }
    skipHasUnsavedChangesReset.current = false;
  }, [picks]);

  // Derived: show locked view when all picks are on server AND user hasn't unlocked AND no pending unsaved changes
  const totalMatches = matches?.length ?? 288;
  const allPicksOnServer = !loadingPicks && !loadingMatches && (picks?.length ?? 0) >= totalMatches && totalMatches > 0;
  const showLockedView = allPicksOnServer && !isUnlocked && !hasUnsavedChanges;

  const countdown = useCountdown(PICKS_LOCK_DATE);

  const savePicks = useSavePicks({
    mutation: {
      onSuccess: () => {
        toast.success("Picks saved!");
        setHasUnsavedChanges(false);
        queryClient.invalidateQueries({ queryKey: getGetUserPicksQueryKey(user?.id || 0) });
        // If all 288 submitted, clear the unlock flag so locked view shows
        const count = Object.values(localPicksRef.current).filter(Boolean).length;
        if (count >= matchesLengthRef.current && matchesLengthRef.current > 0) {
          localStorage.removeItem(picksUnlockedKey);
          setIsUnlocked(false);
        }
      },
      onError: () => toast.error("Failed to save picks"),
    },
  });

  const autofillPicks = useAutofillPicks({
    mutation: {
      onSuccess: (newPicks) => {
        toast.success(`Filled in ${newPicks.length} picks!`);
        // Set flag so the refetch doesn't reset hasUnsavedChanges
        skipHasUnsavedChangesReset.current = true;
        setLocalPicks((prev) => {
          const merged = { ...prev };
          for (const p of newPicks) merged[p.matchId] = p.selectedTeam;
          return merged;
        });
        setHasUnsavedChanges(true);
        // Refetch so allPicksOnServer updates correctly
        queryClient.invalidateQueries({ queryKey: getGetUserPicksQueryKey(user?.id || 0) });
      },
      onError: () => toast.error("Failed to autofill picks"),
    },
  });

  const handlePick = (matchId: number, team: string) => {
    if (status?.mode === "in-season") return;
    setLocalPicks((prev) => {
      if (prev[matchId] === team) return { ...prev, [matchId]: "" };
      return { ...prev, [matchId]: team };
    });
    setHasUnsavedChanges(true);
  };

  const handleReset = async () => {
    setShowResetConfirm(false);
    setResettingPicks(true);
    try {
      const res = await fetch(`/api/picks/user/${user!.id}/clear`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setLocalPicks({});
      setHasUnsavedChanges(false);
      localStorage.removeItem(picksUnlockedKey);
      setIsUnlocked(false);
      queryClient.invalidateQueries({ queryKey: getGetUserPicksQueryKey(user?.id || 0) });
      toast.success("All picks cleared");
    } catch {
      toast.error("Failed to reset picks");
    } finally {
      setResettingPicks(false);
    }
  };

  const handleUnlock = () => {
    localStorage.setItem(picksUnlockedKey, "true");
    setIsUnlocked(true);
  };

  const handleSave = () => {
    if (!user) return;
    const picksArray = Object.entries(localPicks)
      .filter(([, team]) => team)
      .map(([matchId, selectedTeam]) => ({ matchId: Number(matchId), selectedTeam, isLock: false }));
    savePicks.mutate({ data: { userId: user.id, picks: picksArray } });
  };

  const confirmAutofill = () => {
    if (!user || !pendingAutofill) return;
    autofillPicks.mutate({ data: { userId: user.id, mode: pendingAutofill } });
    setPendingAutofill(null);
  };

  const dismissTutorial = () => {
    localStorage.setItem("picks_tutorial_seen", "true");
    setShowTutorial(false);
  };

  type MatchList = NonNullable<typeof matches>;
  const matchesByWeek = useMemo(() => {
    if (!matches) return {} as Record<number, MatchList>;
    return matches.reduce((acc, m) => {
      if (!acc[m.week]) acc[m.week] = [];
      acc[m.week].push(m);
      return acc;
    }, {} as Record<number, MatchList>);
  }, [matches]);

  const teamCompletionStatus = useMemo(() => {
    if (!matches) return {} as Record<string, { total: number; picked: number; complete: boolean }>;
    const status: Record<string, { total: number; picked: number; complete: boolean }> = {};
    for (const team of ALL_TEAMS) {
      const teamMatches = matches.filter((m) => m.homeTeam === team || m.awayTeam === team);
      const picked = teamMatches.filter((m) => localPicks[m.id]).length;
      status[team] = {
        total: teamMatches.length,
        picked,
        complete: teamMatches.length > 0 && picked === teamMatches.length,
      };
    }
    return status;
  }, [matches, localPicks]);

  const filteredMatchesByWeek = useMemo(() => {
    if (selectedTeamFilter === "all") return matchesByWeek;
    return Object.fromEntries(
      Object.entries(matchesByWeek)
        .map(([week, weekMatches]) => [
          week,
          weekMatches.filter(
            (m) => m.homeTeam === selectedTeamFilter || m.awayTeam === selectedTeamFilter,
          ),
        ])
        .filter(([, weekMatches]) => weekMatches.length > 0),
    );
  }, [matchesByWeek, selectedTeamFilter]);

  useEffect(() => {
    if (selectedTeamFilter === "all") {
      setExpandedWeeks(["1"]);
    } else {
      setExpandedWeeks(Object.keys(filteredMatchesByWeek));
    }
  }, [selectedTeamFilter, filteredMatchesByWeek]);

  // Team records from picks (computed here for both views)
  const teamRecordsSorted = useMemo(() => {
    if (!matches || !picks) return [];
    const records: Record<string, { wins: number; losses: number }> = {};
    for (const match of matches) {
      const pick = picks.find((p) => p.matchId === match.id);
      if (!pick?.selectedTeam) continue;
      const pickedTeam = pick.selectedTeam;
      const otherTeam = pickedTeam === match.homeTeam ? match.awayTeam : match.homeTeam;
      if (!records[pickedTeam]) records[pickedTeam] = { wins: 0, losses: 0 };
      if (!records[otherTeam]) records[otherTeam] = { wins: 0, losses: 0 };
      records[pickedTeam].wins += 1;
      records[otherTeam].losses += 1;
    }
    return Object.entries(records)
      .map(([team, rec]) => ({ team, ...rec }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  }, [matches, picks]);

  if (loadingStatus || loadingMatches || loadingPicks) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalPicks = Object.values(localPicks).filter(Boolean).length;
  const serverPickCount = picks?.length ?? 0;
  const unpickedCount = totalMatches - totalPicks;
  const allPicked = totalPicks === totalMatches && totalMatches > 0;
  const pendingOption = AUTOFILL_OPTIONS.find((o) => o.mode === pendingAutofill);

  const activeWeek = (status?.lastCompletedWeek ?? 0) + 1;
  const allWeekEntries = Object.entries(filteredMatchesByWeek)
    .map(([wStr, wMatches]) => ({ week: Number(wStr), matches: wMatches }));
  const currentWeekEntry = allWeekEntries.find((w) => w.week === activeWeek);
  const pastWeekEntries = allWeekEntries.filter((w) => w.week < activeWeek).sort((a, b) => b.week - a.week);
  const futureWeekEntries = allWeekEntries.filter((w) => w.week > activeWeek).sort((a, b) => a.week - b.week);
  const teamFilterActive = selectedTeamFilter !== "all";

  const teamFilterControl = (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Browse by Team</p>
      <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter}>
        <SelectTrigger
          className={cn(
            teamFilterActive && teamCompletionStatus[selectedTeamFilter]?.complete
              && "border-green-500 ring-1 ring-green-500/40",
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {teamFilterActive && (
              <div
                className={cn(
                  "rounded shrink-0",
                  teamCompletionStatus[selectedTeamFilter]?.complete && "border-2 border-green-500 p-0.5",
                )}
              >
                <TeamLogo team={selectedTeamFilter} size={20} />
              </div>
            )}
            <span className="truncate font-medium">
              {teamFilterActive ? selectedTeamFilter : "All Teams"}
            </span>
            {teamFilterActive && teamCompletionStatus[selectedTeamFilter]?.complete && (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            )}
          </div>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="all">All Teams</SelectItem>
          {NFL_STRUCTURE.map(({ conf, divisions }) => (
            <SelectGroup key={conf}>
              <SelectLabel className="text-[10px] uppercase tracking-wider">{conf}</SelectLabel>
              {divisions.flatMap(({ teams }) =>
                teams.map((team) => {
                  const { complete, picked, total } = teamCompletionStatus[team] ?? { complete: false, picked: 0, total: 0 };
                  return (
                    <SelectItem
                      key={team}
                      value={team}
                      textValue={team}
                      className="pr-8 [&>span:first-child]:hidden"
                    >
                      <div className="flex items-center gap-2 w-full pr-2">
                        <div
                          className={cn(
                            "rounded shrink-0",
                            complete && "border-2 border-green-500 p-0.5",
                          )}
                        >
                          <TeamLogo team={team} size={20} />
                        </div>
                        <span className="font-medium">{team}</span>
                        {complete ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 ml-auto" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                            {picked}/{total}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                }),
              )}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {teamFilterActive && (
        <p className="text-xs text-muted-foreground px-1">
          {teamCompletionStatus[selectedTeamFilter]?.picked ?? 0} of{" "}
          {teamCompletionStatus[selectedTeamFilter]?.total ?? 0} games picked for{" "}
          {selectedTeamFilter}
        </p>
      )}
    </div>
  );

  // ── TUTORIAL DIALOG ───────────────────────────────────────────────────────────
  const TutorialDialog = (
    <AlertDialog open={showTutorial} onOpenChange={(open) => { if (!open) dismissTutorial(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>🏈 Before You Start Picking</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">You're picking the outright winner</strong> of each game — not against the spread. Whoever wins the game gives you the point, period.
              </p>
              <p>
                The numbers shown (like <span className="font-mono font-bold text-foreground">-3</span> or <span className="font-mono font-bold text-foreground">+7</span>) are early Vegas point spreads shown for <em>reference only</em>. They can help you gauge which team Vegas thinks is better — but your pick just needs to win the game outright.
              </p>
              <p>
                A <span className="font-mono font-bold text-foreground">*</span> means no odds data is available yet for that game — check back as the season gets closer!
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismissTutorial}>Got it, let's pick!</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ── WEEK CARD (for locked view) ───────────────────────────────────────────────
  const renderWeekCard = (weekNum: number, weekMatches: MatchList, isCurrent = false) => {
    const weekPicksData = weekMatches.map((m) => ({
      match: m,
      picked: localPicks[m.id] ?? picks?.find((p) => p.matchId === m.id)?.selectedTeam ?? "",
    }));
    const completedWithPick = weekPicksData.filter((p) => p.match.isCompleted && p.picked);
    const correct = completedWithPick.filter((p) => p.picked === p.match.winner).length;
    const wrong = completedWithPick.length - correct;

    return (
      <Card key={weekNum} className={isCurrent ? "border-primary/30 bg-primary/5" : undefined}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="font-bold text-base">
              Week {weekNum}
              {isCurrent && <span className="ml-2 text-[10px] text-primary font-semibold uppercase tracking-wider">Current</span>}
            </h3>
            {completedWithPick.length > 0 ? (
              <span className={`text-sm font-bold ${correct > wrong ? "text-green-500" : "text-destructive"}`}>
                {correct}-{wrong}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Pending</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {weekPicksData.map(({ match, picked }) => {
              if (!picked) {
                return (
                  <div key={match.id} className="w-10 h-10 rounded-xl border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">
                    ?
                  </div>
                );
              }
              const isCorrect = match.isCompleted && picked === match.winner;
              const isWrong = match.isCompleted && !!match.winner && picked !== match.winner;
              return (
                <div key={match.id} className="relative">
                  <div className={`rounded-xl border-2 p-1.5 ${
                    isCorrect ? "border-green-500 bg-green-500/10" :
                    isWrong   ? "border-destructive/40 bg-destructive/5 opacity-70" :
                                "border-border/50"
                  }`}>
                    <TeamLogo team={picked} size={28} />
                  </div>
                  {isCorrect && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold leading-none">✓</div>
                  )}
                  {isWrong && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive rounded-full flex items-center justify-center text-[8px] text-white font-bold leading-none">✗</div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── LOCKED / SUBMITTED VIEW ───────────────────────────────────────────────────
  if (showLockedView) {
    return (
      <div className="space-y-4 pb-8">
        {TutorialDialog}

        {/* Header */}
        <div className="sticky top-16 z-20 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b shadow-sm">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <div>
              <h1 className="text-xl font-bold tracking-tight">All Picks Submitted ✓</h1>
              <p className="text-sm text-muted-foreground">
                {serverPickCount} picks locked in across 18 weeks
              </p>
            </div>
            <div className="flex items-center gap-2">
              {countdown && status?.mode === "pre-season" && (
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 rounded-full px-3 py-1.5">
                  <Clock className="w-3 h-3" />
                  <span>
                    Locks in <strong className="text-foreground">{countdown.days}d {countdown.hours}h {countdown.minutes}m</strong>
                  </span>
                </div>
              )}
              {status?.mode === "pre-season" && (
                <Button variant="outline" size="sm" onClick={handleUnlock} className="gap-1.5">
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Picks
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Countdown (mobile) */}
        {countdown && status?.mode === "pre-season" && (
          <div className="sm:hidden flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-xl px-4 py-2.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Locks in <strong className="text-foreground">{countdown.days}d {countdown.hours}h {countdown.minutes}m {countdown.seconds}s</strong></span>
          </div>
        )}

        {teamFilterControl}

        {/* Current week */}
        {currentWeekEntry && renderWeekCard(currentWeekEntry.week, currentWeekEntry.matches, true)}

        {/* Past weeks — most recent first */}
        {pastWeekEntries.map(({ week, matches: wm }) => renderWeekCard(week, wm))}

        {/* Future weeks — collapsed section (all weeks shown when team filter active) */}
        {futureWeekEntries.length > 0 && (
          teamFilterActive ? (
            <div className="space-y-3">
              {futureWeekEntries.map(({ week, matches: wm }) => renderWeekCard(week, wm))}
            </div>
          ) : (
          <div>
            <button
              onClick={() => setShowFutureWeeks((v) => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 w-full"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showFutureWeeks ? "rotate-180" : ""}`} />
              {showFutureWeeks ? "Hide" : "Show"} future weeks ({futureWeekEntries.length})
            </button>
            {showFutureWeeks && (
              <div className="space-y-3 mt-2">
                {futureWeekEntries.map(({ week, matches: wm }) => renderWeekCard(week, wm))}
              </div>
            )}
          </div>
          )
        )}

        {/* Team records */}
        {teamRecordsSorted.length > 0 && (() => {
          const recordMap = Object.fromEntries(teamRecordsSorted.map((r) => [r.team, r]));
          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Your Team Records</CardTitle>
                <p className="text-xs text-muted-foreground">How you have each team finishing based on your picks</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {NFL_STRUCTURE.map(({ conf, divisions }) => {
                  const hasAny = divisions.some((d) => d.teams.some((t) => recordMap[t]));
                  if (!hasAny) return null;
                  return (
                    <div key={conf}>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">{conf}</p>
                      <div className="space-y-1.5">
                        {divisions.map(({ div, teams }) => {
                          const divTeams = teams
                            .filter((t) => recordMap[t])
                            .sort((a, b) => (recordMap[b].wins - recordMap[a].wins) || (recordMap[a].losses - recordMap[b].losses));
                          if (divTeams.length === 0) return null;
                          return (
                            <div key={div} className="flex items-center gap-2">
                              <span className="text-[9px] text-muted-foreground w-7 shrink-0 font-medium">{div}</span>
                              <div className="flex gap-1.5 flex-wrap">
                                {divTeams.map((team) => {
                                  const { wins, losses } = recordMap[team];
                                  return (
                                    <div key={team} className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg bg-secondary/30 border border-border/50 min-w-[44px]">
                                      <TeamLogo team={team} size={22} />
                                      <span className="text-[8px] font-bold text-muted-foreground uppercase">{team}</span>
                                      <span className="text-[10px] font-bold text-foreground">{wins}-{losses}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })()}
      </div>
    );
  }

  // ── EDITING VIEW ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-28">
      {TutorialDialog}

      {/* Sticky progress bar */}
      <div className="sticky top-16 z-20 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b shadow-sm">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">My Picks</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalPicks} of {totalMatches} picks
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status?.mode === "in-season" ? (
              <Badge variant="destructive" className="text-xs">Season Locked</Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full h-8 px-3 text-xs"
                onClick={() => setShowResetConfirm(true)}
                disabled={totalPicks === 0 || resettingPicks}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Countdown */}
      {countdown && status?.mode === "pre-season" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-xl px-4 py-2.5">
          <Clock className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span>
            Picks lock in{" "}
            <strong className="text-foreground">{countdown.days}d {countdown.hours}h {countdown.minutes}m {countdown.seconds}s</strong>
            {" "}— once the season starts, no more changes!
          </span>
        </div>
      )}

      {/* Autofill section */}
      {status?.mode === "pre-season" && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Quick Pick Autofill</p>
          <div className="flex gap-2 flex-wrap">
            {AUTOFILL_OPTIONS.map(({ mode, label, icon: Icon }) => (
              <Button
                key={mode}
                variant="outline"
                size="sm"
                onClick={() => setPendingAutofill(mode)}
                disabled={autofillPicks.isPending || unpickedCount === 0}
              >
                <Icon className="w-4 h-4 mr-2" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Team records (if picks exist) */}
      {teamRecordsSorted.length > 0 && (() => {
        const recordMap = Object.fromEntries(teamRecordsSorted.map((r) => [r.team, r]));
        return (
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Your Team Records</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {NFL_STRUCTURE.map(({ conf, divisions }) => {
                const hasAny = divisions.some((d) => d.teams.some((t) => recordMap[t]));
                if (!hasAny) return null;
                return (
                  <div key={conf}>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{conf}</p>
                    <div className="space-y-1">
                      {divisions.map(({ div, teams }) => {
                        const divTeams = teams
                          .filter((t) => recordMap[t])
                          .sort((a, b) => (recordMap[b].wins - recordMap[a].wins) || (recordMap[a].losses - recordMap[b].losses));
                        if (divTeams.length === 0) return null;
                        return (
                          <div key={div} className="flex items-center gap-1.5">
                            <span className="text-[8px] text-muted-foreground w-6 shrink-0 font-medium">{div}</span>
                            <div className="flex gap-1 flex-wrap">
                              {divTeams.map((team) => {
                                const { wins, losses } = recordMap[team];
                                return (
                                  <div key={team} className="flex flex-col items-center gap-0 p-1 rounded-lg bg-secondary/30 border border-border/50 min-w-[40px]">
                                    <TeamLogo team={team} size={18} />
                                    <span className="text-[7px] font-bold text-muted-foreground uppercase">{team}</span>
                                    <span className="text-[9px] font-bold text-foreground">{wins}-{losses}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}

      {teamFilterControl}

      {/* Week accordions */}
      <Accordion
        type="multiple"
        value={expandedWeeks}
        onValueChange={setExpandedWeeks}
        className="space-y-3"
      >
        {Object.entries(filteredMatchesByWeek).map(([week, weekMatches]) => {
          const weekPickCount = weekMatches.filter((m) => localPicks[m.id]).length;
          const weekComplete = weekPickCount === weekMatches.length;

          return (
            <AccordionItem key={week} value={week} className="bg-card border rounded-xl overflow-hidden px-1">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <span className="font-semibold text-base flex items-center gap-2">
                    Week {week}
                    {weekComplete && (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                  </span>
                  <span className={`text-sm font-normal ${weekComplete ? "text-green-500 font-semibold" : "text-muted-foreground"}`}>
                    {weekPickCount}/{weekMatches.length}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-2 pt-2">
                  {/* Header labels */}
                  <div className="flex items-center gap-2 pb-0.5">
                    <div className="hidden sm:block w-20 shrink-0" />
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <span className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Away</span>
                      <span className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Home</span>
                    </div>
                    <div className="w-2 shrink-0" />
                  </div>
                  {weekMatches.map((match) => {
                    const selectedTeam = localPicks[match.id] ?? "";
                    const awaySpread = getTeamSpread(match.pointSpread, "away");
                    const homeSpread = getTeamSpread(match.pointSpread, "home");
                    const awayPicked = selectedTeam === match.awayTeam;
                    const homePicked = selectedTeam === match.homeTeam;
                    const awayColor = getTeamColor(match.awayTeam);
                    const homeColor = getTeamColor(match.homeTeam);
                    const isLocked = status?.mode === "in-season";

                    return (
                      <div key={match.id} className="flex items-center gap-2 p-2 rounded-xl bg-secondary/20 border">
                        {/* Game time */}
                        {match.gameTime && (
                          <div className="hidden sm:flex w-20 shrink-0 text-[10px] text-muted-foreground font-medium leading-tight text-center flex-col items-center">
                            {match.gameTime.split(" ").map((part, i) => (
                              <span key={i}>{part}</span>
                            ))}
                          </div>
                        )}

                        <div className="flex-1 grid grid-cols-2 gap-2">
                          {/* Away team button */}
                          <button
                            className={`h-12 text-sm font-medium flex items-center justify-start px-2.5 gap-2 relative rounded-lg border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full ${
                              awayPicked ? "text-foreground" : "border-border bg-card text-foreground hover:bg-secondary/50 hover:border-muted-foreground/30"
                            }`}
                            style={awayPicked ? { borderColor: awayColor, backgroundColor: `${awayColor}22` } : {}}
                            onClick={() => handlePick(match.id, match.awayTeam)}
                            disabled={isLocked}
                          >
                            <TeamLogo team={match.awayTeam} size={24} className="shrink-0" />
                            <span className="truncate font-semibold">{match.awayTeam}</span>
                            <span className={`ml-auto text-[10px] font-mono shrink-0 ${awayPicked ? "opacity-70" : "text-muted-foreground"}`}>
                              {awaySpread}
                            </span>
                          </button>

                          {/* Home team button */}
                          <button
                            className={`h-12 text-sm font-medium flex items-center justify-start px-2.5 gap-2 relative rounded-lg border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full ${
                              homePicked ? "text-foreground" : "border-border bg-card text-foreground hover:bg-secondary/50 hover:border-muted-foreground/30"
                            }`}
                            style={homePicked ? { borderColor: homeColor, backgroundColor: `${homeColor}22` } : {}}
                            onClick={() => handlePick(match.id, match.homeTeam)}
                            disabled={isLocked}
                          >
                            <TeamLogo team={match.homeTeam} size={24} className="shrink-0" />
                            <span className="truncate font-semibold">{match.homeTeam}</span>
                            <span className={`ml-auto text-[10px] font-mono shrink-0 ${homePicked ? "opacity-70" : "text-muted-foreground"}`}>
                              {homeSpread}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Floating save button */}
      {status?.mode === "pre-season" && (
        <div className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-50 flex flex-col gap-3 items-end">
          {allPicked && !hasUnsavedChanges && (
            <div className="flex items-center gap-2 bg-green-500/20 border border-green-500/40 text-green-400 rounded-full px-4 py-2 text-sm font-medium shadow">
              <CheckCircle2 className="w-4 h-4" />
              All {totalMatches} picks submitted!
            </div>
          )}
          {hasUnsavedChanges && (
            <Button
              size="lg"
              className={`rounded-full shadow-xl h-14 px-6 text-base ${allPicked ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
              onClick={handleSave}
              disabled={savePicks.isPending}
            >
              {allPicked ? (
                <>
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  {savePicks.isPending ? "Submitting…" : "Submit All Picks"}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  {savePicks.isPending ? "Saving…" : "Save Picks"}
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Reset confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all picks?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all {totalPicks} of your picks from the server across all 18 weeks. You'll need to re-pick all {totalMatches} games. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReset}
            >
              Yes, reset all picks
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Autofill confirmation */}
      <AlertDialog open={!!pendingAutofill} onOpenChange={(open) => !open && setPendingAutofill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fill in unpicked games?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingOption?.description}{" "}
              {unpickedCount > 0
                ? `This will fill ${unpickedCount} game${unpickedCount !== 1 ? "s" : ""} you haven't picked yet.`
                : "You have no unpicked games left."}
              {" "}Games you've already picked won't be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAutofill} disabled={autofillPicks.isPending || unpickedCount === 0}>
              Yes, fill them in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
