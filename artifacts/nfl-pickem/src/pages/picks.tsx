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
import { Card } from "@/components/ui/card";
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
import { Lock, Save, Shuffle, Wand2, Star } from "lucide-react";

type AutofillMode = "home" | "favorites" | "random";

const AUTOFILL_OPTIONS: { mode: AutofillMode; label: string; icon: React.ElementType; description: string }[] = [
  { mode: "home", label: "Home Teams", icon: Wand2, description: "Pick the home team for every game you haven't picked yet." },
  { mode: "favorites", label: "Favorites", icon: Star, description: "Pick the spread favorite for every game you haven't picked yet." },
  { mode: "random", label: "Random", icon: Shuffle, description: "Randomly pick a winner for every game you haven't picked yet." },
];

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
        // Merge returned picks directly into local state
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

  const handlePick = (matchId: number, team: string, week: number) => {
    if (status?.mode === "in-season") return;
    setLocalPicks((prev) => ({
      ...prev,
      [matchId]: { selectedTeam: team, isLock: prev[matchId]?.isLock || false },
    }));
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

  const matchesByWeek = useMemo(() => {
    if (!matches) return {} as Record<number, typeof matches>;
    return matches.reduce(
      (acc, m) => {
        if (!acc[m.week]) acc[m.week] = [];
        acc[m.week].push(m);
        return acc;
      },
      {} as Record<number, typeof matches>
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

  const totalPicks = Object.values(localPicks).filter((p) => p.selectedTeam).length;
  const totalLocks = Object.values(localPicks).filter((p) => p.isLock).length;
  const unpickedCount = (matches?.length ?? 288) - totalPicks;

  const pendingOption = AUTOFILL_OPTIONS.find((o) => o.mode === pendingAutofill);

  return (
    <div className="space-y-4 pb-24">
      {/* Sticky progress bar — sits below the fixed app header (h-16 = top-16) */}
      <div className="sticky top-16 z-20 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b shadow-sm">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">The Grid</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalPicks} of 288 picks made &bull; {totalLocks} locks set
            </p>
          </div>
          {status?.mode === "in-season" && (
            <Badge variant="destructive" className="text-xs">Season Locked</Badge>
          )}
        </div>
      </div>

      {/* Autofill buttons — not sticky */}
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
          {unpickedCount === 0 && (
            <span className="text-xs text-muted-foreground self-center">All games picked</span>
          )}
        </div>
      )}

      {/* Week accordions */}
      <Accordion type="multiple" defaultValue={["1"]} className="space-y-3">
        {Object.entries(matchesByWeek).map(([week, weekMatches]) => {
          const weekNum = Number(week);
          const weekPicks = weekMatches.filter((m) => localPicks[m.id]?.selectedTeam).length;
          const weekLock = weekMatches.find((m) => localPicks[m.id]?.isLock);

          return (
            <AccordionItem key={week} value={week} className="bg-card border rounded-xl overflow-hidden px-1">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <span className="font-semibold text-base">Week {week}</span>
                  <div className="flex items-center gap-2">
                    {weekLock && (
                      <Lock className="w-3.5 h-3.5 text-primary fill-primary/30" />
                    )}
                    <span className="text-sm text-muted-foreground font-normal">
                      {weekPicks}/{weekMatches.length}
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-2 pt-2">
                  {weekMatches.map((match) => {
                    const pick = localPicks[match.id];
                    return (
                      <div key={match.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/30 border">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <Button
                            variant={pick?.selectedTeam === match.awayTeam ? "default" : "outline"}
                            className="h-11 text-sm font-medium justify-between px-3"
                            onClick={() => handlePick(match.id, match.awayTeam, weekNum)}
                            disabled={status?.mode === "in-season"}
                          >
                            <span>{match.awayTeam}</span>
                            <span className="text-[10px] opacity-60">AWAY</span>
                          </Button>
                          <Button
                            variant={pick?.selectedTeam === match.homeTeam ? "default" : "outline"}
                            className="h-11 text-sm font-medium justify-between px-3"
                            onClick={() => handlePick(match.id, match.homeTeam, weekNum)}
                            disabled={status?.mode === "in-season"}
                          >
                            <span>{match.homeTeam}</span>
                            <span className="text-[10px] opacity-60">HOME</span>
                          </Button>
                        </div>
                        <div className="flex flex-col items-center w-10 gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`rounded-full h-8 w-8 ${pick?.isLock ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
                            onClick={() => handleLock(match.id, weekNum)}
                            disabled={status?.mode === "in-season"}
                          >
                            <Lock className={`w-4 h-4 ${pick?.isLock ? "fill-current" : ""}`} />
                          </Button>
                          {match.pointSpread && (
                            <Badge variant="secondary" className="text-[9px] px-1 font-mono">
                              {match.pointSpread}
                            </Badge>
                          )}
                          {match.injuryWeatherFlags && (
                            <span className="text-xs leading-none">{match.injuryWeatherFlags}</span>
                          )}
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
      {status?.mode === "pre-season" && hasUnsavedChanges && (
        <div className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-50">
          <Button
            size="lg"
            className="rounded-full shadow-xl h-14 px-6 text-base"
            onClick={handleSave}
            disabled={savePicks.isPending}
          >
            <Save className="w-5 h-5 mr-2" />
            {savePicks.isPending ? "Saving…" : "Save Picks"}
          </Button>
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
