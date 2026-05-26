import React, { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import {
  useGetSeasonStatus,
  useListMatches,
  useGetUserPicks,
  useGetLeaderboard,
  useGetPickPopularity,
  useListSmackMessages,
  usePostSmackMessage,
  getGetUserPicksQueryKey,
  getListSmackMessagesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { TeamLogo } from "@/lib/team-logos";
import { getTeamColor } from "@/lib/team-colors";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function PickerAvatars({
  names,
  colorMap = {},
  limit = 5,
}: {
  names: string[];
  colorMap?: Record<string, string>;
  limit?: number;
}) {
  const shown = names.slice(0, limit);
  const extra = names.length - limit;
  return (
    <div className="flex items-center">
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
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [smackText, setSmackText] = useState("");

  const { data: status } = useGetSeasonStatus();
  const { data: allMatches } = useListMatches();
  const { data: picks } = useGetUserPicks(user?.id || 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserPicksQueryKey(user?.id || 0) },
  });
  const { data: leaderboard } = useGetLeaderboard();
  const { data: popularity } = useGetPickPopularity();
  const { data: smackMessages } = useListSmackMessages({
    query: { refetchInterval: 15000, queryKey: getListSmackMessagesQueryKey() },
  });

  const postSmack = usePostSmackMessage({
    mutation: {
      onSuccess: () => {
        setSmackText("");
        queryClient.invalidateQueries({ queryKey: getListSmackMessagesQueryKey() });
      },
    },
  });

  const userStats = leaderboard?.find((e) => e.userId === user?.id);
  const activeWeek = (status?.lastCompletedWeek ?? 0) + 1;

  // Map user names → their avatar color (for picker avatars)
  const userColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of leaderboard ?? []) {
      map[entry.name] = entry.avatar ?? "#007AFF";
    }
    return map;
  }, [leaderboard]);

  // Team records: count wins/losses per team from user's picks
  const teamRecordsSorted = useMemo(() => {
    if (!allMatches || !picks) return [];
    const records: Record<string, { wins: number; losses: number }> = {};
    for (const match of allMatches) {
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
  }, [allMatches, picks]);

  const handleSmackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!smackText.trim() || !user) return;
    postSmack.mutate({ data: { name: user.name, message: smackText.substring(0, 280) } });
  };

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
        <CardHeader className="pb-3">
          <CardTitle>Week {activeWeek} Pick Split</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {popularity && popularity.length > 0 ? (
            popularity.map((pop) => {
              const userPickedTeam = picks?.find((p) => p.matchId === pop.matchId)?.selectedTeam;
              const userPickedAway = userPickedTeam === pop.awayTeam;
              const userPickedHome = userPickedTeam === pop.homeTeam;

              return (
                <div
                  key={pop.matchId}
                  className={`rounded-xl border p-3 space-y-2 ${
                    userPickedTeam ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  {pop.gameTime && (
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {pop.gameTime}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${userPickedAway ? "font-bold text-primary" : ""}`}>
                      <TeamLogo team={pop.awayTeam} size={20} />
                      <span className="text-sm truncate">{pop.awayTeam}</span>
                      {userPickedAway && (
                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold shrink-0">✓</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">@</span>
                    <div className={`flex items-center gap-1.5 flex-1 min-w-0 justify-end ${userPickedHome ? "font-bold text-primary" : ""}`}>
                      {userPickedHome && (
                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold shrink-0">✓</span>
                      )}
                      <span className="text-sm truncate text-right">{pop.homeTeam}</span>
                      <TeamLogo team={pop.homeTeam} size={20} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <PickerAvatars names={pop.awayPickerNames} colorMap={userColorMap} />
                    <PickerAvatars names={pop.homePickerNames} colorMap={userColorMap} />
                  </div>

                  {(pop.awayPickCount + pop.homePickCount) > 0 ? (
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden flex">
                      {pop.awayPickCount > 0 && (
                        <div
                          className="h-full rounded-l-full"
                          style={{ width: `${pop.awayPickPct}%`, backgroundColor: getTeamColor(pop.awayTeam) }}
                        />
                      )}
                      {pop.homePickCount > 0 && (
                        <div
                          className="h-full rounded-r-full"
                          style={{ width: `${pop.homePickPct}%`, backgroundColor: getTeamColor(pop.homeTeam) }}
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
              No picks made for Week {activeWeek} yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Records */}
      {teamRecordsSorted.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Your Team Records</CardTitle>
            <p className="text-xs text-muted-foreground">How you have each team finishing based on your picks</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {teamRecordsSorted.map(({ team, wins, losses }) => (
                <div key={team} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-secondary/30 border border-border/50">
                  <TeamLogo team={team} size={28} />
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">{team}</span>
                  <span className="text-xs font-bold text-foreground">{wins}-{losses}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Smack Board */}
      <Card>
        <CardHeader>
          <CardTitle>Smack Board</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-[300px] overflow-y-auto space-y-3 pr-1 flex flex-col-reverse">
            {[...(smackMessages || [])].reverse().map((msg) => (
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
