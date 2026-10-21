import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth";
import {
  useListMatches,
  useGetUserPicks,
  useGetSeasonStatus,
  useSavePicks,
  useAutofillPicks,
  useGetLeaderboard,
  useGetLeaderboardTrends,
  getGetUserPicksQueryKey,
  getListMatchesQueryKey,
  getGetLeaderboardQueryKey,
  getGetLeaderboardTrendsQueryKey,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Save, Shuffle, Wand2, Star, RotateCcw, CheckCircle2, Pencil, Plane, Clock, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/lib/team-logos";
import { getTeamColor } from "@/lib/team-colors";

type AutofillMode = "home" | "away" | "favorites" | "random";

const AUTOFILL_OPTIONS: { mode: AutofillMode; label: string; icon: React.ElementType; description: string }[] = [
  { mode: "home", label: "Home", icon: Wand2, description: "Pick the home team for every unpicked game." },
  { mode: "away", label: "Away", icon: Plane, description: "Pick the away team for every unpicked game." },
  { mode: "favorites", label: "Favs", icon: Star, description: "Pick the Vegas spread favorite for every unpicked game." },
  { mode: "random", label: "Random", icon: Shuffle, description: "Randomly pick a winner for every unpicked game." },
];

// Sept 3, 2026 8:20 PM ET — estimated NFL 2026 season opener
const PICKS_LOCK_DATE = new Date("2026-09-04T00:20:00.000Z");

const NFL_STRUCTURE = [
  { conf: "AFC", divisions: [
    { div: "East",  teams: ["BUF", "MIA", "NE",  "NYJ"] },
    { div: "North", teams: ["BAL", "CIN", "CLE", "PIT"] },
    { div: "South", teams: ["HOU", "IND", "JAX", "TEN"] },
    { div: "West",  teams: ["DEN", "KC",  "LAC", "LV"]  },
  ]},
  { conf: "NFC", divisions: [
    { div: "East",  teams: ["DAL", "NYG", "PHI", "WAS"] },
    { div: "North", teams: ["CHI", "DET", "GB",  "MIN"] },
    { div: "South", teams: ["ATL", "CAR", "NO",  "TB"]  },
    { div: "West",  teams: ["ARI", "LAR", "SF",  "SEA"] },
  ]},
];

const ALL_TEAMS = NFL_STRUCTURE.flatMap((c) => c.divisions.flatMap((d) => d.teams));

function useCountdown(target: Date) {
  const calc = () => {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return null;
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  };
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(id);
  }, []);
  return left;
}

