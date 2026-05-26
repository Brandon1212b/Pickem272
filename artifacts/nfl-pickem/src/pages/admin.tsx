import React, { useState } from "react";
import { 
  useListMatches, 
  useGetSeasonStatus, 
  useSetMatchResult, 
  useUpdateSeasonMode, 
  useSendWebhookNotification,
  getListMatchesQueryKey,
  getGetSeasonStatusQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Tv } from "lucide-react";
import { TeamLogo } from "@/lib/team-logos";

interface LiveGame {
  id: string;
  name: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  completed: boolean;
  clock: string;
  period: number;
  winner: string | null;
}

interface LiveScores {
  week: number | null;
  games: LiveGame[];
}

function LiveScoresPanel() {
  const [data, setData] = useState<LiveScores | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScores = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/live-scores");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as LiveScores;
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tv className="w-5 h-5" />
              Live NFL Scores
            </CardTitle>
            <CardDescription>Real-time scores from ESPN. Click to refresh.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchScores} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : data ? "Refresh" : "Load Scores"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-destructive text-sm bg-destructive/10 rounded-lg p-3">
            Error fetching scores: {error}
          </div>
        )}
        {!data && !error && !loading && (
          <div className="text-muted-foreground text-sm text-center py-6">
            Click "Load Scores" to pull live NFL scoreboard from ESPN.
          </div>
        )}
        {data && (
          <div className="space-y-2">
            {data.week && <p className="text-xs text-muted-foreground mb-3">NFL Week {data.week}</p>}
            {data.games.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">No games found.</p>
            )}
            {data.games.map((game) => (
              <div key={game.id} className="flex items-center justify-between p-3 border rounded-xl bg-card">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <TeamLogo team={game.awayTeam} size={20} />
                    <span className={`text-sm font-semibold ${game.winner === game.awayTeam ? "text-primary" : ""}`}>
                      {game.awayTeam}
                    </span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{game.awayScore}</span>
                  <span className="text-muted-foreground text-xs">@</span>
                  <span className="text-lg font-bold tabular-nums">{game.homeScore}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-semibold ${game.winner === game.homeTeam ? "text-primary" : ""}`}>
                      {game.homeTeam}
                    </span>
                    <TeamLogo team={game.homeTeam} size={20} />
                  </div>
                </div>
                <div className="shrink-0 ml-2">
                  {game.completed ? (
                    <Badge variant="secondary" className="text-[10px]">Final</Badge>
                  ) : game.period > 0 ? (
                    <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">
                      {game.clock} Q{game.period}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">{game.status}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const queryClient = useQueryClient();
  
  const { data: status, isLoading: loadingStatus } = useGetSeasonStatus();
  const { data: matches, isLoading: loadingMatches } = useListMatches();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookMsg, setWebhookMsg] = useState("");

  const updateSeasonMode = useUpdateSeasonMode({
    mutation: {
      onSuccess: () => {
        toast.success("Season mode updated");
        queryClient.invalidateQueries({ queryKey: getGetSeasonStatusQueryKey() });
      }
    }
  });

  const setMatchResult = useSetMatchResult({
    mutation: {
      onSuccess: () => {
        toast.success("Match result set!");
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      }
    }
  });

  const sendWebhook = useSendWebhookNotification({
    mutation: {
      onSuccess: () => {
        toast.success("Notification sent!");
        setWebhookMsg("");
      },
      onError: () => {
        toast.error("Failed to send notification");
      }
    }
  });

  if (loadingStatus || loadingMatches) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const handleModeToggle = (checked: boolean) => {
    updateSeasonMode.mutate({ data: { mode: checked ? 'in-season' : 'pre-season' } });
  };

  const handleSetWinner = (matchId: number, winner: string) => {
    if (!winner) return;
    setMatchResult.mutate({ matchId, data: { winner } });
  };

  const handleSendWebhook = () => {
    if (!webhookUrl || !webhookMsg) return;
    sendWebhook.mutate({ data: { webhookUrl, message: webhookMsg } });
  };

  const matchesByWeek = matches?.reduce((acc, m) => {
    if (!acc[m.week]) acc[m.week] = [];
    acc[m.week].push(m);
    return acc;
  }, {} as Record<number, typeof matches>);

  return (
    <div className="space-y-6">
      <div className="bg-destructive/10 border-destructive/20 border text-destructive p-4 rounded-xl flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 shrink-0" />
        <div>
          <h2 className="font-bold">Commissioner Access Only</h2>
          <p className="text-sm opacity-80">Actions taken here affect all users in the league.</p>
        </div>
      </div>

      {/* Live Scores */}
      <LiveScoresPanel />

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
              checked={status?.mode === 'in-season'} 
              onCheckedChange={handleModeToggle}
              disabled={updateSeasonMode.isPending}
            />
          </div>
        </CardContent>
      </Card>

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
              onChange={e => setWebhookUrl(e.target.value)} 
              placeholder="https://discord.com/api/webhooks/..."
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea 
              value={webhookMsg} 
              onChange={e => setWebhookMsg(e.target.value)}
              placeholder="Don't forget to set your picks!"
            />
          </div>
          <Button onClick={handleSendWebhook} disabled={!webhookUrl || !webhookMsg || sendWebhook.isPending}>
            Blast Notification
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Match Results</CardTitle>
          <CardDescription>Set the winner for completed games.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="space-y-2">
            {matchesByWeek && Object.entries(matchesByWeek).map(([week, weekMatches]) => (
              <AccordionItem key={week} value={week} className="border rounded-xl px-2">
                <AccordionTrigger className="px-2 hover:no-underline font-semibold">
                  Week {week}
                  <span className="ml-auto mr-3 text-xs text-muted-foreground font-normal">
                    {weekMatches.filter(m => m.isCompleted).length}/{weekMatches.length} done
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 p-2">
                  {weekMatches.map(match => (
                    <div key={match.id} className="flex flex-col sm:flex-row gap-3 items-center justify-between p-3 border rounded-lg bg-card">
                      <div className="flex items-center gap-2 font-medium">
                        <TeamLogo team={match.awayTeam} size={18} />
                        <span>{match.awayTeam}</span>
                        <span className="text-muted-foreground text-xs">@</span>
                        <span>{match.homeTeam}</span>
                        <TeamLogo team={match.homeTeam} size={18} />
                        {match.gameTime && (
                          <span className="text-xs text-muted-foreground">· {match.gameTime}</span>
                        )}
                      </div>
                      
                      {match.isCompleted ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                          W: {match.winner}
                        </Badge>
                      ) : (
                        <Select onValueChange={(val) => handleSetWinner(match.id, val)}>
                          <SelectTrigger className="w-[160px] h-8 text-sm">
                            <SelectValue placeholder="Set winner…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={match.awayTeam}>{match.awayTeam} wins</SelectItem>
                            <SelectItem value={match.homeTeam}>{match.homeTeam} wins</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
