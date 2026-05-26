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
import { Card, CardContent } from "@/components/ui/card";
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
import { Save, Shuffle, Wand2, Star, RotateCcw, CheckCircle2, Pencil } from "lucide-react";
import { TeamLogo } from "@/lib/team-logos";

type AutofillMode = "home" | "favorites" | "random";

const AUTOFILL_OPTIONS: { mode: AutofillMode; label: string; icon: React.ElementType; description: string }[] = [
  { mode: "home", label: "Home Teams", icon: Wand2, description: "Pick the home team for every game you haven't picked yet." },
  { mode: "favorites", label: "Favorites", icon: Star, description: "Pick the spread favorite for every game you haven't picked yet." },
  { mode: "random", label: "Random", icon: Shuffle, description: "Randomly pick a winner for every game you haven't picked yet." },
];

function getTeamSpread(pointSpread: string | null | undefined, team: "home" | "away"): string | null {
  if (!pointSpread) return null;
  if (pointSpread === "PK") return "PK";
  const num = parseFloat(pointSpread);
  if (isNaN(num) || num === 0) return "PK";
  const val = team === "home" ? num : -num;
  return val > 0 ? `+${val}` : `${val}`;
}

export default function Picks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: status, isLoading: loadingStatus } = useGetSeasonStatus();
  const { data: matches, isLoading: loadingMatches } = useListMatches();
  const { data: picks, isLoading: loadingPicks } = useGetUserPicks(user?.id || 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserPicksQueryKey(user?.id || 0) },
  });

  // localPicks: matchId → selectedTeam (empty string = unpicked)
  const [localPicks, setLocalPicks] = useState<Record<number, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingAutofill, setPendingAutofill] = useState<AutofillMode | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const picksLockedKey = `picks_locked_${user?.id}`;
  const [picksSubmitted, setPicksSubmitted] = useState(() =>
    localStorage.getItem(`picks_locked_${user?.id}`) === "true"
  );

  // Refs for auto-lock detection inside onSuccess
  const localPicksRef = useRef<Record<number, string>>({});
  const matchesLengthRef = useRef(0);
  useEffect(() => { localPicksRef.current = localPicks; }, [localPicks]);
  useEffect(() => { matchesLengthRef.current = matches?.length ?? 288; }, [matches]);

  useEffect(() => {
    if (picks) {
      const picksMap = picks.reduce((acc, p) => {
        acc[p.matchId] = p.selectedTeam;
        return acc;
      }, {} as Record<number, string>);
      setLocalPicks(picksMap);
      setHasUnsavedChanges(false);
    }
  }, [picks]);

  const savePicks = useSavePicks({
    mutation: {
      onSuccess: () => {
        toast.success("Picks saved!");
        setHasUnsavedChanges(false);
        queryClient.invalidateQueries({ queryKey: getGetUserPicksQueryKey(user?.id || 0) });
        // Auto-lock if all picks submitted
        const count = Object.values(localPicksRef.current).filter(Boolean).length;
        if (count >= matchesLengthRef.current && matchesLengthRef.current > 0) {
          localStorage.setItem(`picks_locked_${user?.id}`, "true");
          setPicksSubmitted(true);
        }
      },
      onError: () => toast.error("Failed to save picks"),
    },
  });

  const autofillPicks = useAutofillPicks({
    mutation: {
      onSuccess: (newPicks) => {
        toast.success("Picks filled in!");
        setLocalPicks((prev) => {
          const merged = { ...prev };
          for (const p of newPicks) {
            merged[p.matchId] = p.selectedTeam;
          }
          return merged;
        });
        setHasUnsavedChanges(true);
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

  const handleReset = () => {
    setLocalPicks({});
    setHasUnsavedChanges(true);
  };

  const handleUnlock = () => {
    localStorage.removeItem(picksLockedKey);
    setPicksSubmitted(false);
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

  type MatchList = NonNullable<typeof matches>;
  const matchesByWeek = useMemo(() => {
    if (!matches) return {} as Record<number, MatchList>;
    return matches.reduce((acc, m) => {
      if (!acc[m.week]) acc[m.week] = [];
      acc[m.week].push(m);
      return acc;
    }, {} as Record<number, MatchList>);
  }, [matches]);

  if (loadingStatus || loadingMatches || loadingPicks) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalMatches = matches?.length ?? 288;
  const totalPicks = Object.values(localPicks).filter(Boolean).length;
  const unpickedCount = totalMatches - totalPicks;
  const allPicked = totalPicks === totalMatches && totalMatches > 0;
  const pendingOption = AUTOFILL_OPTIONS.find((o) => o.mode === pendingAutofill);

  // ── LOCKED / SUBMITTED VIEW ──────────────────────────────────────────────────
  if (picksSubmitted) {
    return (
      <div className="space-y-4 pb-8">
        {/* Header */}
        <div className="sticky top-16 z-20 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b shadow-sm">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <div>
              <h1 className="text-xl font-bold tracking-tight">All Picks Submitted ✓</h1>
              <p className="text-sm text-muted-foreground">
                {totalPicks} picks locked in across 18 weeks
              </p>
            </div>
            {status?.mode === "pre-season" && (
              <Button variant="outline" size="sm" onClick={handleUnlock} className="gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                Edit Picks
              </Button>
            )}
          </div>
        </div>

        {/* Week-by-week summary */}
        <div className="space-y-3">
          {Object.entries(matchesByWeek).map(([weekStr, weekMatches]) => {
            const weekPicksData = weekMatches.map((m) => ({
              match: m,
              picked: localPicks[m.id] ?? "",
            }));
            const completedWithPick = weekPicksData.filter((p) => p.match.isCompleted && p.picked);
            const correct = completedWithPick.filter((p) => p.picked === p.match.winner).length;
            const wrong = completedWithPick.length - correct;
            const hasPicks = weekPicksData.some((p) => p.picked);

            return (
              <Card key={weekStr}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="font-bold text-base">Week {weekStr}</h3>
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
          })}
        </div>
      </div>
    );
  }

  // ── EDITING VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-28">
      {/* Sticky progress bar */}
      <div className="sticky top-16 z-20 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b shadow-sm">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">Picks</h1>
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
                disabled={totalPicks === 0}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Autofill buttons */}
      {status?.mode === "pre-season" && (
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
      )}

      {/* Week accordions */}
      <Accordion type="multiple" defaultValue={["1"]} className="space-y-3">
        {Object.entries(matchesByWeek).map(([week, weekMatches]) => {
          const weekNum = Number(week);
          const weekPickCount = weekMatches.filter((m) => localPicks[m.id]).length;

          return (
            <AccordionItem key={week} value={week} className="bg-card border rounded-xl overflow-hidden px-1">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <span className="font-semibold text-base">Week {week}</span>
                  <span className="text-sm text-muted-foreground font-normal">
                    {weekPickCount}/{weekMatches.length}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-2 pt-2">
                  {/* Home / Away labels */}
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
                          <Button
                            variant={awayPicked ? "default" : "outline"}
                            className="h-12 text-sm font-medium justify-start px-2.5 gap-2 relative"
                            onClick={() => handlePick(match.id, match.awayTeam)}
                            disabled={status?.mode === "in-season"}
                          >
                            <TeamLogo team={match.awayTeam} size={24} className="shrink-0" />
                            <span className="truncate font-semibold">{match.awayTeam}</span>
                            {awaySpread && (
                              <span className={`ml-auto text-[10px] font-mono shrink-0 ${awayPicked ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                {awaySpread}
                              </span>
                            )}
                          </Button>

                          {/* Home team button */}
                          <Button
                            variant={homePicked ? "default" : "outline"}
                            className="h-12 text-sm font-medium justify-start px-2.5 gap-2 relative"
                            onClick={() => handlePick(match.id, match.homeTeam)}
                            disabled={status?.mode === "in-season"}
                          >
                            <TeamLogo team={match.homeTeam} size={24} className="shrink-0" />
                            <span className="truncate font-semibold">{match.homeTeam}</span>
                            {homeSpread && (
                              <span className={`ml-auto text-[10px] font-mono shrink-0 ${homePicked ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                {homeSpread}
                              </span>
                            )}
                          </Button>
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
              className={`rounded-full shadow-xl h-14 px-6 text-base ${allPicked ? "bg-green-600 hover:bg-green-700" : ""}`}
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
              This will clear all {totalPicks} of your picks across all 18 weeks. You'll need to re-pick all {totalMatches} games. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { handleReset(); setShowResetConfirm(false); }}
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
                : "You have no unpicked games."}
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