function getTeamSpread(pointSpread: string | null | undefined, team: "home" | "away"): string {
  if (!pointSpread || pointSpread === "") return "*";
  if (pointSpread === "PK") return "PK";
  const num = parseFloat(pointSpread);
  if (isNaN(num) || num === 0) return "PK";
  const val = team === "home" ? num : -num;
  return val > 0 ? `+${val}` : `${val}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function Picks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [viewingUserId, setViewingUserId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const uid = params.get("user");
    return uid ? Number(uid) : null;
  });
  const [showOnlyDiffers, setShowOnlyDiffers] = useState(false);
  const [showH2HShare, setShowH2HShare] = useState(false);

  const { data: status, isLoading: loadingStatus } = useGetSeasonStatus();
  const { data: matches, isLoading: loadingMatches } = useListMatches(undefined, {
    query: { queryKey: getListMatchesQueryKey(), refetchInterval: 30_000 },
  });
  const { data: picks, isLoading: loadingPicks } = useGetUserPicks(user?.id || 0, {
    query: {
      enabled: !!user?.id,
      queryKey: getGetUserPicksQueryKey(user?.id || 0),
      refetchInterval: 30_000,
    },
  });
  const { data: leaderboard } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey(), refetchInterval: 60_000 },
  });
  const { data: trends } = useGetLeaderboardTrends({
    query: { queryKey: getGetLeaderboardTrendsQueryKey(), refetchInterval: 60_000 },
  });
  const { data: viewingPicks } = useGetUserPicks(viewingUserId ?? 0, {
    query: {
      enabled: !!viewingUserId && viewingUserId !== user?.id,
      queryKey: getGetUserPicksQueryKey(viewingUserId ?? 0),
    },
  });
  const [, setLocation] = useLocation();

  // Sync URL when viewing user changes (shareable links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (viewingUserId && viewingUserId !== user?.id) {
      params.set("user", String(viewingUserId));
    } else {
      params.delete("user");
    }
    const search = params.toString();
    const newPath = "/picks" + (search ? "?" + search : "");
    if (window.location.pathname + window.location.search !== newPath) {
      window.history.replaceState(null, "", newPath);
    }
  }, [viewingUserId, user?.id]);

  const effectivePicks = viewingUserId && viewingUserId !== user?.id ? viewingPicks : picks;
  const viewingUser = leaderboard?.find((e) => e.userId === viewingUserId);
  const isComparing = !!viewingUserId && viewingUserId !== user?.id;

  // Accuracy summary helpers
  const computeRecord = (pickList: typeof picks) => {
    if (!matches || !pickList) return { correct: 0, wrong: 0, total: 0 };
    let correct = 0, wrong = 0;
    for (const m of matches) {
      if (!m.isCompleted || !m.winner) continue;
      const p = pickList.find((pp) => pp.matchId === m.id);
      if (!p?.selectedTeam) continue;
      if (p.selectedTeam === m.winner) correct++; else wrong++;
    }
    return { correct, wrong, total: correct + wrong };
  };
  const myRecord = computeRecord(picks);
  const theirRecord = isComparing ? computeRecord(viewingPicks) : null;

  const differCount = useMemo(() => {
    if (!isComparing || !picks || !viewingPicks) return 0;
    let n = 0;
    for (const m of matches ?? []) {
      const mine = picks.find((p) => p.matchId === m.id)?.selectedTeam;
      const theirs = viewingPicks.find((p) => p.matchId === m.id)?.selectedTeam;
      if (mine && theirs && mine !== theirs) n++;
    }
    return n;
  }, [isComparing, picks, viewingPicks, matches]);

  // Weekly points for H2H graphic (only completed weeks)
  const weeklyPointsH2H = useMemo(() => {
    if (!isComparing || !matches || !picks || !viewingPicks) return [];
    const weeks = [...new Set(matches.filter(m => m.isCompleted).map(m => m.week))].sort((a, b) => a - b);
    return weeks.map(week => {
      const weekMatches = matches.filter(m => m.week === week && m.isCompleted);
      const myPts = weekMatches.reduce((sum, m) => {
        const p = picks.find(pp => pp.matchId === m.id);
        return sum + (p?.pointsEarned ?? 0);
      }, 0);
      const theirPts = weekMatches.reduce((sum, m) => {
        const p = viewingPicks.find(pp => pp.matchId === m.id);
        return sum + (p?.pointsEarned ?? 0);
      }, 0);
      return { week, myPts, theirPts };
    });
  }, [isComparing, matches, picks, viewingPicks]);

  // Projected top/bottom 4 for both players
  const computeProjected = (pickList: typeof picks) => {
    if (!matches || !pickList) return { top4: [], bottom4: [] };
    const records: Record<string, { wins: number; losses: number }> = {};
    for (const team of ALL_TEAMS) records[team] = { wins: 0, losses: 0 };
    for (const match of matches) {
      const pick = pickList.find((p) => p.matchId === match.id);
      if (!pick?.selectedTeam) continue;
      const pickedTeam = pick.selectedTeam;
      const otherTeam = pickedTeam === match.homeTeam ? match.awayTeam : match.homeTeam;
      records[pickedTeam].wins += 1;
      records[otherTeam].losses += 1;
    }
    const sorted = Object.entries(records)
      .map(([team, rec]) => ({ team, ...rec }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    return {
      top4: sorted.slice(0, 4),
      bottom4: sorted.slice(-4).reverse(),
    };
  };
  const myProjected = useMemo(() => computeProjected(picks), [matches, picks]);
  const theirProjected = useMemo(() => computeProjected(viewingPicks), [matches, viewingPicks]);

  // Extra H2H stats for the snapshot
  const h2hStats = useMemo(() => {
    if (!isComparing || weeklyPointsH2H.length === 0) return null;
    let myWeekWins = 0;
    let theirWeekWins = 0;
    let ties = 0;
    let myTotal = 0;
    let theirTotal = 0;
    let biggestGap = { week: 0, diff: 0, winner: "" as "me" | "them" | "" };

    for (const w of weeklyPointsH2H) {
      myTotal += w.myPts;
      theirTotal += w.theirPts;
      if (w.myPts > w.theirPts) myWeekWins++;
      else if (w.theirPts > w.myPts) theirWeekWins++;
      else ties++;

      const gap = Math.abs(w.myPts - w.theirPts);
      if (gap > biggestGap.diff) {
        biggestGap = {
          week: w.week,
          diff: gap,
          winner: w.myPts > w.theirPts ? "me" : "them",
        };
      }
    }

    const myRank = leaderboard?.find((e) => e.userId === user?.id)?.rank;
    const theirRank = viewingUser?.rank;

    // Recent rank change from trends (positive = improved)
    let myRankChange = 0;
    let theirRankChange = 0;
    if (trends && trends.length >= 2 && trends[0].weeklyPoints.length >= 2) {
      const numWeeks = trends[0].weeklyPoints.length;
      const rankAt = (weekIdx: number) =>
        [...trends]
          .sort((a, b) => (b.weeklyPoints[weekIdx] ?? 0) - (a.weeklyPoints[weekIdx] ?? 0))
          .map((u, i) => ({ userId: u.userId, rank: i + 1 }));
      const prevRanks = rankAt(numWeeks - 2);
      const currRanks = rankAt(numWeeks - 1);
      const prevMy = prevRanks.find((r) => r.userId === user?.id)?.rank;
      const currMy = currRanks.find((r) => r.userId === user?.id)?.rank;
      const prevTheir = prevRanks.find((r) => r.userId === viewingUser?.userId)?.rank;
      const currTheir = currRanks.find((r) => r.userId === viewingUser?.userId)?.rank;
      if (prevMy && currMy) myRankChange = prevMy - currMy;
      if (prevTheir && currTheir) theirRankChange = prevTheir - currTheir;
    }
    const pointDiff = myTotal - theirTotal;

    const myTopTeams = new Set(myProjected.top4.map((t) => t.team));
    const theirTopTeams = new Set(theirProjected.top4.map((t) => t.team));
    const myBotTeams = new Set(myProjected.bottom4.map((t) => t.team));
    const theirBotTeams = new Set(theirProjected.bottom4.map((t) => t.team));

    const overlappingTop = [...myTopTeams].filter((t) => theirTopTeams.has(t));
    const overlappingBottom = [...myBotTeams].filter((t) => theirBotTeams.has(t));

    const completedWeeks = weeklyPointsH2H.length;
    const totalWeeks = 18;

    const myName = (user?.name || "You").split(" ")[0];
    const theirName = (viewingUser?.name || "Them").split(" ")[0];

    // One-line story
    let story = "";
    if (pointDiff > 0) {
      story = `${myName} leads by ${pointDiff} pts and is ${myWeekWins}-${theirWeekWins}${ties ? `-${ties}` : ""} in weeks`;
    } else if (pointDiff < 0) {
      story = `${theirName} leads by ${-pointDiff} pts and is ${theirWeekWins}-${myWeekWins}${ties ? `-${ties}` : ""} in weeks`;
    } else {
      story = `Tied on points · ${myWeekWins}-${theirWeekWins}${ties ? `-${ties}` : ""} in weeks`;
    }

    return {
      myWeekWins,
      theirWeekWins,
      ties,
      myTotal,
      theirTotal,
      pointDiff,
      biggestGap,
      myRank,
      theirRank,
      myRankChange,
      theirRankChange,
      overlappingTop,
      overlappingBottom,
      completedWeeks,
      totalWeeks,
      story,
    };
  }, [isComparing, weeklyPointsH2H, leaderboard, user?.id, viewingUser, myProjected, theirProjected, trends]);


  const [localPicks, setLocalPicks] = useState<Record<number, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingAutofill, setPendingAutofill] = useState<AutofillMode | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resettingPicks, setResettingPicks] = useState(false);
  const [showFutureWeeks, setShowFutureWeeks] = useState(false);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("all");
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>(["1"]);

  // Tutorial popup — only on first visit and only while season is still pre-season
  const [showTutorial, setShowTutorial] = useState(() => {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem("picks_tutorial_seen")) return false;
    return true;
  });

  // Lock state: show locked view when server has all picks AND user hasn't explicitly unlocked
  const picksUnlockedKey = `picks_unlocked_${user?.id}`;
  const [isUnlocked, setIsUnlocked] = useState(() =>
    localStorage.getItem(`picks_unlocked_${user?.id}`) === "true"
  );

  // Skip resetting hasUnsavedChanges after autofill refetch
  const skipHasUnsavedChangesReset = useRef(false);
  const weekListTopRef = useRef<HTMLDivElement>(null);

  // Refs for reading inside callbacks
  const localPicksRef = useRef<Record<number, string>>({});
  const matchesLengthRef = useRef(0);
  useEffect(() => { localPicksRef.current = localPicks; }, [localPicks]);
  useEffect(() => { matchesLengthRef.current = matches?.length ?? 288; }, [matches]);

  // Load picks from server — skip resetting hasUnsavedChanges if autofill just ran
  useEffect(() => {
    if (!picks) return;
    const picksMap = picks.reduce((acc, p) => { acc[p.matchId] = p.selectedTeam; return acc; }, {} as Record<number, string>);
    setLocalPicks(picksMap);
    if (!skipHasUnsavedChangesReset.current) {
      setHasUnsavedChanges(false);
    }
    skipHasUnsavedChangesReset.current = false;
  }, [picks]);

  // Derived: show locked view when all picks are on server AND user hasn't unlocked AND no pending unsaved changes
  const totalMatches = matches?.length ?? 288;
  const allPicksOnServer = !loadingPicks && !loadingMatches && (picks?.length ?? 0) >= totalMatches && totalMatches > 0;
  const showLockedView = allPicksOnServer && !isUnlocked && !hasUnsavedChanges;

  const countdown = useCountdown(PICKS_LOCK_DATE);

  const savePicks = useSavePicks({
    mutation: {
      onSuccess: () => {
        toast.success("Picks saved!");
        setHasUnsavedChanges(false);
        queryClient.invalidateQueries({ queryKey: getGetUserPicksQueryKey(user?.id || 0) });
        // If all 288 submitted, clear the unlock flag so locked view shows
        const count = Object.values(localPicksRef.current).filter(Boolean).length;
        if (count >= matchesLengthRef.current && matchesLengthRef.current > 0) {
          localStorage.removeItem(picksUnlockedKey);
          setIsUnlocked(false);
        }
      },
      onError: () => toast.error("Failed to save picks"),
    },
  });

  const autofillPicks = useAutofillPicks({
    mutation: {
      onSuccess: (newPicks) => {
        toast.success(`Filled in ${newPicks.length} picks!`);
        // Set flag so the refetch doesn't reset hasUnsavedChanges
        skipHasUnsavedChangesReset.current = true;
        setLocalPicks((prev) => {
          const merged = { ...prev };
           // Keep manual picks made in this editing session; autofill only
           // supplies matches that were still empty locally.
           for (const p of newPicks) {
             if (!(p.matchId in merged)) merged[p.matchId] = p.selectedTeam;
           }
          return merged;
        });
        setHasUnsavedChanges(true);
        // Refetch so allPicksOnServer updates correctly
        queryClient.invalidateQueries({ queryKey: getGetUserPicksQueryKey(user?.id || 0) });
      },
      onError: () => toast.error("Failed to autofill picks"),
    },
  });

  const handlePick = (matchId: number, team: string) => {
    if (status?.mode === "in-season") return;
    setLocalPicks((prev) => {
      if (prev[matchId] === team) return { ...prev, [matchId]: "" };
      return { ...prev, [matchId]: team };
    });
    setHasUnsavedChanges(true);
  };

  const handleReset = async () => {
    setShowResetConfirm(false);
    setResettingPicks(true);
    try {
      const res = await fetch(`/api/picks/user/${user!.id}/clear`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setLocalPicks({});
      setHasUnsavedChanges(false);
      localStorage.removeItem(picksUnlockedKey);
      setIsUnlocked(false);
      queryClient.invalidateQueries({ queryKey: getGetUserPicksQueryKey(user?.id || 0) });
      toast.success("All picks cleared");
    } catch {
      toast.error("Failed to reset picks");
    } finally {
      setResettingPicks(false);
    }
  };

  const handleUnlock = () => {
    localStorage.setItem(picksUnlockedKey, "true");
    setIsUnlocked(true);
  };

  const handleSave = () => {
    if (!user) return;
    const picksArray = Object.entries(localPicks)
      .filter(([, team]) => team)
      .map(([matchId, selectedTeam]) => ({ matchId: Number(matchId), selectedTeam, isLock: false }));
    savePicks.mutate({ data: { userId: user.id, picks: picksArray } });
  };

  const confirmAutofill = () => {
    if (!user || !pendingAutofill) return;
    autofillPicks.mutate({ data: { userId: user.id, mode: pendingAutofill } });
    setPendingAutofill(null);
  };

  const dismissTutorial = () => {
    localStorage.setItem("picks_tutorial_seen", "true");
    setShowTutorial(false);
  };

  type MatchList = NonNullable<typeof matches>;
  const matchesByWeek = useMemo(() => {
    if (!matches) return {} as Record<number, MatchList>;
    return matches.reduce((acc, m) => {
      if (!acc[m.week]) acc[m.week] = [];
      acc[m.week].push(m);
      return acc;
    }, {} as Record<number, MatchList>);
  }, [matches]);

  const teamCompletionStatus = useMemo(() => {
    if (!matches) return {} as Record<string, { total: number; picked: number; complete: boolean }>;
    const status: Record<string, { total: number; picked: number; complete: boolean }> = {};
    for (const team of ALL_TEAMS) {
      const teamMatches = matches.filter((m) => m.homeTeam === team || m.awayTeam === team);
      const picked = teamMatches.filter((m) => localPicks[m.id]).length;
      status[team] = {
        total: teamMatches.length,
        picked,
        complete: teamMatches.length > 0 && picked === teamMatches.length,
      };
    }
    return status;
  }, [matches, localPicks]);

  const filteredMatchesByWeek = useMemo(() => {
    if (selectedTeamFilter === "all") return matchesByWeek;
    return Object.fromEntries(
      Object.entries(matchesByWeek)
        .map(([week, weekMatches]) => [
          week,
          weekMatches.filter(
            (m) => m.homeTeam === selectedTeamFilter || m.awayTeam === selectedTeamFilter,
          ),
        ])
        .filter(([, weekMatches]) => weekMatches.length > 0),
    );
  }, [matchesByWeek, selectedTeamFilter]);

  useEffect(() => {
    if (selectedTeamFilter === "all") {
      setExpandedWeeks(["1"]);
    } else {
      setExpandedWeeks(Object.keys(filteredMatchesByWeek));
    }
  }, [selectedTeamFilter, filteredMatchesByWeek]);

  // Team records from picks (computed here for both views)
  // Also tracks accuracy on completed games involving each team
  const teamRecordsSorted = useMemo(() => {
    if (!matches) return [];
    // Pre-populate all 32 teams so they always appear even with no picks yet
    const records: Record<string, { wins: number; losses: number; correct: number; decided: number }> = {};
    for (const team of ALL_TEAMS) records[team] = { wins: 0, losses: 0, correct: 0, decided: 0 };
    for (const match of matches) {
      const pick = effectivePicks?.find((p) => p.matchId === match.id);
      if (!pick?.selectedTeam) continue;
      const pickedTeam = pick.selectedTeam;
      const otherTeam = pickedTeam === match.homeTeam ? match.awayTeam : match.homeTeam;
      records[pickedTeam].wins += 1;
      records[otherTeam].losses += 1;

      // Accuracy: only count completed games where a winner was decided
      if (match.isCompleted && match.winner) {
        for (const team of [match.homeTeam, match.awayTeam]) {
          if (!records[team]) continue;
          records[team].decided += 1;
          if (pick.selectedTeam === match.winner) records[team].correct += 1;
        }
      }
    }
    return Object.entries(records)
      .map(([team, rec]) => ({
        team,
        ...rec,
        pct: rec.decided > 0 ? Math.round((rec.correct / rec.decided) * 100) : null,
      }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  }, [matches, effectivePicks]);

  // Actual current records + your accuracy on each team's decided games
  const actualRecordsSorted = useMemo(() => {
    if (!matches) return [];
    const records: Record<string, { wins: number; losses: number; correct: number; decided: number }> = {};
    for (const team of ALL_TEAMS) records[team] = { wins: 0, losses: 0, correct: 0, decided: 0 };
    for (const match of matches) {
      if (!match.isCompleted) continue;
      // Real record only counts games with a winner
      if (match.winner) {
        const loser = match.winner === match.homeTeam ? match.awayTeam : match.homeTeam;
        if (records[match.winner]) records[match.winner].wins += 1;
        if (records[loser]) records[loser].losses += 1;
      }
      // Accuracy includes ties (nobody correct)
      const pick = effectivePicks?.find((p) => p.matchId === match.id);
      if (!pick?.selectedTeam) continue;
      for (const team of [match.homeTeam, match.awayTeam]) {
        if (!records[team]) continue;
        records[team].decided += 1;
        if (match.winner && pick.selectedTeam === match.winner) records[team].correct += 1;
      }
    }
    return Object.entries(records)
      .map(([team, rec]) => ({
        team,
        ...rec,
        pct: rec.decided > 0 ? Math.round((rec.correct / rec.decided) * 100) : null,
      }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  }, [matches, effectivePicks]);

  if (loadingStatus || loadingMatches || loadingPicks) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalPicks = Object.values(localPicks).filter(Boolean).length;
  const serverPickCount = picks?.length ?? 0;
  const unpickedCount = totalMatches - totalPicks;
  const allPicked = totalPicks === totalMatches && totalMatches > 0;
  const pendingOption = AUTOFILL_OPTIONS.find((o) => o.mode === pendingAutofill);

  const activeWeek = (status?.lastCompletedWeek ?? 0) + 1;
  const allWeekEntries = Object.entries(filteredMatchesByWeek)
    .map(([wStr, wMatches]) => ({ week: Number(wStr), matches: wMatches }));
  const currentWeekEntry = allWeekEntries.find((w) => w.week === activeWeek);
  const pastWeekEntries = allWeekEntries.filter((w) => w.week < activeWeek).sort((a, b) => b.week - a.week);
  const futureWeekEntries = allWeekEntries.filter((w) => w.week > activeWeek).sort((a, b) => a.week - b.week);
  const teamFilterActive = selectedTeamFilter !== "all";

  const teamFilterControl = (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Browse by Team</p>
      <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter}>
        <SelectTrigger
          className={cn(
            teamFilterActive && teamCompletionStatus[selectedTeamFilter]?.complete
              && "border-green-500 ring-1 ring-green-500/40",
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {teamFilterActive && (
              <div
                className={cn(
                  "rounded shrink-0",
                  teamCompletionStatus[selectedTeamFilter]?.complete && "border-2 border-green-500 p-0.5",
                )}
              >
                <TeamLogo team={selectedTeamFilter} size={20} />
              </div>
            )}
            <span className="truncate font-medium">
              {teamFilterActive ? selectedTeamFilter : "All Teams"}
            </span>
            {teamFilterActive && teamCompletionStatus[selectedTeamFilter]?.complete && (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            )}
          </div>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="all">All Teams</SelectItem>
          {NFL_STRUCTURE.map(({ conf, divisions }) => (
            <SelectGroup key={conf}>
              <SelectLabel className="text-[10px] uppercase tracking-wider">{conf}</SelectLabel>
              {divisions.flatMap(({ teams }) =>
                teams.map((team) => {
                  const { complete, picked, total } = teamCompletionStatus[team] ?? { complete: false, picked: 0, total: 0 };
                  return (
                    <SelectItem
                      key={team}
                      value={team}
                      textValue={team}
                      className="pr-8 [&>span:first-child]:hidden"
                    >
                      <div className="flex items-center gap-2 w-full pr-2">
                        <div
                          className={cn(
                            "rounded shrink-0",
                            complete && "border-2 border-green-500 p-0.5",
                          )}
                        >
                          <TeamLogo team={team} size={20} />
                        </div>
                        <span className="font-medium">{team}</span>
                        {complete ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 ml-auto" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                            {picked}/{total}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                }),
              )}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {teamFilterActive && (
        <p className="text-xs text-muted-foreground px-1">
          {teamCompletionStatus[selectedTeamFilter]?.picked ?? 0} of{" "}
          {teamCompletionStatus[selectedTeamFilter]?.total ?? 0} games picked for{" "}
          {selectedTeamFilter}
        </p>
      )}
    </div>
  );

  // ── TUTORIAL DIALOG ───────────────────────────────────────────────────────────
  // Never show once the season is underway
  const shouldShowTutorial = showTutorial && status?.mode !== "in-season" && (status?.lastCompletedWeek ?? 0) === 0;
  const TutorialDialog = (
    <AlertDialog open={shouldShowTutorial} onOpenChange={(open) => { if (!open) dismissTutorial(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>🏈 Before You Start Picking</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">You're picking the outright winner</strong> of each game — not against the spread. Whoever wins the game gives you the point, period.
              </p>
              <p>
                The numbers shown (like <span className="font-mono font-bold text-foreground">-3</span> or <span className="font-mono font-bold text-foreground">+7</span>) are early Vegas point spreads shown for <em>reference only</em>. They can help you gauge which team Vegas thinks is better — but your pick just needs to win the game outright.
              </p>
              <p>
                A <span className="font-mono font-bold text-foreground">*</span> means no odds data is available yet for that game — check back as the season gets closer!
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismissTutorial}>Got it, let's pick!</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ── WEEK CARD (for locked view) ───────────────────────────────────────────────
  const renderWeekCard = (weekNum: number, weekMatches: MatchList, isCurrent = false) => {
    const weekPicksData = weekMatches.map((m) => {
      const mine = localPicks[m.id] ?? picks?.find((p) => p.matchId === m.id)?.selectedTeam ?? "";
      const theirs = isComparing ? (viewingPicks?.find((p) => p.matchId === m.id)?.selectedTeam ?? "") : "";
      return { match: m, picked: isComparing ? theirs || mine : mine, mine, theirs };
    });
    const completedWithPick = weekPicksData.filter((p) => p.match.isCompleted && p.picked);
    const correct = completedWithPick.filter((p) => p.picked === p.match.winner).length;
    const wrong = completedWithPick.length - correct;

    const filtered = showOnlyDiffers && isComparing
      ? weekPicksData.filter((p) => p.mine && p.theirs && p.mine !== p.theirs)
      : weekPicksData;

    return (
      <Card key={weekNum} className={isCurrent ? "border-primary/30 bg-primary/5" : undefined}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="font-bold text-base">
              Week {weekNum}
              {isCurrent && <span className="ml-2 text-[10px] text-primary font-semibold uppercase tracking-wider">Current</span>}
            </h3>
            {completedWithPick.length > 0 ? (
              <span className={`text-sm font-bold ${correct > wrong ? "text-green-500" : "text-destructive"}`}>
                {correct}-{wrong}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Pending</span>
            )}
            {isComparing && (
              <button
                type="button"
                onClick={() => setShowOnlyDiffers((v) => !v)}
                className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  showOnlyDiffers ? "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300" : "border-border text-muted-foreground"
                }`}
              >
                {showOnlyDiffers ? "Showing diffs" : "Show diffs only"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {filtered.map(({ match, picked, mine, theirs }) => {
              const displayPick = isComparing ? (theirs || mine) : picked;
              if (!displayPick) {
                return (
                  <div key={match.id} className="w-10 h-10 rounded-xl border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">
                    ?
                  </div>
                );
              }
              const differs = isComparing && mine && theirs && mine !== theirs;
              const isCorrect = match.isCompleted && displayPick === match.winner;
              const isWrong = match.isCompleted && !!match.winner && displayPick !== match.winner;
              return (
                <div key={match.id} className="relative group">
                  <div className={`rounded-xl border-2 p-1.5 flex items-center gap-1 ${
                    differs ? "border-amber-500 bg-amber-500/10" :
                    isCorrect ? "border-green-500 bg-green-500/10" :
                    isWrong   ? "border-destructive/40 bg-destructive/5 opacity-70" :
                                "border-border/50"
                  }`}>
                    {isComparing && mine && (
                      <div className="flex flex-col items-center">
                        <TeamLogo team={mine} size={20} />
                        <span className="text-[7px] text-muted-foreground">You</span>
                      </div>
                    )}
                    {isComparing && theirs && (
                      <div className="flex flex-col items-center">
                        <TeamLogo team={theirs} size={20} />
                        <span className="text-[7px] text-muted-foreground">{viewingUser?.name.split(" ")[0] ?? "Them"}</span>
                      </div>
                    )}
                    {!isComparing && <TeamLogo team={displayPick} size={28} />}
                  </div>
                  {isCorrect && !differs && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold leading-none">✓</div>
                  )}
                  {isWrong && !differs && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive rounded-full flex items-center justify-center text-[8px] text-white font-bold leading-none">✗</div>
                  )}
                  {differs && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold leading-none">≠</div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── LOCKED / SUBMITTED VIEW ───────────────────────────────────────────────────
  if (showLockedView) {
    return (
      <div className="space-y-4 pb-8">
        {TutorialDialog}

        {/* Header */}
        <div className="sticky top-16 z-20 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b shadow-sm">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">
                {isComparing && viewingUser ? `${viewingUser.name}'s Picks` : "All Picks Submitted ✓"}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
                <span>{serverPickCount} picks locked in</span>
                {isComparing && theirRecord && (
                  <>
                    <span className="hidden sm:inline">·</span>
                    <span className="font-medium text-foreground">
                      You {myRecord.correct}-{myRecord.wrong}
                    </span>
                    <span>·</span>
                    <span className="font-medium text-foreground">
                      {(viewingUser?.name || "Them").split(" ")[0]} {theirRecord.correct}-{theirRecord.wrong}
                    </span>
                    {differCount > 0 && (
                      <>
                        <span>·</span>
                        <span
                          className="text-amber-600 dark:text-amber-400"
                          title="Games where you and the other player picked different teams"
                        >
                          Differ {differCount} of {matches?.length ?? 272}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Select
                value={leaderboard?.some(e => e.userId === viewingUserId) ? String(viewingUserId) : "me"}
                onValueChange={(v) => setViewingUserId(v === "me" ? null : Number(v))}
              >
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Compare with..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">My Picks</SelectItem>
                  {leaderboard?.filter((e) => e.userId !== user?.id).map((e) => (
                    <SelectItem key={e.userId} value={e.userId.toString()}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isComparing && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2"
                  onClick={() => setShowH2HShare(true)}
                >
                  Share
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {countdown && status?.mode === "pre-season" && (
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 rounded-full px-3 py-1.5">
                  <Clock className="w-3 h-3" />
                  <span>
                    Locks in <strong className="text-foreground">{countdown.days}d {countdown.hours}h {countdown.minutes}m</strong>
                  </span>
                </div>
              )}
              {status?.mode === "pre-season" && (
                <Button variant="outline" size="sm" onClick={handleUnlock} className="gap-1.5">
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Picks
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Countdown (mobile) */}
        {countdown && status?.mode === "pre-season" && (
          <div className="sm:hidden flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-xl px-4 py-2.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Locks in <strong className="text-foreground">{countdown.days}d {countdown.hours}h {countdown.minutes}m {countdown.seconds}s</strong></span>
          </div>
        )}

        {/* Who's Hot callout */}
        {leaderboard && leaderboard.length > 1 && (() => {
          try {
            const hot = [...leaderboard].sort((a, b) => (b.correctPicks ?? 0) - (a.correctPicks ?? 0))[0];
            if (!hot || hot.userId === user?.id) return null;
            return (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border bg-amber-500/5 border-amber-500/20 text-sm">
                <span className="text-lg">🔥</span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Who's Hot</p>
                  <p className="font-semibold">{hot.name} is leading with {hot.correctPicks}-{hot.wrongPicks}</p>
                </div>
              </div>
            );
          } catch {
            return null;
          }
        })()}

        {/* Team records */}
        {teamRecordsSorted.length > 0 && (() => {
          const actualMap = Object.fromEntries(actualRecordsSorted.map((r) => [r.team, r]));
          const projectedMap = Object.fromEntries(teamRecordsSorted.map((r) => [r.team, r]));
          return (
            <Card className="w-full overflow-hidden">
              <CardHeader className="pb-2 px-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">Team Records</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Tap a team to filter. See the key for what each field means.</p>
                  </div>
                  {/* Example key */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg border bg-secondary/30 border-border/50 min-w-[52px]">
                      <img
                        src="https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png"
                        alt="NFL"
                        width={22}
                        height={22}
                        className="object-contain"
                      />
                      <span className="text-[8px] font-bold uppercase text-muted-foreground">NFL</span>
                      <span className="text-[10px] font-bold text-green-500 tabular-nums leading-tight">7-2 · 78%</span>
                      <span className="text-[8px] text-muted-foreground tabular-nums leading-tight">proj 12-5</span>
                    </div>
                    <div className="text-[8px] leading-tight text-muted-foreground space-y-1 hidden sm:block">
                      <div className="flex items-center gap-1"><span className="text-green-500 font-bold">7-2</span> actual record</div>
                      <div className="flex items-center gap-1"><span className="text-green-500 font-bold">78%</span> % you have right so far</div>
                      <div className="flex items-center gap-1"><span>proj 12-5</span> what you projected</div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 px-3 sm:px-6">
                {NFL_STRUCTURE.map(({ conf, divisions }) => (
                  <div key={conf}>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">{conf}</p>
                    <div className="space-y-1.5">
                      {divisions.map(({ div, teams }) => {
                        const divTeams = [...teams].sort((a, b) =>
                          (actualMap[b]?.wins ?? 0) - (actualMap[a]?.wins ?? 0) ||
                          (actualMap[a]?.losses ?? 0) - (actualMap[b]?.losses ?? 0)
                        );
                        return (
                          <div key={div} className="flex items-center gap-2 w-full">
                            <span className="text-[9px] text-muted-foreground w-7 shrink-0 font-medium">{div}</span>
                            <div className="flex gap-1.5 flex-1 min-w-0 w-full">
                              {divTeams.map((team) => {
                                const actual = actualMap[team] ?? { wins: 0, losses: 0, pct: null };
                                const projected = projectedMap[team] ?? { wins: 0, losses: 0 };
                                const isSelected = selectedTeamFilter === team;
                                return (
                                  <button
                                    key={team}
                                    onClick={() => {
                                      const next = isSelected ? "all" : team;
                                      setSelectedTeamFilter(next);
                                      if (next !== "all") {
                                        setTimeout(() => {
                                          document.getElementById("week-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
                                        }, 50);
                                      }
                                    }}
                                    className={cn(
                                      "flex flex-1 basis-0 min-w-0 flex-col items-center gap-0.5 p-1.5 rounded-lg border transition-all",
                                      isSelected
                                        ? "bg-primary/15 border-primary ring-1 ring-primary/40"
                                        : "bg-secondary/30 border-border/50 hover:bg-secondary/60 hover:border-border"
                                    )}
                                  >
                                    <TeamLogo team={team} size={22} />
                                    <span className={cn("text-[8px] font-bold uppercase", isSelected ? "text-primary" : "text-muted-foreground")}>{team}</span>
                                    <span className={cn(
                                      "text-[10px] font-bold tabular-nums leading-tight",
                                      actual.pct === null ? "text-muted-foreground" : actual.pct >= 70 ? "text-green-500" : actual.pct >= 50 ? "text-amber-500" : "text-destructive"
                                    )}>
                                      {actual.wins}-{actual.losses}{actual.pct !== null ? ` · ${actual.pct}%` : ""}
                                    </span>
                                    <span className="text-[8px] text-muted-foreground tabular-nums leading-tight">proj {projected.wins}-{projected.losses}</span>
                                  </button>
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
        })()}

        {teamFilterControl}

        <div id="week-list" className="space-y-3">
        {/* Current week */}
        {currentWeekEntry && renderWeekCard(currentWeekEntry.week, currentWeekEntry.matches, true)}

        {/* Past weeks — most recent first */}
        {pastWeekEntries.map(({ week, matches: wm }) => renderWeekCard(week, wm))}

        {/* Future weeks — collapsed section (all weeks shown when team filter active) */}
        {futureWeekEntries.length > 0 && (
          teamFilterActive ? (
            <div className="space-y-3">
              {futureWeekEntries.map(({ week, matches: wm }) => renderWeekCard(week, wm))}
            </div>
          ) : (
          <div>
            <button
              onClick={() => setShowFutureWeeks((v) => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 w-full"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showFutureWeeks ? "rotate-180" : ""}`} />
              {showFutureWeeks ? "Hide" : "Show"} future weeks ({futureWeekEntries.length})
            </button>
            {showFutureWeeks && (
              <div className="space-y-3 mt-2">
                {futureWeekEntries.map(({ week, matches: wm }) => renderWeekCard(week, wm))}
              </div>
            )}
          </div>
          )
        )}
        </div>

      {/* Head-to-Head Share Graphic (available in locked view) */}
      <Dialog open={showH2HShare} onOpenChange={setShowH2HShare}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0 bg-background">
          <div className="p-5 space-y-4" id="h2h-share-graphic">
            {/* Header */}
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-black tracking-tight">
                <span className="text-blue-500">{(user?.name || "You").split(" ")[0]}</span>
                <span className="text-muted-foreground font-normal"> vs </span>
                <span className="text-orange-500">{(viewingUser?.name || "Them").split(" ")[0]}</span>
              </h2>
              {h2hStats && (
                <p className="text-sm font-medium text-foreground">{h2hStats.story}</p>
              )}
            </div>

            {/* Season progress */}
            {h2hStats && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                  <span>Season progress</span>
                  <span>{h2hStats.completedWeeks} of {h2hStats.totalWeeks} weeks</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${(h2hStats.completedWeeks / h2hStats.totalWeeks) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Records + Rank */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-secondary/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-blue-500 font-semibold">{(user?.name || "You").split(" ")[0]}</p>
                <p className="text-3xl font-black leading-none mt-1">{myRecord.correct}-{myRecord.wrong}</p>
                <p className="text-xs mt-1 font-medium text-muted-foreground flex items-center justify-center gap-1">
                  Rank {h2hStats?.myRank ?? "—"}
                  {h2hStats && h2hStats.myRankChange !== 0 && (
                    <span className={h2hStats.myRankChange > 0 ? "text-green-500" : "text-red-500"}>
                      {h2hStats.myRankChange > 0 ? "↑" : "↓"}{Math.abs(h2hStats.myRankChange)}
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded-xl border bg-secondary/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-orange-500 font-semibold">{(viewingUser?.name || "Them").split(" ")[0]}</p>
                <p className="text-3xl font-black leading-none mt-1">{theirRecord?.correct ?? 0}-{theirRecord?.wrong ?? 0}</p>
                <p className="text-xs mt-1 font-medium text-muted-foreground flex items-center justify-center gap-1">
                  Rank {h2hStats?.theirRank ?? "—"}
                  {h2hStats && h2hStats.theirRankChange !== 0 && (
                    <span className={h2hStats.theirRankChange > 0 ? "text-green-500" : "text-red-500"}>
                      {h2hStats.theirRankChange > 0 ? "↑" : "↓"}{Math.abs(h2hStats.theirRankChange)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Biggest gap */}
            {h2hStats && h2hStats.biggestGap.diff > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                Biggest week gap: <span className="font-semibold text-foreground">Week {h2hStats.biggestGap.week}</span> by {h2hStats.biggestGap.diff} pts
                ({h2hStats.biggestGap.winner === "me" ? (user?.name || "You").split(" ")[0] : (viewingUser?.name || "Them").split(" ")[0]})
              </p>
            )}

            {/* Weekly points bar chart */}
            {weeklyPointsH2H.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
                  <span className="w-8 shrink-0" />
                  <span className="flex-1 text-center text-blue-500">{(user?.name || "You").split(" ")[0]}</span>
                  <span className="flex-1 text-center text-orange-500">{(viewingUser?.name || "Them").split(" ")[0]}</span>
                  <span className="w-12" />
                </div>
                {weeklyPointsH2H.map((w) => {
                  const max = Math.max(w.myPts, w.theirPts, 1);
                  const tied = w.myPts === w.theirPts;
                  const myWins = w.myPts > w.theirPts || tied;
                  const theirWins = w.theirPts > w.myPts || tied;
                  return (
                    <div key={w.week} className="flex items-center gap-2 text-xs">
                      <span className="w-8 shrink-0 text-muted-foreground font-medium">W{w.week}</span>
                      <div className="flex-1 flex items-center gap-1">
                        <div className="flex-1 h-5 bg-secondary/60 rounded overflow-hidden flex justify-end relative">
                          <div
                            className={`h-full rounded-r ${myWins ? "bg-blue-500" : "bg-muted-foreground/30"}`}
                            style={{ width: `${(w.myPts / max) * 100}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
                            {w.myPts}
                          </span>
                        </div>
                        <div className="flex-1 h-5 bg-secondary/60 rounded overflow-hidden relative">
                          <div
                            className={`h-full rounded-l ${theirWins ? "bg-orange-500" : "bg-muted-foreground/30"}`}
                            style={{ width: `${(w.theirPts / max) * 100}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
                            {w.theirPts}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Projected teams — all in one row */}
            <div className="space-y-2">
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Projected Finish</p>
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                <div className="space-y-1.5">
                  <p className="font-semibold uppercase tracking-wider text-blue-500 text-center">Top 4</p>
                  {myProjected.top4.map((t) => (
                    <div key={t.team} className="flex justify-center">
                      <div className={`flex items-center gap-1 ${h2hStats?.overlappingTop.includes(t.team) ? "bg-muted/60 rounded-full px-1.5 py-0.5" : ""}`}>
                        <TeamLogo team={t.team} size={20} />
                        <span className="tabular-nums text-muted-foreground">{t.wins}-{t.losses}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="font-semibold uppercase tracking-wider text-blue-500 text-center">Last 4</p>
                  {myProjected.bottom4.map((t) => (
                    <div key={t.team} className="flex justify-center">
                      <div className={`flex items-center gap-1 ${h2hStats?.overlappingBottom.includes(t.team) ? "bg-muted/60 rounded-full px-1.5 py-0.5" : ""}`}>
                        <TeamLogo team={t.team} size={20} />
                        <span className="tabular-nums text-muted-foreground">{t.wins}-{t.losses}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="font-semibold uppercase tracking-wider text-orange-500 text-center">Top 4</p>
                  {theirProjected.top4.map((t) => (
                    <div key={t.team} className="flex justify-center">
                      <div className={`flex items-center gap-1 ${h2hStats?.overlappingTop.includes(t.team) ? "bg-muted/60 rounded-full px-1.5 py-0.5" : ""}`}>
                        <TeamLogo team={t.team} size={20} />
                        <span className="tabular-nums text-muted-foreground">{t.wins}-{t.losses}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="font-semibold uppercase tracking-wider text-orange-500 text-center">Last 4</p>
                  {theirProjected.bottom4.map((t) => (
                    <div key={t.team} className="flex justify-center">
                      <div className={`flex items-center gap-1 ${h2hStats?.overlappingBottom.includes(t.team) ? "bg-muted/60 rounded-full px-1.5 py-0.5" : ""}`}>
                        <TeamLogo team={t.team} size={20} />
                        <span className="tabular-nums text-muted-foreground">{t.wins}-{t.losses}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {differCount > 0 && (
              <p className="text-center text-xs text-muted-foreground pt-1">
                Differ on {differCount} of {matches?.length ?? 272} games
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

  // ── EDITING VIEW ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-28">
      {TutorialDialog}

      {/* Sticky progress bar */}
      <div className="sticky top-16 z-20 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b shadow-sm">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">My Picks</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalPicks} of {totalMatches} picks
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status?.mode === "in-season" ? (
              <Badge variant="destructive" className="text-xs">Season Locked</Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full h-8 px-3 text-xs"
                onClick={() => setShowResetConfirm(true)}
                disabled={totalPicks === 0 || resettingPicks}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Countdown */}
      {countdown && status?.mode === "pre-season" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-xl px-4 py-2.5">
          <Clock className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span>
            Picks lock in{" "}
            <strong className="text-foreground">{countdown.days}d {countdown.hours}h {countdown.minutes}m {countdown.seconds}s</strong>
            {" "}— once the season starts, no more changes!
          </span>
        </div>
      )}

      {/* Team records (if picks exist) */}
      {teamRecordsSorted.length > 0 && (() => {
        const actualMap = Object.fromEntries(actualRecordsSorted.map((r) => [r.team, r]));
        const projectedMap = Object.fromEntries(teamRecordsSorted.map((r) => [r.team, r]));
        return (
          <Card className="overflow-hidden">
            <CardHeader className="pb-1 pt-3 px-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold">Team Records</CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Actual (colored) · proj is your projected finish</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 text-[8px] font-semibold">
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />70+</span>
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />50+</span>
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-destructive" />{'<'}50</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {NFL_STRUCTURE.map(({ conf, divisions }) => (
                <div key={conf}>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{conf}</p>
                  <div className="space-y-1">
                    {divisions.map(({ div, teams }) => {
                      const divTeams = [...teams].sort((a, b) =>
                        (actualMap[b]?.wins ?? 0) - (actualMap[a]?.wins ?? 0) ||
                        (actualMap[a]?.losses ?? 0) - (actualMap[b]?.losses ?? 0)
                      );
                      return (
                        <div key={div} className="flex items-center gap-1.5 w-full">
                          <span className="text-[8px] text-muted-foreground w-6 shrink-0 font-medium">{div}</span>
                          <div className="flex gap-1 flex-1 min-w-0 w-full">
                            {divTeams.map((team) => {
                              const actual = actualMap[team] ?? { wins: 0, losses: 0, pct: null };
                              const projected = projectedMap[team] ?? { wins: 0, losses: 0 };
                              const isSelected = selectedTeamFilter === team;
                              return (
                                <button
                                  key={team}
                                  onClick={() => setSelectedTeamFilter(isSelected ? "all" : team)}
                                  className={cn(
                                    "flex flex-1 basis-0 min-w-0 flex-col items-center gap-0 p-1 rounded-lg border transition-all",
                                    isSelected
                                      ? "bg-primary/15 border-primary ring-1 ring-primary/40"
                                      : "bg-secondary/30 border-border/50 hover:bg-secondary/60 hover:border-border"
                                  )}
                                >
                                  <TeamLogo team={team} size={18} />
                                  <span className={cn("text-[7px] font-bold uppercase", isSelected ? "text-primary" : "text-muted-foreground")}>{team}</span>
                                  <span className={cn(
                                    "text-[9px] font-bold tabular-nums leading-tight",
                                    actual.pct === null ? "text-muted-foreground" : actual.pct >= 70 ? "text-green-500" : actual.pct >= 50 ? "text-amber-500" : "text-destructive"
                                  )}>
                                    {actual.wins}-{actual.losses}{actual.pct !== null ? ` · ${actual.pct}%` : ""}
                                  </span>
                                  <span className="text-[7px] text-muted-foreground tabular-nums leading-tight">proj {projected.wins}-{projected.losses}</span>
                                </button>
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
      })()}

      {teamFilterControl}

      {/* Autofill section */}
      {status?.mode === "pre-season" && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Quick Pick Autofill</p>
          <div className="flex gap-1.5 flex-nowrap">
            {AUTOFILL_OPTIONS.map(({ mode, label, icon: Icon }) => (
              <Button
                key={mode}
                variant="outline"
                size="sm"
                className="flex-1 min-w-0 px-2 gap-1"
                onClick={() => setPendingAutofill(mode)}
                disabled={autofillPicks.isPending || unpickedCount === 0}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Week accordions / flat list */}
      {teamFilterActive ? (
        // Team filter active — one match per week, no accordion needed
        <div className="space-y-2" ref={weekListTopRef}>
          {Object.entries(filteredMatchesByWeek).map(([week, weekMatches]) => {
            const weekPickCount = weekMatches.filter((m) => localPicks[m.id]).length;
            const weekComplete = weekPickCount === weekMatches.length;
            return (
              <div key={week} className="bg-card border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    Week {week}
                    {weekComplete && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                  </span>
                  <span className={`text-xs font-normal ${weekComplete ? "text-green-500 font-semibold" : "text-muted-foreground"}`}>
                    {weekPickCount}/{weekMatches.length}
                  </span>
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  {weekMatches.map((match) => {
                    const selectedTeam = localPicks[match.id] ?? "";
                    const awaySpread = getTeamSpread(match.pointSpread, "away");
                    const homeSpread = getTeamSpread(match.pointSpread, "home");
                    const awayPicked = selectedTeam === match.awayTeam;
                    const homePicked = selectedTeam === match.homeTeam;
                    const awayColor = getTeamColor(match.awayTeam);
                    const homeColor = getTeamColor(match.homeTeam);
                    const isLocked = status?.mode === "in-season";
                    return (
                      <div key={match.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-secondary/20 border">
                        {match.gameTime && (
                          <div className="hidden sm:flex w-20 shrink-0 text-[10px] text-muted-foreground font-medium leading-tight text-center flex-col items-center">
                            {match.gameTime.split(" ").map((part, i) => <span key={i}>{part}</span>)}
                          </div>
                        )}
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <button
                            className={`h-12 text-sm font-medium flex items-center justify-start px-2.5 gap-2 relative rounded-lg border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full ${awayPicked ? "text-foreground" : "border-border bg-card text-foreground hover:bg-secondary/50 hover:border-muted-foreground/30"}`}
                            style={awayPicked ? { borderColor: awayColor, backgroundColor: `${awayColor}22` } : {}}
                            onClick={() => handlePick(match.id, match.awayTeam)}
                            disabled={isLocked}
                          >
                            <TeamLogo team={match.awayTeam} size={24} className="shrink-0" />
                            <span className="truncate font-semibold">{match.awayTeam}</span>
                            <span className={`ml-auto text-[10px] font-mono shrink-0 ${awayPicked ? "opacity-70" : "text-muted-foreground"}`}>{awaySpread}</span>
                          </button>
                          <button
                            className={`h-12 text-sm font-medium flex items-center justify-start px-2.5 gap-2 relative rounded-lg border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full ${homePicked ? "text-foreground" : "border-border bg-card text-foreground hover:bg-secondary/50 hover:border-muted-foreground/30"}`}
                            style={homePicked ? { borderColor: homeColor, backgroundColor: `${homeColor}22` } : {}}
                            onClick={() => handlePick(match.id, match.homeTeam)}
                            disabled={isLocked}
                          >
                            <TeamLogo team={match.homeTeam} size={24} className="shrink-0" />
                            <span className="truncate font-semibold">{match.homeTeam}</span>
                            <span className={`ml-auto text-[10px] font-mono shrink-0 ${homePicked ? "opacity-70" : "text-muted-foreground"}`}>{homeSpread}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Prev / Next team navigation */}
          {(() => {
            const idx = ALL_TEAMS.indexOf(selectedTeamFilter);
            const prevTeam = idx > 0 ? ALL_TEAMS[idx - 1] : null;
            const nextTeam = idx < ALL_TEAMS.length - 1 ? ALL_TEAMS[idx + 1] : null;
            return (
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  onClick={() => { if (prevTeam) { setSelectedTeamFilter(prevTeam); setTimeout(() => { const el = weekListTopRef.current; if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: "smooth" }); }, 0); } }}
                  disabled={!prevTeam}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-card text-sm font-medium transition-colors hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed flex-1 justify-start"
                >
                  <span className="text-muted-foreground">←</span>
                  {prevTeam && <TeamLogo team={prevTeam} size={20} />}
                  <span className="truncate">{prevTeam ?? "—"}</span>
                </button>
                <button
                  onClick={() => { if (nextTeam) { setSelectedTeamFilter(nextTeam); setTimeout(() => { const el = weekListTopRef.current; if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: "smooth" }); }, 0); } }}
                  disabled={!nextTeam}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-card text-sm font-medium transition-colors hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed flex-1 justify-end"
                >
                  <span className="truncate">{nextTeam ?? "—"}</span>
                  {nextTeam && <TeamLogo team={nextTeam} size={20} />}
                  <span className="text-muted-foreground">→</span>
                </button>
              </div>
            );
          })()}
        </div>
      ) : (
        <Accordion
          type="multiple"
          value={expandedWeeks}
          onValueChange={setExpandedWeeks}
          className="space-y-3"
        >
          {Object.entries(filteredMatchesByWeek).map(([week, weekMatches]) => {
            const weekPickCount = weekMatches.filter((m) => localPicks[m.id]).length;
            const weekComplete = weekPickCount === weekMatches.length;

            return (
              <AccordionItem key={week} value={week} className="bg-card border rounded-xl overflow-hidden px-1">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <span className="font-semibold text-base flex items-center gap-2">
                      Week {week}
                      {weekComplete && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                    </span>
                    <span className={`text-sm font-normal ${weekComplete ? "text-green-500 font-semibold" : "text-muted-foreground"}`}>
                      {weekPickCount}/{weekMatches.length}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2 pt-2">
                    {/* Header labels */}
                    <div className="flex items-center gap-2 pb-0.5">
                      <div className="hidden sm:block w-20 shrink-0" />
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <span className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Away</span>
                        <span className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Home</span>
                      </div>
                      <div className="w-2 shrink-0" />
                    </div>
                    {weekMatches.map((match) => {
                      const selectedTeam = localPicks[match.id] ?? "";
                      const awaySpread = getTeamSpread(match.pointSpread, "away");
                      const homeSpread = getTeamSpread(match.pointSpread, "home");
                      const awayPicked = selectedTeam === match.awayTeam;
                      const homePicked = selectedTeam === match.homeTeam;
                      const awayColor = getTeamColor(match.awayTeam);
                      const homeColor = getTeamColor(match.homeTeam);
                      const isLocked = status?.mode === "in-season";

                      return (
                        <div key={match.id} className="flex items-center gap-2 p-2 rounded-xl bg-secondary/20 border">
                          {/* Game time */}
                          {match.gameTime && (
                            <div className="hidden sm:flex w-20 shrink-0 text-[10px] text-muted-foreground font-medium leading-tight text-center flex-col items-center">
                              {match.gameTime.split(" ").map((part, i) => (
                                <span key={i}>{part}</span>
                              ))}
                            </div>
                          )}

                          <div className="flex-1 grid grid-cols-2 gap-2">
                            {/* Away team button */}
                            <button
                              className={`h-12 text-sm font-medium flex items-center justify-start px-2.5 gap-2 relative rounded-lg border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full ${
                                awayPicked ? "text-foreground" : "border-border bg-card text-foreground hover:bg-secondary/50 hover:border-muted-foreground/30"
                              }`}
                              style={awayPicked ? { borderColor: awayColor, backgroundColor: `${awayColor}22` } : {}}
                              onClick={() => handlePick(match.id, match.awayTeam)}
                              disabled={isLocked}
                            >
                              <TeamLogo team={match.awayTeam} size={24} className="shrink-0" />
                              <span className="truncate font-semibold">{match.awayTeam}</span>
                              <span className={`ml-auto text-[10px] font-mono shrink-0 ${awayPicked ? "opacity-70" : "text-muted-foreground"}`}>
                                {awaySpread}
                              </span>
                            </button>

                            {/* Home team button */}
                            <button
                              className={`h-12 text-sm font-medium flex items-center justify-start px-2.5 gap-2 relative rounded-lg border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full ${
                                homePicked ? "text-foreground" : "border-border bg-card text-foreground hover:bg-secondary/50 hover:border-muted-foreground/30"
                              }`}
                              style={homePicked ? { borderColor: homeColor, backgroundColor: `${homeColor}22` } : {}}
                              onClick={() => handlePick(match.id, match.homeTeam)}
                              disabled={isLocked}
                            >
                              <TeamLogo team={match.homeTeam} size={24} className="shrink-0" />
                              <span className="truncate font-semibold">{match.homeTeam}</span>
                              <span className={`ml-auto text-[10px] font-mono shrink-0 ${homePicked ? "opacity-70" : "text-muted-foreground"}`}>
                                {homeSpread}
                              </span>
                            </button>
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
      )}

      {/* Floating save button */}
      {status?.mode === "pre-season" && (
        <div className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-50 flex flex-col gap-3 items-end">
          {allPicked && !hasUnsavedChanges && (
            <div className="flex items-center gap-2 bg-green-500/20 border border-green-500/40 text-green-400 rounded-full px-4 py-2 text-sm font-medium shadow">
              <CheckCircle2 className="w-4 h-4" />
              All {totalMatches} picks submitted!
            </div>
          )}
          {hasUnsavedChanges && (
            <Button
              size="lg"
              className={`rounded-full shadow-xl h-14 px-6 text-base ${allPicked ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
              onClick={handleSave}
              disabled={savePicks.isPending}
            >
              {allPicked ? (
                <>
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  {savePicks.isPending ? "Submitting…" : "Submit All Picks"}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  {savePicks.isPending ? "Saving…" : "Save Picks"}
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Reset confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all picks?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all {totalPicks} of your picks from the server across all 18 weeks. You'll need to re-pick all {totalMatches} games. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReset}
            >
              Yes, reset all picks
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Autofill confirmation */}
      <AlertDialog open={!!pendingAutofill} onOpenChange={(open) => !open && setPendingAutofill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fill in unpicked games?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingOption?.description}{" "}
              {unpickedCount > 0
                ? `This will fill ${unpickedCount} game${unpickedCount !== 1 ? "s" : ""} you haven't picked yet.`
                : "You have no unpicked games left."}
              {" "}Games you've already picked won't be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAutofill} disabled={autofillPicks.isPending || unpickedCount === 0}>
              Yes, fill them in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Head-to-Head Share Graphic */}
      <Dialog open={showH2HShare} onOpenChange={setShowH2HShare}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0 bg-background">
          <div className="p-5 space-y-4" id="h2h-share-graphic">
            {/* Header */}
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-black tracking-tight">
                <span className="text-blue-500">{(user?.name || "You").split(" ")[0]}</span>
                <span className="text-muted-foreground font-normal"> vs </span>
                <span className="text-orange-500">{(viewingUser?.name || "Them").split(" ")[0]}</span>
              </h2>
              {h2hStats && (
                <p className="text-sm font-medium text-foreground">{h2hStats.story}</p>
              )}
            </div>

            {/* Season progress */}
            {h2hStats && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                  <span>Season progress</span>
                  <span>{h2hStats.completedWeeks} of {h2hStats.totalWeeks} weeks</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${(h2hStats.completedWeeks / h2hStats.totalWeeks) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Records + Rank */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-secondary/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-blue-500 font-semibold">{(user?.name || "You").split(" ")[0]}</p>
                <p className="text-3xl font-black leading-none mt-1">{myRecord.correct}-{myRecord.wrong}</p>
                <p className="text-xs mt-1 font-medium text-muted-foreground flex items-center justify-center gap-1">
                  Rank {h2hStats?.myRank ?? "—"}
                  {h2hStats && h2hStats.myRankChange !== 0 && (
                    <span className={h2hStats.myRankChange > 0 ? "text-green-500" : "text-red-500"}>
                      {h2hStats.myRankChange > 0 ? "↑" : "↓"}{Math.abs(h2hStats.myRankChange)}
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded-xl border bg-secondary/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-orange-500 font-semibold">{(viewingUser?.name || "Them").split(" ")[0]}</p>
                <p className="text-3xl font-black leading-none mt-1">{theirRecord?.correct ?? 0}-{theirRecord?.wrong ?? 0}</p>
                <p className="text-xs mt-1 font-medium text-muted-foreground flex items-center justify-center gap-1">
                  Rank {h2hStats?.theirRank ?? "—"}
                  {h2hStats && h2hStats.theirRankChange !== 0 && (
                    <span className={h2hStats.theirRankChange > 0 ? "text-green-500" : "text-red-500"}>
                      {h2hStats.theirRankChange > 0 ? "↑" : "↓"}{Math.abs(h2hStats.theirRankChange)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Biggest gap */}
            {h2hStats && h2hStats.biggestGap.diff > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                Biggest week gap: <span className="font-semibold text-foreground">Week {h2hStats.biggestGap.week}</span> by {h2hStats.biggestGap.diff} pts
                ({h2hStats.biggestGap.winner === "me" ? (user?.name || "You").split(" ")[0] : (viewingUser?.name || "Them").split(" ")[0]})
              </p>
            )}

            {/* Weekly points bar chart */}
            {weeklyPointsH2H.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
                  <span className="w-8 shrink-0" />
                  <span className="flex-1 text-center text-blue-500">{(user?.name || "You").split(" ")[0]}</span>
                  <span className="flex-1 text-center text-orange-500">{(viewingUser?.name || "Them").split(" ")[0]}</span>
                  <span className="w-12" />
                </div>
                {weeklyPointsH2H.map((w) => {
                  const max = Math.max(w.myPts, w.theirPts, 1);
                  const tied = w.myPts === w.theirPts;
                  const myWins = w.myPts > w.theirPts || tied;
                  const theirWins = w.theirPts > w.myPts || tied;
                  return (
                    <div key={w.week} className="flex items-center gap-2 text-xs">
                      <span className="w-8 shrink-0 text-muted-foreground font-medium">W{w.week}</span>
                      <div className="flex-1 flex items-center gap-1">
                        <div className="flex-1 h-5 bg-secondary/60 rounded overflow-hidden flex justify-end relative">
                          <div
                            className={`h-full rounded-r ${myWins ? "bg-blue-500" : "bg-muted-foreground/30"}`}
                            style={{ width: `${(w.myPts / max) * 100}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
                            {w.myPts}
                          </span>
                        </div>
                        <div className="flex-1 h-5 bg-secondary/60 rounded overflow-hidden relative">
                          <div
                            className={`h-full rounded-l ${theirWins ? "bg-orange-500" : "bg-muted-foreground/30"}`}
                            style={{ width: `${(w.theirPts / max) * 100}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
                            {w.theirPts}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Projected teams — all in one row */}
            <div className="space-y-2">
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Projected Finish</p>
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                <div className="space-y-1.5">
                  <p className="font-semibold uppercase tracking-wider text-blue-500 text-center">Top 4</p>
                  {myProjected.top4.map((t) => (
                    <div key={t.team} className="flex justify-center">
                      <div className={`flex items-center gap-1 ${h2hStats?.overlappingTop.includes(t.team) ? "bg-muted/60 rounded-full px-1.5 py-0.5" : ""}`}>
                        <TeamLogo team={t.team} size={20} />
                        <span className="tabular-nums text-muted-foreground">{t.wins}-{t.losses}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="font-semibold uppercase tracking-wider text-blue-500 text-center">Last 4</p>
                  {myProjected.bottom4.map((t) => (
                    <div key={t.team} className="flex justify-center">
                      <div className={`flex items-center gap-1 ${h2hStats?.overlappingBottom.includes(t.team) ? "bg-muted/60 rounded-full px-1.5 py-0.5" : ""}`}>
                        <TeamLogo team={t.team} size={20} />
                        <span className="tabular-nums text-muted-foreground">{t.wins}-{t.losses}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="font-semibold uppercase tracking-wider text-orange-500 text-center">Top 4</p>
                  {theirProjected.top4.map((t) => (
                    <div key={t.team} className="flex justify-center">
                      <div className={`flex items-center gap-1 ${h2hStats?.overlappingTop.includes(t.team) ? "bg-muted/60 rounded-full px-1.5 py-0.5" : ""}`}>
                        <TeamLogo team={t.team} size={20} />
                        <span className="tabular-nums text-muted-foreground">{t.wins}-{t.losses}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="font-semibold uppercase tracking-wider text-orange-500 text-center">Last 4</p>
                  {theirProjected.bottom4.map((t) => (
                    <div key={t.team} className="flex justify-center">
                      <div className={`flex items-center gap-1 ${h2hStats?.overlappingBottom.includes(t.team) ? "bg-muted/60 rounded-full px-1.5 py-0.5" : ""}`}>
                        <TeamLogo team={t.team} size={20} />
                        <span className="tabular-nums text-muted-foreground">{t.wins}-{t.losses}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {differCount > 0 && (
              <p className="text-center text-xs text-muted-foreground pt-1">
                Differ on {differCount} of {matches?.length ?? 272} games
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

