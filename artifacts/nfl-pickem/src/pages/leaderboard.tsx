import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  useGetLeaderboard,
  useGetLeaderboardTrends,
  useGetWeeklyExtremes,
  useGetUserPicks,
  useListMatches,
  getGetUserPicksQueryKey,
  getGetLeaderboardQueryKey,
  getGetLeaderboardTrendsQueryKey,
  getGetWeeklyExtremesQueryKey,
  getListMatchesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ALL_NFL_TEAMS, TeamRecordsCard } from "@/components/team-records-card";
import type { TeamRecord } from "@/components/team-records-card";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const FALLBACK_COLORS = [
  "#007AFF", "#FF6B35", "#34C759", "#AF52DE",
  "#FF2D55", "#5AC8FA", "#FFCC00", "#FF9500",
];

const BADGE_DEFS: Record<string, { name: string; desc: string }> = {
  "👑": { name: "League Leader",  desc: "Currently #1 in total points" },
  "🏆": { name: "Perfect Week",   desc: "Picked every game correctly in a completed week" },
  "🔥": { name: "Week High Score", desc: "Had the highest score that week" },
  "💩": { name: "Week Low Score",  desc: "Had the lowest score that week" },
};

function badgeEmoji(b: string): string {
  if (b === "Perfect Week") return "🏆";
  if (b === "League Leader") return "👑";
  return "";
}

// Truncate username to 10 characters with ellipsis
const truncateName = (name: string, maxLength: number = 10): string => {
  if (name.length > maxLength) {
    return name.substring(0, maxLength - 1) + '…';
  }
  return name;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface SeasonRecapData {
  achievements: { type: string; label: string; userId: number; name: string; avatar: string | null; value: number; detail: string; runnersUp?: { place: number; name: string; value: number }[] }[];
  weeklyWinners: {
    week: number;
    winners: { userId: number; name: string; avatar: string | null; points: number }[];
  }[];
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

function SeasonAwardsSection({
  data,
  loading,
  userColorMap,
}: {
  data: SeasonRecapData | null;
  loading: boolean;
  userColorMap: Record<string, string>;
}) {
  const [selectedAward, setSelectedAward] = useState<SeasonRecapData["achievements"][0] | null>(null);
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
            {data.achievements.map((a, i) => {
              const isTieList = a.name.includes(",");
              return (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/50 cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => setSelectedAward(a)}
              >
                <div className="shrink-0">
                  {isTieList ? (
                    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold">
                      {a.name.split(",").length}
                    </div>
                  ) : (
                    <AvatarBubble name={a.name} color={userColorMap[a.name] ?? a.avatar} size={36} />
                  )}
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
              );
            })}
          </CardContent>
        </Card>
      )}

      {data.weeklyWinners.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weekly Winners</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.weeklyWinners.map((w) => (
              <div key={w.week} className="flex items-start gap-3 py-1.5">
                <span className="text-xs font-bold text-muted-foreground w-10 shrink-0">Wk {w.week}</span>
                <div className="flex -space-x-1.5 pt-0.5 shrink-0">
                  {w.winners.map((winner) => (
                    <AvatarBubble
                      key={winner.userId}
                      name={winner.name}
                      color={userColorMap[winner.name] ?? winner.avatar}
                      size={26}
                    />
                  ))}
                </div>
                <span className="flex-1 min-w-0 text-sm font-semibold">
                  {w.winners.map((winner) => winner.name).join(", ")}
                </span>
                <span className="text-xs font-bold text-primary whitespace-nowrap">
                  {w.winners[0]?.points ?? 0} pts
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedAward} onOpenChange={(open) => !open && setSelectedAward(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedAward?.label}</DialogTitle>
            <DialogDescription>
              1st: {selectedAward?.name} ({selectedAward?.value})
              {selectedAward?.runnersUp && selectedAward.runnersUp.length > 0 ? "" : " — no other contenders yet"}
            </DialogDescription>
          </DialogHeader>
          {selectedAward?.runnersUp && selectedAward.runnersUp.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Place</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedAward.runnersUp.map((r) => (
                  <TableRow key={r.place}>
                    <TableCell className="font-medium">{r.place}{r.place === 2 ? "nd" : "rd"}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{r.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No 2nd or 3rd place yet — everyone else is further back or tied for 1st.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ... rest of the file remains the same as original ...
// (The full file is available locally; this is a partial to fix the syntax for the build)
