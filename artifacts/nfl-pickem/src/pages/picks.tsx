import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { 
  useListMatches, 
  useGetUserPicks, 
  useGetSeasonStatus, 
  useSavePicks,
  useAutofillPicks,
  getGetUserPicksQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Lock, Save, Shuffle, Wand2 } from "lucide-react";

export default function Picks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const { data: status, isLoading: loadingStatus } = useGetSeasonStatus();
  const { data: matches, isLoading: loadingMatches } = useListMatches();
  const { data: picks, isLoading: loadingPicks } = useGetUserPicks(user?.id || 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserPicksQueryKey(user?.id || 0) }
  });

  const [localPicks, setLocalPicks] = useState<Record<number, { selectedTeam: string; isLock: boolean }>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (picks) {
      const picksMap = picks.reduce((acc, p) => {
        acc[p.matchId] = { selectedTeam: p.selectedTeam, isLock: p.isLock };
        return acc;
      }, {} as Record<number, { selectedTeam: string; isLock: boolean }>);
      setLocalPicks(picksMap);
      setHasUnsavedChanges(false);
    }
  }, [picks]);

  const savePicks = useSavePicks({
    mutation: {
      onSuccess: () => {
        toast.success("Picks saved successfully!");
        setHasUnsavedChanges(false);
        queryClient.invalidateQueries({ queryKey: getGetUserPicksQueryKey(user?.id || 0) });
      },
      onError: () => toast.error("Failed to save picks")
    }
  });

  const autofillPicks = useAutofillPicks({
    mutation: {
      onSuccess: () => {
        toast.success("Picks autofilled!");
        queryClient.invalidateQueries({ queryKey: getGetUserPicksQueryKey(user?.id || 0) });
      },
      onError: () => toast.error("Failed to autofill picks")
    }
  });

  const handlePick = (matchId: number, team: string, week: number) => {
    if (status?.mode === 'in-season') return;
    
    setLocalPicks(prev => {
      const isLock = prev[matchId]?.isLock || false;
      return { ...prev, [matchId]: { selectedTeam: team, isLock } };
    });
    setHasUnsavedChanges(true);
  };

  const handleLock = (matchId: number, week: number) => {
    if (status?.mode === 'in-season') return;
    
    setLocalPicks(prev => {
      const newPicks = { ...prev };
      const currentlyLock = newPicks[matchId]?.isLock;
      
      if (!currentlyLock) {
        // Find existing lock for this week and remove it
        matches?.filter(m => m.week === week).forEach(m => {
          if (newPicks[m.id]?.isLock) {
            newPicks[m.id] = { ...newPicks[m.id], isLock: false };
          }
        });
      }
      
      const team = newPicks[matchId]?.selectedTeam || "";
      newPicks[matchId] = { selectedTeam: team, isLock: !currentlyLock };
      return newPicks;
    });
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    if (!user) return;
    const picksArray = Object.entries(localPicks)
      .filter(([_, p]) => p.selectedTeam)
      .map(([matchId, p]) => ({
        matchId: Number(matchId),
        selectedTeam: p.selectedTeam,
        isLock: p.isLock
      }));
    
    savePicks.mutate({ data: { userId: user.id, picks: picksArray } });
  };

  const handleAutofill = (mode: 'favorites' | 'random') => {
    if (!user) return;
    autofillPicks.mutate({ data: { userId: user.id, mode } });
  };

  const matchesByWeek = useMemo(() => {
    if (!matches) return {};
    return matches.reduce((acc, m) => {
      if (!acc[m.week]) acc[m.week] = [];
      acc[m.week].push(m);
      return acc;
    }, {} as Record<number, typeof matches>);
  }, [matches]);

  if (loadingStatus || loadingMatches || loadingPicks) {
    return <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const totalPicks = Object.values(localPicks).filter(p => p.selectedTeam).length;
  const totalLocks = Object.values(localPicks).filter(p => p.isLock).length;

  return (
    <div className="space-y-6 pb-24">
      {status?.mode === 'in-season' && (
        <Card className="bg-destructive/10 border-destructive/20 p-4 flex items-center justify-center text-destructive font-medium">
          Season in Progress — Picks Locked
        </Card>
      )}

      <div className="sticky top-0 z-20 flex flex-col md:flex-row justify-between items-center gap-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-4 rounded-xl border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">The Grid</h1>
          <p className="text-muted-foreground">{totalPicks} of 288 picks made • {totalLocks} locks set</p>
        </div>
        
        {status?.mode === 'pre-season' && (
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" size="sm" onClick={() => handleAutofill('favorites')} disabled={autofillPicks.isPending}>
              <Wand2 className="w-4 h-4 mr-2" /> Home Teams
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAutofill('random')} disabled={autofillPicks.isPending}>
              <Shuffle className="w-4 h-4 mr-2" /> Random
            </Button>
          </div>
        )}
      </div>

      <Accordion type="multiple" defaultValue={["1"]} className="space-y-4">
        {Object.entries(matchesByWeek).map(([week, weekMatches]) => {
          const weekPicks = weekMatches.filter(m => localPicks[m.id]?.selectedTeam).length;
          
          return (
            <AccordionItem key={week} value={week} className="bg-card border rounded-xl overflow-hidden px-1">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex justify-between w-full pr-4">
                  <span className="font-semibold text-lg">Week {week}</span>
                  <span className="text-muted-foreground font-normal">{weekPicks} / {weekMatches.length} Picks</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-3 pt-2">
                  {weekMatches.map(match => {
                    const pick = localPicks[match.id];
                    return (
                      <div key={match.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <Button
                            variant={pick?.selectedTeam === match.awayTeam ? "default" : "outline"}
                            className="h-12 text-base font-medium justify-between px-4"
                            onClick={() => handlePick(match.id, match.awayTeam, Number(week))}
                            disabled={status?.mode === 'in-season'}
                          >
                            <span>{match.awayTeam}</span>
                            <span className="text-xs opacity-70">AWAY</span>
                          </Button>
                          <Button
                            variant={pick?.selectedTeam === match.homeTeam ? "default" : "outline"}
                            className="h-12 text-base font-medium justify-between px-4"
                            onClick={() => handlePick(match.id, match.homeTeam, Number(week))}
                            disabled={status?.mode === 'in-season'}
                          >
                            <span>{match.homeTeam}</span>
                            <span className="text-xs opacity-70">HOME</span>
                          </Button>
                        </div>
                        <div className="flex flex-col items-center justify-center w-12 gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`rounded-full ${pick?.isLock ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                            onClick={() => handleLock(match.id, Number(week))}
                            disabled={status?.mode === 'in-season'}
                          >
                            <Lock className={`w-5 h-5 ${pick?.isLock ? 'fill-current' : ''}`} />
                          </Button>
                          {match.pointSpread && (
                            <Badge variant="secondary" className="text-[10px] px-1 font-mono">
                              {match.pointSpread}
                            </Badge>
                          )}
                          {match.injuryWeatherFlags && (
                            <span className="text-sm">{match.injuryWeatherFlags}</span>
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

      {status?.mode === 'pre-season' && hasUnsavedChanges && (
        <div className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-50">
          <Button 
            size="lg" 
            className="rounded-full shadow-xl h-14 px-6 text-lg"
            onClick={handleSave}
            disabled={savePicks.isPending}
          >
            <Save className="w-5 h-5 mr-2" />
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
