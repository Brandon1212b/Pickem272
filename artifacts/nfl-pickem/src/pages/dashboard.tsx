import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { 
  useGetSeasonStatus, 
  useListMatches, 
  useGetUserPicks, 
  useGetLeaderboard,
  useListSmackMessages,
  usePostSmackMessage,
  getGetUserPicksQueryKey,
  getListSmackMessagesQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Send, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { TeamLogo } from "@/lib/team-logos";

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [smackText, setSmackText] = useState("");

  const { data: status, isLoading: loadingStatus } = useGetSeasonStatus();
  const defaultWeek = status ? (status.lastCompletedWeek || 1) : 1;
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const activeWeek = selectedWeek ?? defaultWeek;
  
  const { data: matches, isLoading: loadingMatches } = useListMatches({ week: activeWeek });
  const { data: picks, isLoading: loadingPicks } = useGetUserPicks(user?.id || 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserPicksQueryKey(user?.id || 0) }
  });
  const { data: leaderboard, isLoading: loadingBoard } = useGetLeaderboard();
  
  const { data: smackMessages, isLoading: loadingSmack } = useListSmackMessages({
    query: { refetchInterval: 15000, queryKey: getListSmackMessagesQueryKey() }
  });

  const postSmack = usePostSmackMessage({
    mutation: {
      onSuccess: () => {
        setSmackText("");
        queryClient.invalidateQueries({ queryKey: getListSmackMessagesQueryKey() });
      }
    }
  });

  if (loadingStatus || loadingMatches || loadingPicks || loadingBoard || loadingSmack) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const userStats = leaderboard?.find(entry => entry.userId === user?.id);
  const weekMatches = matches || [];
  
  const handleSmackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!smackText.trim() || !user) return;
    postSmack.mutate({ data: { name: user.name, message: smackText.substring(0, 280) } });
  };

  const displayWeek = selectedWeek ?? defaultWeek;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-primary text-primary-foreground border-none col-span-1">
          <CardContent className="p-4 flex flex-col">
            <p className="text-primary-foreground/70 text-xs font-medium">Rank</p>
            <h2 className="text-3xl font-bold">{userStats ? `#${userStats.rank}` : '-'}</h2>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs font-medium">Points</p>
            <h2 className="text-3xl font-bold">{userStats?.totalPoints || 0}</h2>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs font-medium">Record</p>
            <h2 className="text-2xl font-bold">
              {userStats ? `${userStats.correctPicks}-${userStats.totalPicks - userStats.correctPicks}` : '—'}
            </h2>
          </CardContent>
        </Card>
      </div>

      {/* Week matchups with week switcher */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Week {displayWeek} Matchups</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setSelectedWeek(Math.max(1, displayWeek - 1))}
                disabled={displayWeek <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground w-12 text-center font-medium">Wk {displayWeek}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setSelectedWeek(Math.min(18, displayWeek + 1))}
                disabled={displayWeek >= 18}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {weekMatches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No games found for this week.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {weekMatches.map(match => {
                const pick = picks?.find(p => p.matchId === match.id);
                const pickedTeam = pick?.selectedTeam;
                const isCorrect = match.isCompleted && match.winner === pickedTeam;
                const isWrong = match.isCompleted && match.winner && pickedTeam && match.winner !== pickedTeam;
                
                return (
                  <div 
                    key={match.id}
                    className={`rounded-xl border p-3 flex flex-col gap-2 ${
                      isCorrect ? 'bg-green-500/10 border-green-500/20' :
                      isWrong   ? 'opacity-60 bg-muted border-muted' :
                                  'bg-card'
                    }`}
                  >
                    {/* Game time */}
                    {match.gameTime && (
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {match.gameTime}
                      </div>
                    )}

                    {/* Matchup */}
                    <div className="flex items-center justify-between gap-2">
                      {/* Away team */}
                      <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${pickedTeam === match.awayTeam ? 'font-bold text-primary' : ''}`}>
                        <TeamLogo team={match.awayTeam} size={20} />
                        <span className="text-sm truncate">{match.awayTeam}</span>
                      </div>

                      <span className="text-xs text-muted-foreground font-medium shrink-0">@</span>

                      {/* Home team */}
                      <div className={`flex items-center gap-1.5 flex-1 min-w-0 justify-end ${pickedTeam === match.homeTeam ? 'font-bold text-primary' : ''}`}>
                        <span className="text-sm truncate text-right">{match.homeTeam}</span>
                        <TeamLogo team={match.homeTeam} size={20} />
                      </div>
                    </div>

                    {/* Pick status */}
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Pick:{" "}
                        {pickedTeam ? (
                          <span className="font-medium text-foreground">
                            {pickedTeam}
                            {pick?.isLock && " 🔒"}
                          </span>
                        ) : (
                          <span className="italic">None</span>
                        )}
                      </div>
                      <div>
                        {isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {isWrong && <XCircle className="w-4 h-4 text-destructive" />}
                        {!match.isCompleted && pickedTeam && (
                          <Badge variant="secondary" className="text-[10px] h-5">Locked In</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Smack Board */}
      <Card>
        <CardHeader>
          <CardTitle>Smack Board</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-[300px] overflow-y-auto space-y-3 pr-1 flex flex-col-reverse">
            {[...(smackMessages || [])].reverse().map(msg => (
              <div key={msg.id} className="bg-secondary/40 p-3 rounded-xl border">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-bold text-sm">{msg.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm">{msg.message}</p>
              </div>
            ))}
            {(!smackMessages || smackMessages.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">No smack talk yet. Be the first!</div>
            )}
          </div>
          
          <form onSubmit={handleSmackSubmit} className="flex gap-2 pt-2">
            <Input
              value={smackText}
              onChange={(e) => setSmackText(e.target.value)}
              placeholder="Talk some smack..."
              maxLength={280}
              disabled={postSmack.isPending}
            />
            <Button type="submit" disabled={!smackText.trim() || postSmack.isPending}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
