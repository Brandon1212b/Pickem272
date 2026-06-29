import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamLogo } from "@/lib/team-logos";
import { NFL_STRUCTURE } from "@/pages/picks";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function TeamRecordsCard({ teamRecordsSorted, recordMap }: any) {
  const { data: odds } = useQuery(["vegas-odds"], async () => {
    const res = await fetch('/api/odds');
    if (!res.ok) throw new Error('Failed');
    return res.json();
  }, { staleTime: 60_000 });

  const { data: avg } = useQuery(["team-averages"], async () => {
    const res = await fetch('/api/leaderboard/team-averages');
    if (!res.ok) throw new Error('Failed');
    return res.json();
  }, { staleTime: 60_000 });

  const oddsMap = Object.fromEntries((odds ?? []).map((o: any) => [o.team, o]));
  const avgMap = Object.fromEntries((avg ?? []).map((a: any) => [a.team, a]));

  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your Team Records</CardTitle>
          <p className="text-xs text-muted-foreground">How you have each team finishing based on your picks</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {NFL_STRUCTURE.map(({ conf, divisions }: any) => {
            const hasAny = divisions.some((d: any) => d.teams.some((t: any) => recordMap[t]));
            if (!hasAny) return null;
            return (
              <div key={conf}>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">{conf}</p>
                <div className="space-y-1.5">
                  {divisions.map(({ div, teams }: any) => {
                    const divTeams = teams.filter((t: any) => recordMap[t]).sort((a: any, b: any) => (recordMap[b].wins - recordMap[a].wins) || (recordMap[a].losses - recordMap[b].losses));
                    if (divTeams.length === 0) return null;
                    return (
                      <div key={div} className="flex items-center gap-2">
                        <span className="text-[9px] text-muted-foreground w-7 shrink-0 font-medium">{div}</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {divTeams.map((team: any) => {
                            const { wins, losses } = recordMap[team];
                            const o = oddsMap[team];
                            const ouWins = o?.ouWins ?? null;
                            const isAbove = typeof ouWins === "number" && wins > ouWins;
                            const isBelow = typeof ouWins === "number" && wins < ouWins;
                            const cardCls = isAbove ? "border-green-500 bg-green-500/10" : isBelow ? "border-destructive/40 bg-destructive/5" : "border-border/50";

                            return (
                              <button key={team} onClick={() => setSelectedTeam(team)} className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg border-2 min-w-[44px] ${cardCls}`}>
                                <TeamLogo team={team} size={22} />
                                <span className="text-[8px] font-bold text-muted-foreground uppercase">{team}</span>
                                <span className="text-[10px] font-bold text-foreground">{wins}-{losses}</span>
                              </button>
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

      <Dialog open={!!selectedTeam} onOpenChange={(open) => !open && setSelectedTeam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedTeam}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">Your projected wins: <strong>{recordMap[selectedTeam ?? ""]?.wins ?? 0}</strong></p>
            <p className="text-sm">Vegas O/U wins: <strong>{oddsMap[selectedTeam ?? ""]?.ouWins ?? "—"}</strong></p>
            <p className="text-sm">League average projected wins: <strong>{avgMap[selectedTeam ?? ""]?.averageWins?.toFixed(2) ?? "—"}</strong></p>
            <p className="text-xs text-muted-foreground mt-2">Odds last updated: {oddsMap[selectedTeam ?? ""]?.updatedAt ?? "—"}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
