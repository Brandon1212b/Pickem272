import React, { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  useGetSeasonStatus,
  useListSmackMessages,
  usePostSmackMessage,
  useGetLeaderboard,
  getListSmackMessagesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TeamLogo } from "@/lib/team-logos";
import { getTeamColor } from "@/lib/team-colors";
import { formatDistanceToNow } from "date-fns";
import { Send, TrendingUp, TrendingDown, Zap, AlertCircle, Minus, Newspaper, MessageSquare, Trophy, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface RecapData {
  week: number;
  storyline: string | null;
  userCount: number;
  mostPicked: { team: string; pickCount: number; pickPct: number; pickerNames: string[] }[];
  leastPicked: { team: string; pickCount: number; pickPct: number; pickerNames: string[] }[];
  biggestSplits: {
    matchId: number; awayTeam: string; homeTeam: string;
    awayPickPct: number; homePickPct: number; awayPickCount: number; homePickCount: number;
    splitScore: number; gameTime: string | null; isCompleted: boolean; winner: string | null;
  }[];
  nobodyPicked: string[];
  highlights: { type: string; headline: string; detail: string; team: string | null }[];
}

interface SeasonRecapData {
  achievements: { type: string; label: string; userId: number; name: string; avatar: string | null; value: number; detail: string }[];
  weeklyWinners: { week: number; userId: number; name: string; avatar: string | null; points: number }[];
}

function HighlightIcon({ type }: { type: string }) {
  if (type === "biggest-upset") return <Zap className="w-4 h-4 text-orange-500" />;
  if (type === "most-popular-upset") return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (type === "consensus-pick") return <Trophy className="w-4 h-4 text-yellow-500" />;
  if (type === "nobody-picked") return <AlertCircle className="w-4 h-4 text-red-500" />;
  if (type === "closest-split") return <Minus className="w-4 h-4 text-blue-500" />;
  if (type === "upset-watch") return <TrendingDown className="w-4 h-4 text-purple-500" />;
  return <Zap className="w-4 h-4 text-muted-foreground" />;
}

function AvatarBubble({ name, color, size = 20 }: { name: string; color?: string | null; size?: number }) {
  return (
    <div
      title={name}
      className="rounded-full flex items-center justify-center text-white font-bold select-none shrink-0"
      style={{ backgroundColor: color ?? "#007AFF", width: size, height: size, fontSize: size * 0.38 }}
    >
      {getInitials(name)}
    </div>
  );
}

function PickerAvatars({ names, colorMap, limit = 6 }: { names: string[]; colorMap: Record<string, string>; limit?: number }) {
  const shown = names.slice(0, limit);
  const extra = names.length - limit;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((name, i) => (
          <AvatarBubble key={i} name={name} color={colorMap[name]} size={18} />
        ))}
        {extra > 0 && (
          <div className="w-[18px] h-[18px] rounded-full bg-muted border border-card flex items-center justify-center text-[8px] font-medium text-muted-foreground shrink-0">
            +{extra}
          </div>
        )}
      </div>
      {names.length > 0 && (
        <span className="ml-1.5 text-[10px] text-muted-foreground font-medium">{names.length}</span>
      )}
    </div>
  );
}

