import React from "react";
import { TeamLogo } from "@/lib/team-logos";
import { getTeamColor } from "@/lib/team-colors";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Match {
  id: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  gameTime: string | null;
  isCompleted: boolean;
  winner: string | null;
  pointSpread?: string | null;
}

interface Pick {
  matchId: number;
  selectedTeam: string | null;
  pointsEarned?: number;
}

interface Props {
  team: string;
  matches: Match[];
  myPicks: Pick[];
  comparePicks?: Pick[] | null;
  compareName?: string | null;
}

export function InSeasonTeamSchedule({ team, matches, myPicks, comparePicks, compareName }: Props) {
  const sorted = [...matches].sort((a, b) => a.week - b.week);

  let correct = 0;
  let wrong = 0;
  for (const m of sorted) {
    if (!m.isCompleted || !m.winner) continue;
    const p = myPicks.find((pp) => pp.matchId === m.id);
    if (!p?.selectedTeam) continue;
    if (p.selectedTeam === m.winner) correct++;
    else wrong++;
  }
  const decided = correct + wrong;
  const pct = decided > 0 ? Math.round((correct / decided) * 100) : null;

  if (sorted.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10 text-sm">
        No games found for {team}.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Team accuracy header */}
      <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
        <TeamLogo team={team} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{team} schedule</p>
          <p className="text-xs text-muted-foreground">
            {decided === 0
              ? "No decided games yet"
              : `${correct}-${wrong} · ${pct}% so far`}
          </p>
        </div>
        {pct !== null && (
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
              pct >= 70 ? "text-green-500" : pct >= 50 ? "text-amber-500" : "text-destructive",
            )}
          >
            {pct}%
          </span>
        )}
      </div>

      {/* Compact schedule rows */}
      <div className="space-y-1.5">
        {sorted.map((match) => {
          const myPick = myPicks.find((p) => p.matchId === match.id)?.selectedTeam ?? null;
          const theirPick = comparePicks?.find((p) => p.matchId === match.id)?.selectedTeam ?? null;
          const differs = !!compareName && !!myPick && !!theirPick && myPick !== theirPick;

          const opponent = match.homeTeam === team ? match.awayTeam : match.homeTeam;
          const isHome = match.homeTeam === team;
          const isCompleted = !!match.isCompleted && !!match.winner;
          const isCorrect = isCompleted && myPick === match.winner;
          const isWrong = isCompleted && !!myPick && myPick !== match.winner;
          const isPending = !isCompleted;

          const rowBorder = isCorrect
            ? "border-green-500/40 bg-green-500/5"
            : isWrong
            ? "border-destructive/40 bg-destructive/5"
            : differs
            ? "border-amber-500/40 bg-amber-500/5"
            : "border-border bg-card";

          return (
            <div
              key={match.id}
              className={cn("flex items-center gap-2.5 rounded-xl border px-2.5 py-2", rowBorder)}
            >
              {/* Week */}
              <div className="w-9 shrink-0 text-center">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase">W{match.week}</div>
                {match.gameTime && (
                  <div className="text-[9px] text-muted-foreground leading-tight">
                    {match.gameTime.split(" ")[0]}
                  </div>
                )}
              </div>

              {/* Opponent */}
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-[10px] text-muted-foreground shrink-0">{isHome ? "vs" : "@"}</span>
                <TeamLogo team={opponent} size={18} />
                <span className="text-sm font-medium truncate">{opponent}</span>
              </div>

              {/* My pick */}
              <div className="flex items-center gap-1 shrink-0">
                {myPick ? (
                  <>
                    <TeamLogo team={myPick} size={16} />
                    <span className="text-xs font-semibold" style={{ color: getTeamColor(myPick) }}>
                      {myPick}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">No pick</span>
                )}
              </div>

              {/* Result */}
              <div className="w-5 shrink-0 flex justify-center">
                {isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {isWrong && <XCircle className="w-4 h-4 text-destructive" />}
                {isPending && <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>

              {/* Differ indicator */}
              {differs && (
                <span className="text-[9px] font-semibold uppercase text-amber-500 shrink-0">diff</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
