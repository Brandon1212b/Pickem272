import React from "react";
import { 
  useGetLeaderboard, 
  useGetLeaderboardTrends, 
  useGetWeeklyExtremes, 
  useGetPickPopularity,
  useGetSeasonStatus,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TeamLogo } from "@/lib/team-logos";

function PickerAvatars({ names, limit = 5 }: { names: string[]; limit?: number }) {
  const shown = names.slice(0, limit);
  const extra = names.length - limit;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((name, i) => (
          <div
            key={i}
            title={name}
            className="w-6 h-6 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-[9px] font-bold text-primary ring-0 select-none shrink-0"
          >
            {name[0]?.toUpperCase()}
          </div>
        ))}
        {extra > 0 && (
          <div className="w-6 h-6 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[9px] font-medium text-muted-foreground shrink-0">
            +{extra}
          </div>
        )}
      </div>
      {names.length > 0 && (
        <span className="ml-1.5 text-xs text-muted-foreground font-medium">{names.length}</span>
      )}
    </div>
  );
}

export default function Leaderboard() {
  const { data: leaderboard, isLoading: loadingBoard } = useGetLeaderboard();
  const { data: trends, isLoading: loadingTrends } = useGetLeaderboardTrends();
  const { data: extremes, isLoading: loadingExtremes } = useGetWeeklyExtremes();
  const { data: popularity, isLoading: loadingPopularity } = useGetPickPopularity();
  const { data: status } = useGetSeasonStatus();

  if (loadingBoard || loadingTrends || loadingExtremes || loadingPopularity) {
    return <div className="space-y-4"><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const chartData = [];
  if (trends && trends.length > 0) {
    const numWeeks = trends[0].weeklyPoints.length;
    for (let w = 0; w < numWeeks; w++) {
      const dataPoint: any = { week: `W${w + 1}` };
      trends.forEach(user => { dataPoint[user.name] = user.weeklyPoints[w]; });
      chartData.push(dataPoint);
    }
  }

  const chartColors = [
    "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
    "hsl(var(--chart-4))", "hsl(var(--chart-5))",
  ];

  const activeWeek = (status?.lastCompletedWeek ?? 0) + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Standings</h1>
        <p className="text-muted-foreground">League performance and analytics</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>League Standings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard?.map((entry) => (
                <TableRow key={entry.userId}>
                  <TableCell className="font-bold text-lg">{entry.rank}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold">{entry.name}</span>
                      <span className="inline-flex gap-0.5">
                        {entry.badges.map((b, i) => (
                          <span key={i} title={b} className="text-base">
                            {b === "Perfect Week" ? "🏆" :
                             b === "The Cellar" ? "🪣" :
                             b === "Against the Grain" ? "⚡" :
                             b === "League Leader" ? "👑" : ""}
                          </span>
                        ))}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-lg">{entry.totalPoints}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {entry.correctPicks}-{entry.totalPicks - entry.correctPicks}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(extremes?.topUsers?.length || 0) + (extremes?.bottomUsers?.length || 0) > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {extremes?.topUsers && extremes.topUsers.length > 0 && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5 text-center">
                <div className="text-3xl mb-1">🔥</div>
                <h3 className="font-bold text-lg mb-0.5">Week {extremes.week} High Score</h3>
                <div className="font-semibold text-primary">
                  {extremes.topUsers.map(u => `${u.name} (${u.points} pts)`).join(', ')}
                </div>
              </CardContent>
            </Card>
          )}
          {extremes?.bottomUsers && extremes.bottomUsers.length > 0 && (
            <Card className="bg-destructive/5 border-destructive/20">
              <CardContent className="p-5 text-center">
                <div className="text-3xl mb-1">🥶</div>
                <h3 className="font-bold text-lg mb-0.5">Week {extremes.week} Low Score</h3>
                <div className="font-semibold text-destructive">
                  {extremes.bottomUsers.map(u => `${u.name} (${u.points} pts)`).join(', ')}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Season Trajectory</CardTitle>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="week" className="text-xs" tickLine={false} axisLine={false} />
                <YAxis className="text-xs" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }} />
                <Legend wrapperStyle={{ paddingTop: '16px' }} />
                {trends?.map((user, idx) => (
                  <Line key={user.userId} type="monotone" dataKey={user.name}
                    stroke={chartColors[idx % chartColors.length]} strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Pick popularity — active week, overlapping picker icons */}
      <Card>
        <CardHeader>
          <CardTitle>Week {activeWeek} Pick Split</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {popularity && popularity.length > 0 ? (
            popularity.map(pop => (
              <div key={pop.matchId} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  {/* Away team pickers */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <TeamLogo team={pop.awayTeam} size={22} />
                    <span className="text-sm font-medium truncate">{pop.awayTeam}</span>
                    <PickerAvatars names={pop.awayPickerNames} />
                  </div>

                  {/* Center divider */}
                  <span className="text-xs text-muted-foreground shrink-0">vs</span>

                  {/* Home team pickers */}
                  <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                    <PickerAvatars names={pop.homePickerNames} />
                    <span className="text-sm font-medium truncate text-right">{pop.homeTeam}</span>
                    <TeamLogo team={pop.homeTeam} size={22} />
                  </div>
                </div>

                {/* Bar */}
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden flex">
                  {pop.awayPickCount > 0 && (
                    <div className="h-full bg-primary rounded-l-full" style={{ width: `${pop.awayPickPct}%` }} />
                  )}
                  {pop.homePickCount > 0 && (
                    <div className="h-full bg-chart-2 rounded-r-full" style={{ width: `${pop.homePickPct}%` }} />
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-muted-foreground py-6">No picks made for Week {activeWeek} yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