export default function Recap() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [smackText, setSmackText] = useState("");
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [showSeasonRecap, setShowSeasonRecap] = useState(false);

  const { data: status } = useGetSeasonStatus();
  const { data: leaderboard } = useGetLeaderboard();
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

  const activeWeek = Math.min((status?.lastCompletedWeek ?? 0) + 1, 18);
  const displayWeek = selectedWeek ?? activeWeek;

  const { data: recap, isLoading: loadingRecap } = useQuery<RecapData>({
    queryKey: ["weekly-recap", displayWeek],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard/weekly-recap?week=${displayWeek}`);
      if (!res.ok) throw new Error("Failed to fetch recap");
      return res.json() as Promise<RecapData>;
    },
    enabled: displayWeek > 0,
  });

  const { data: seasonRecap, isLoading: loadingSeasonRecap } = useQuery<SeasonRecapData>({
    queryKey: ["season-recap"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard/season-recap");
      if (!res.ok) throw new Error("Failed to fetch season recap");
      return res.json() as Promise<SeasonRecapData>;
    },
    enabled: showSeasonRecap,
  });

  const userColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of leaderboard ?? []) {
      map[entry.name] = entry.avatar ?? "#007AFF";
    }
    return map;
  }, [leaderboard]);

  const handleSmackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!smackText.trim() || !user) return;
    postSmack.mutate({ data: { name: user.name, message: smackText.substring(0, 280) } });
  };

  const isSeasonStarted = status?.lastCompletedWeek !== undefined && status.lastCompletedWeek > 0;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">League Recap</h1>
          <p className="text-sm text-muted-foreground">
            {status?.mode === "in-season"
              ? "See how the league picked 'em"
              : "Pre-season — picks are still open"}
          </p>
        </div>
        {isSeasonStarted && (
          <button
            onClick={() => setShowSeasonRecap((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors"
          >
            <Trophy className="w-3.5 h-3.5" />
            {showSeasonRecap ? "Weekly View" : "Season Awards"}
          </button>
        )}
      </div>

      {/* Week selector */}
      {!showSeasonRecap && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => {
            const isCompleted = week <= (status?.lastCompletedWeek ?? 0);
            const isCurrent = week === activeWeek;
            const isSelected = displayWeek === week;
            return (
              <button
                key={week}
                onClick={() => setSelectedWeek(week === activeWeek ? null : week)}
                className={cn(
                  "flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors relative",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                )}
              >
                W{week}
                {isCompleted && !isSelected && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-background" />
                )}
                {isCurrent && !isSelected && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full border border-background" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Season Recap mode */}
      {showSeasonRecap ? (
        <SeasonRecapSection
          data={seasonRecap ?? null}
          loading={loadingSeasonRecap}
          userColorMap={userColorMap}
        />
      ) : (
        <>
          {/* Weekly recap content */}
          {loadingRecap ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : recap ? (
            <WeeklyRecapContent recap={recap} userColorMap={userColorMap} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Newspaper className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No recap available for Week {displayWeek}</p>
                <p className="text-xs mt-1">Check back once picks are in.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Smack Board — always visible */}
      <SmackBoard
        messages={smackMessages ?? []}
        smackText={smackText}
        setSmackText={setSmackText}
        onSubmit={handleSmackSubmit}
        isPending={postSmack.isPending}
        userColorMap={userColorMap}
      />
    </div>
  );
}

function WeeklyRecapContent({
  recap,
  userColorMap,
}: {
  recap: RecapData;
  userColorMap: Record<string, string>;
}) {
  const hasPickData = recap.mostPicked.length > 0 || recap.nobodyPicked.length > 0;
  const hasHighlights = recap.highlights.length > 0;
  const hasSplits = recap.biggestSplits.length > 0;
  const isCompleted = recap.biggestSplits.some((g) => g.isCompleted);

  return (
    <div className="space-y-4">
      {/* Storyline */}
      {recap.storyline && (
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-primary" />
              Week {recap.week} Storyline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {recap.storyline}
            </p>
          </CardContent>
        </Card>
      )}

      {/* League Highlights */}
      {hasHighlights && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              League Highlights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recap.highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <HighlightIcon type={h.type} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {h.team && (
                      <span className="shrink-0">
                        <TeamLogo team={h.team} size={16} />
                      </span>
                    )}
                    <p className="font-semibold text-sm">{h.headline}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{h.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pick Trends */}
      {hasPickData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Week {recap.week} Pick Trends
            </CardTitle>
            <p className="text-xs text-muted-foreground">{recap.userCount} players picking</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Most Picked */}
            {recap.mostPicked.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Most Picked</p>
                <div className="space-y-2">
                  {recap.mostPicked.map((t) => (
                    <div key={t.team} className="flex items-center gap-3">
                      <TeamLogo team={t.team} size={24} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold">{t.team}</span>
                          <span className="text-xs font-bold text-foreground">
                            {t.pickCount} of {recap.userCount} ({t.pickPct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${t.pickPct}%`, backgroundColor: getTeamColor(t.team) }}
                          />
                        </div>
                        <div className="mt-1">
                          <PickerAvatars names={t.pickerNames} colorMap={userColorMap} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Least Picked */}
            {recap.leastPicked.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Least Picked</p>
                  <div className="space-y-2">
                    {recap.leastPicked.map((t) => (
                      <div key={t.team} className="flex items-center gap-3">
                        <TeamLogo team={t.team} size={24} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold">{t.team}</span>
                            <span className="text-xs font-bold text-muted-foreground">
                              {t.pickCount} of {recap.userCount} ({t.pickPct}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full opacity-50 transition-all"
                              style={{ width: `${t.pickPct}%`, backgroundColor: getTeamColor(t.team) }}
                            />
                          </div>
                          {t.pickerNames.length > 0 && (
                            <div className="mt-1">
                              <PickerAvatars names={t.pickerNames} colorMap={userColorMap} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Nobody Picked */}
            {recap.nobodyPicked.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3 text-red-500" />
                    Nobody Picked
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recap.nobodyPicked.map((team) => (
                      <div key={team} className="flex items-center gap-1.5 bg-destructive/10 border border-destructive/20 rounded-lg px-2 py-1.5">
                        <TeamLogo team={team} size={18} />
                        <span className="text-xs font-semibold text-destructive">{team}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Biggest Splits */}
      {hasSplits && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Minus className="w-4 h-4 text-blue-500" />
              Closest Splits
            </CardTitle>
            <p className="text-xs text-muted-foreground">Games that divided the league the most</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {recap.biggestSplits.map((game) => {
              const total = game.awayPickCount + game.homePickCount;
              return (
                <div key={game.matchId} className={cn(
                  "rounded-xl border p-3 space-y-2",
                  game.isCompleted ? "bg-secondary/20" : "bg-card",
                )}>
                  {game.gameTime && (
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {game.gameTime}
                      {game.isCompleted && game.winner && (
                        <span className="ml-2 text-green-600 font-bold">Final: {game.winner} wins</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-1">
                      <TeamLogo team={game.awayTeam} size={20} />
                      <span className={cn("text-sm font-semibold", game.winner === game.awayTeam ? "text-green-600" : "")}>
                        {game.awayTeam}
                      </span>
                      {game.winner === game.awayTeam && <span className="text-green-500 text-xs">✓</span>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">@</span>
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                      {game.winner === game.homeTeam && <span className="text-green-500 text-xs">✓</span>}
                      <span className={cn("text-sm font-semibold", game.winner === game.homeTeam ? "text-green-600" : "")}>
                        {game.homeTeam}
                      </span>
                      <TeamLogo team={game.homeTeam} size={20} />
                    </div>
                  </div>
                  {total > 0 && (
                    <>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden flex">
                        {game.awayPickCount > 0 && (
                          <div
                            className="h-full rounded-l-full transition-all"
                            style={{ width: `${game.awayPickPct}%`, backgroundColor: getTeamColor(game.awayTeam) }}
                          />
                        )}
                        {game.homePickCount > 0 && (
                          <div
                            className="h-full rounded-r-full transition-all"
                            style={{ width: `${game.homePickPct}%`, backgroundColor: getTeamColor(game.homeTeam) }}
                          />
                        )}
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground font-semibold">
                        <span>{game.awayPickPct}% ({game.awayPickCount})</span>
                        <span>{game.homePickPct}% ({game.homePickCount})</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {!hasPickData && !hasHighlights && !hasSplits && !recap.storyline && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Newspaper className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Week {recap.week} recap coming soon</p>
            <p className="text-xs mt-1">Not enough picks submitted yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SeasonRecapSection({
  data,
  loading,
  userColorMap,
}: {
  data: SeasonRecapData | null;
  loading: boolean;
  userColorMap: Record<string, string>;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data || (data.achievements.length === 0 && data.weeklyWinners.length === 0)) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Trophy className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Season awards unlock once games are completed</p>
          <p className="text-xs mt-1">Check back after Week 1!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Season Achievements */}
      {data.achievements.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-500" />
              Season Awards
            </CardTitle>
            <p className="text-xs text-muted-foreground">Updated as games complete</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.achievements.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/50">
                <div className="shrink-0">
                  <AvatarBubble name={a.name} color={userColorMap[a.name] ?? a.avatar} size={36} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-bold shrink-0">{a.label}</Badge>
                    <span className="font-semibold text-sm">{a.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-primary">{a.value}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Weekly Winners */}
      {data.weeklyWinners.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weekly Winners</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.weeklyWinners.map((w) => (
              <div key={w.week} className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-bold text-muted-foreground w-10 shrink-0">Wk {w.week}</span>
                <AvatarBubble name={w.name} color={userColorMap[w.name] ?? w.avatar} size={26} />
                <span className="flex-1 text-sm font-semibold">{w.name}</span>
                <span className="text-xs font-bold text-primary">{w.points} pts</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SmackBoard({
  messages,
  smackText,
  setSmackText,
  onSubmit,
  isPending,
  userColorMap,
}: {
  messages: { id: number; name: string; message: string; timestamp: string }[];
  smackText: string;
  setSmackText: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  userColorMap: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Smack Board
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[280px] overflow-y-auto space-y-2.5 pr-1">
          {messages.map((msg) => (
            <div key={msg.id} className="bg-secondary/40 p-3 rounded-xl border border-border/50">
              <div className="flex items-baseline justify-between mb-1 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AvatarBubble name={msg.name} color={userColorMap[msg.name]} size={20} />
                  <span className="font-bold text-sm truncate">{msg.name}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm pl-7">{msg.message}</p>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No smack yet. Be the first!</p>
            </div>
          )}
        </div>
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={smackText}
            onChange={(e) => setSmackText(e.target.value)}
            placeholder="Talk some smack..."
            maxLength={280}
            disabled={isPending}
          />
          <Button type="submit" disabled={!smackText.trim() || isPending}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
