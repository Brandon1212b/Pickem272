import React, { useState, useEffect, useMemo } from "react";
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
import { Lock, Save, Shuffle, Wand2, Star, RotateCcw, CheckCircle2 } from "lucide-react";
import { TeamLogo } from "@/lib/team-logos";

type AutofillMode = "home" | "favorites" | "random";

const AUTOFILL_OPTIONS: { mode: AutofillMode; label: string; icon: React.ElementType; description: string }[] = [
  { mode: "home", label: "Home Teams", icon: Wand2, description: "Pick the home team for every game you haven't picked yet." },
  { mode: "favorites", label: "Favorites", icon: Star, description: "Pick the spread favorite for every game you haven't picked yet." },
  { mode: "random", label: "Random", icon: Shuffle, description: "Randomly pick a winner for every game you haven't picked yet." },
];

function getTeamSpread(pointSpread: string | null | undefined, team: "home" | "away"): string | null {
  if (!pointSpread) return null;
  const num = parseFloat(pointSpread);
  if (isNaN(num) || num === 0) return num === 0 ? "PK" : null;
  // pointSpread is home team's spread (negative = home favored)
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

  const [localPicks, setLocalPicks] = useState<Record<number, { selectedTeam: string; isLock: boolean }>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingAutofill, setPendingAutofill] = useState<AutofillMode | null>(null);

  useEffect(() => {
    if (picks) {
      const picksMap = picks.reduce(
        (acc, p) => {
          acc[p.matchId] = { selectedTeam: p.selectedTeam, isLock: p.isLock };
          return acc;
        },
        {} as Record<number, { selectedTeam: string; isLock: boolean }>
      );
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
            merged[p.matchId] = { selectedTeam: p.selectedTeam, isLock: p.isLock };
          }
          return merged;
        });
        setHasUnsavedChanges(true);
        queryClient.invalidateQueries({ queryKey: getGetUserPicksQueryKey(user?.id || 0) });
      },
      onError: () => toast.error("Failed to autofill picks"),
    },
  });

  // Toggle pick: click selected team again to deselect
  const handlePick = (matchId: number, team: string, weekNum: number) => {
    if (status?.mode === "in-season") return;
    setLocalPicks((prev) => {
      const current = prev[matchId];
      if (current?.selectedTeam === team) {
        // Unselect
        return { ...prev, [matchId]: { selectedTeam: "", isLock: false } };
      }
      return { ...prev, [matchId]: { selectedTeam: team, isLock: current?.isLock || false } };
    });
    setHasUnsavedChanges(true);
  };

  const handleLock = (matchId: number, week: number) => {
    if (status?.mode === "in-season") return;
    setLocalPicks((prev) => {
      const next = { ...prev };
      const isCurrentlyLocked = next[matchId]?.isLock;
      if (!isCurrentlyLocked) {
        matches?.filter((m) => m.week === week).forEach((m) => {
          if (next[m.id]?.isLock) next[m.id] = { ...next[m.id], isLock: false };
        });
      }
      next[matchId] = { selectedTeam: next[matchId]?.selectedTeam || "", isLock: !isCurrentlyLocked };
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleReset = () => {
    setLocalPicks({});
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    if (!user) return;
    const picksArray = Object.entries(localPicks)
      .filter(([, p]) => p.selectedTeam)
      .map(([matchId, p]) => ({ matchId: Number(matchId), selectedTeam: p.selectedTeam, isLock: p.isLock }));
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
    return matches.reduce(
      (acc, m) => {
        if (!acc[m.week]) acc[m.week] = [];
        acc[m.week].push(m);
        return acc;
      },
      {} as Record<number, MatchList>
    );
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
  const totalPicks = Object.values(localPicks).filter((p) => p.selectedTeam).length;
  const totalLocks = Object.values(localPicks).filter((p) => p.isLock).length;
  const unpickedCount = totalMatches - totalPicks;
  const allPicked = totalPicks === totalMatches;

  const pendingOption = AUTOFILL_OPTIONS.find((o) => o.mode === pendingAutofill);

  return (
    <div className="space-y-4 pb-28">
      {/* Sticky progress bar */}
      <div className="sticky top-16 z-20 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b shadow-sm">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">Picks</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalPicks} of {totalMatches} picks &bull; {totalLocks} locks
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
                onClick={handleReset}
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
          const weekPickCount = weekMatches.filter((m) => localPicks[m.id]?.selectedTeam).length;
          const weekLock = weekMatches.find((m) => localPicks[m.id]?.isLock);

          return (
            <AccordionItem key={week} value={week} className="bg-card border rounded-xl overflow-hidden px-1">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <span className="font-semibold text-base">Week {week}</span>
                  <div className="flex items-center gap-2">
                    {weekLock && <Lock className="w-3.5 h-3.5 text-primary fill-primary/30" />}
                    <span className="text-sm text-muted-foreground font-normal">
                      {weekPickCount}/{weekMatches.length}
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-2 pt-2">
                  {weekMatches.map((match) => {
                    const pick = localPicks[match.id];
                    const awaySpread = getTeamSpread(match.pointSpread, "away");
                    const homeSpread = getTeamSpread(match.pointSpread, "home");
                    const awayPicked = pick?.selectedTeam === match.awayTeam;
                    const homePicked = pick?.selectedTeam === match.homeTeam;

                    return (
                      <div key={match.id} className="flex items-center gap-2 p-2 rounded-xl bg-secondary/20 border">
                        {/* Game time label */}
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
                            onClick={() => handlePick(match.id, match.awayTeam, weekNum)}
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
                            onClick={() => handlePick(match.id, match.homeTeam, weekNum)}
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

                        {/* Lock button */}
                        <div className="flex flex-col items-center w-8 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`rounded-full h-8 w-8 ${pick?.isLock ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
                            onClick={() => handleLock(match.id, weekNum)}
                            disabled={status?.mode === "in-season" || !pick?.selectedTeam}
                            title="Set as Lock of the Week (2pts if correct)"
                          >
                            <Lock className={`w-4 h-4 ${pick?.isLock ? "fill-current" : ""}`} />
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

      {/* Floating action buttons */}
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

      {/* Autofill confirmation dialog */}
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
