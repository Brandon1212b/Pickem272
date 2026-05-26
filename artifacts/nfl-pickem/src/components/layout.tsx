import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { LogOut, LayoutDashboard, Grid, Trophy, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useGetLeaderboard,
  useGetSeasonStatus,
  useGetUserPicksForWeek,
  useUpdateUser,
  getGetUserPicksForWeekQueryKey,
} from "@workspace/api-client-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const AVATAR_EMOJIS = ["🏈", "🦅", "🐻", "🐆", "🦁", "🐯", "🦊", "🐺", "🦈", "🐬", "🔥", "⚡", "🌪️", "💥", "🎯", "🏆", "👑", "💰", "🎲", "🃏"];

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
  const [editName, setEditName] = useState(user?.name ?? "");
  const [, setLocation] = useLocation();

  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: (updated) => {
        if (user) {
          const next = { ...user, name: updated.name };
          setUser(next);
        }
        setOpen(false);
      },
    },
  });

  if (!user) return null;

  const avatarStr = (user as any).avatar as string | null | undefined;
  const isEmoji = avatarStr && avatarStr.length <= 4 && /\p{Emoji}/u.test(avatarStr);
  const displayAvatar = isEmoji ? avatarStr : user.name[0]?.toUpperCase();

  const handleSaveName = () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === user.name) { setOpen(false); return; }
    updateUser.mutate({ userId: user.id, data: { name: trimmed } });
  };

  const handleSetEmoji = (emoji: string) => {
    updateUser.mutate({
      userId: user.id,
      data: { avatar: emoji },
    });
    // Optimistically update avatar locally
    const saved = localStorage.getItem("auth_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        localStorage.setItem("auth_user", JSON.stringify({ ...parsed, avatar: emoji }));
      } catch {}
    }
  };

  const isCommish = user.name === "Bfabs";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary hover:bg-primary/30 transition-colors select-none"
          title={`Profile: ${user.name}`}
        >
          {displayAvatar}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4 space-y-4">
        {/* User name */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-2xl mx-auto mb-2">
            {displayAvatar}
          </div>
          <p className="font-semibold">{user.name}</p>
          {isCommish && (
            <span className="text-xs text-primary font-medium">Commissioner 👑</span>
          )}
        </div>

        {/* Emoji avatar picker */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Choose avatar</p>
          <div className="grid grid-cols-10 gap-0.5">
            {AVATAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                className={`text-base p-0.5 rounded hover:bg-secondary transition-colors ${avatarStr === emoji ? "bg-primary/20" : ""}`}
                onClick={() => handleSetEmoji(emoji)}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Rename */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Display name</p>
          <div className="flex gap-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Your name"
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              maxLength={32}
            />
            <Button
              size="sm"
              className="h-8 shrink-0"
              onClick={handleSaveName}
              disabled={!editName.trim() || updateUser.isPending}
            >
              Save
            </Button>
          </div>
        </div>

        <div className="border-t pt-3 space-y-1">
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

  useEffect(() => {
    if (!user && location !== "/") {
      setLocation("/");
    }
  }, [user, location, setLocation]);

  if (!user && location !== "/") {
    return null;
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
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
