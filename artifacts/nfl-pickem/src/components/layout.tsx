import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { LogOut, LayoutDashboard, Grid, Trophy, HelpCircle, Shield } from "lucide-react";
import {
  useGetLeaderboard,
  useGetSeasonStatus,
  useGetUserPicksForWeek,
  useUpdateUser,
  getGetUserPicksForWeekQueryKey,
  getGetSeasonStatusQueryKey,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PROFILE_COLORS = [
  "#007AFF", "#FF6B35", "#34C759", "#AF52DE",
  "#FF2D55", "#5AC8FA", "#FFCC00", "#FF9500",
  "#00C7BE", "#30D158",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function UserAvatar({ name, color, size = "sm" }: { name: string; color?: string | null; size?: "sm" | "lg" }) {
  const bg = color ?? "#007AFF";
  const dim = size === "lg" ? "w-14 h-14 text-xl" : "w-8 h-8 text-xs";
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-bold text-white select-none shrink-0`}
      style={{ backgroundColor: bg }}
    >
      {getInitials(name)}
    </div>
  );
}

function NavStats({ userId }: { userId: number }) {
  const [, setLocation] = useLocation();
  const { data: leaderboard } = useGetLeaderboard();
  const { data: status } = useGetSeasonStatus();

  const lastWeek = status?.lastCompletedWeek ?? 0;
  const { data: weekPicks } = useGetUserPicksForWeek(userId, lastWeek, {
    query: { enabled: lastWeek > 0, queryKey: getGetUserPicksForWeekQueryKey(userId, lastWeek) },
  });

  const entry = leaderboard?.find((e) => e.userId === userId);
  const rank = entry?.rank ?? null;
  const weekCorrect = lastWeek > 0
    ? (weekPicks?.filter((p) => p.match?.isCompleted && p.match.winner === p.selectedTeam).length ?? null)
    : null;

  if (rank === null && weekCorrect === null) return null;

  return (
    <div className="flex items-center gap-1.5">
      {weekCorrect !== null && (
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors"
          title="View this week's results"
        >
          <span className="text-green-500 font-semibold">{weekCorrect} right</span>
          <span className="text-muted-foreground">wk{lastWeek}</span>
        </button>
      )}
      {rank !== null && (
        <button
          onClick={() => setLocation("/leaderboard")}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
          title="View standings"
        >
          #{rank}
        </button>
      )}
    </div>
  );
}

function ProfileButton() {
  const { user, setUser, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: (updated) => {
        if (user) setUser({ ...user, name: updated.name, avatar: updated.avatar ?? null });
        setOpen(false);
      },
    },
  });

  if (!user) return null;

  const avatarColor = user.avatar ?? "#007AFF";

  const handleSetColor = (color: string) => {
    updateUser.mutate({ userId: user.id, data: { avatar: color } });
    setUser({ ...user, avatar: color });
  };

  const isCommish = user.name === "Bfabs";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button title={`Profile: ${user.name}`}>
          <UserAvatar name={user.name} color={avatarColor} size="sm" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-4 space-y-4">
        <div className="text-center">
          <div className="flex justify-center mb-2">
            <UserAvatar name={user.name} color={avatarColor} size="lg" />
          </div>
          <p className="font-semibold">{user.name}</p>
          {isCommish && <span className="text-xs text-primary font-medium">Commissioner 👑</span>}
        </div>

        {/* Color picker */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Profile color</p>
          <div className="flex flex-wrap gap-2">
            {PROFILE_COLORS.map((color) => (
              <button
                key={color}
                className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${avatarColor === color ? "ring-2 ring-offset-2 ring-offset-card ring-white scale-110" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => handleSetColor(color)}
                title={color}
              />
            ))}
          </div>
        </div>

        <div className="border-t pt-3 space-y-1">
          <button
            className="flex items-center gap-2 w-full text-sm text-muted-foreground font-medium px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
            onClick={() => { setOpen(false); setLocation("/help"); }}
          >
            <HelpCircle className="w-4 h-4" />
            How to Play
          </button>
          {isCommish && (
            <button
              className="flex items-center gap-2 w-full text-sm text-primary font-medium px-2 py-1.5 rounded-lg hover:bg-primary/10 transition-colors"
              onClick={() => { setOpen(false); setLocation("/admin"); }}
            >
              <Shield className="w-4 h-4" />
              Commish Tools
            </button>
          )}
          <button
            className="flex items-center gap-2 w-full text-sm text-destructive font-medium px-2 py-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: status } = useGetSeasonStatus({ query: { enabled: !!user, queryKey: getGetSeasonStatusQueryKey() } });

  if (!user && location !== "/") {
    setLocation("/");
    return null;
  }

  const activeWeek = (status?.lastCompletedWeek ?? 0) + 1;

  const navItems = [
    { href: "/dashboard", label: `Week ${activeWeek}`, icon: LayoutDashboard },
    { href: "/picks", label: "Picks", icon: Grid },
    { href: "/leaderboard", label: "Standings", icon: Trophy },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background pb-20 md:pb-0">
      {user && (
        <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-5xl">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                🏈
              </div>
              <span className="font-semibold text-lg tracking-tight hidden sm:inline">Pick'em</span>
            </div>

            <nav className="hidden md:flex items-center gap-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    location === item.href ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <NavStats userId={user.id} />
              <ProfileButton />
            </div>
          </div>
        </header>
      )}

      <main className="flex-1 container mx-auto px-4 py-6 max-w-5xl">
        {children}
      </main>

      {user && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-xl border-t border-border pb-safe">
          <div className="flex items-center justify-around h-16 px-4">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className={`w-6 h-6 ${isActive ? "fill-primary/20" : ""}`} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
