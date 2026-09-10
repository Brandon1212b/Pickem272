import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamLogo } from "@/lib/team-logos";
import { cn } from "@/lib/utils";

export const TEAM_RECORD_STRUCTURE = [
  { conf: "AFC", divisions: [
    { div: "East", teams: ["BUF", "MIA", "NE", "NYJ"] },
    { div: "North", teams: ["BAL", "CIN", "CLE", "PIT"] },
    { div: "South", teams: ["HOU", "IND", "JAX", "TEN"] },
    { div: "West", teams: ["DEN", "KC", "LAC", "LV"] },
  ]},
  { conf: "NFC", divisions: [
    { div: "East", teams: ["DAL", "NYG", "PHI", "WAS"] },
    { div: "North", teams: ["CHI", "DET", "GB", "MIN"] },
    { div: "South", teams: ["ATL", "CAR", "NO", "TB"] },
    { div: "West", teams: ["ARI", "LAR", "SF", "SEA"] },
  ]},
] as const;

export const ALL_NFL_TEAMS = TEAM_RECORD_STRUCTURE.flatMap((conference) =>
  conference.divisions.flatMap((division) => division.teams),
);

export interface TeamRecord {
  team: string;
  wins: number;
  losses: number;
}

interface TeamRecordsCardProps {
  records: TeamRecord[];
  title: string;
  description?: string;
}

export function TeamRecordsCard({ records, title, description }: TeamRecordsCardProps) {
  const recordMap = Object.fromEntries(records.map((record) => [record.team, record]));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {TEAM_RECORD_STRUCTURE.map(({ conf, divisions }) => (
          <div key={conf}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">{conf}</p>
            <div className="space-y-1.5">
              {divisions.map(({ div, teams }) => {
                const divTeams = [...teams].sort((a, b) =>
                  (recordMap[b]?.wins ?? 0) - (recordMap[a]?.wins ?? 0) ||
                  (recordMap[a]?.losses ?? 0) - (recordMap[b]?.losses ?? 0),
                );
                return (
                  <div key={div} className="flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground w-7 shrink-0 font-medium">{div}</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {divTeams.map((team) => {
                        const { wins, losses } = recordMap[team] ?? { wins: 0, losses: 0 };
                        return (
                          <div
                            key={team}
                            className={cn(
                              "flex flex-col items-center gap-0.5 p-1.5 rounded-lg border min-w-[44px]",
                              "bg-secondary/30 border-border/50",
                            )}
                          >
                            <TeamLogo team={team} size={22} />
                            <span className="text-[8px] font-bold uppercase text-muted-foreground">{team}</span>
                            <span className="text-[10px] font-bold text-foreground">{wins}-{losses}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}