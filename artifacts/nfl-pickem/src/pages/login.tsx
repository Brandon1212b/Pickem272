import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useGetSeasonStatus, useLoginUser, useGetLeaderboard } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function Login() {
  const [name, setName] = useState("");
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [, setLocation] = useLocation();
  const { user, setUser, logout } = useAuth();
  const { data: seasonStatus } = useGetSeasonStatus();
  const { data: leaderboard } = useGetLeaderboard();
  const seasonLocked = seasonStatus?.mode === "in-season";
  const postLoginPath = seasonLocked ? "/recap" : "/picks";

  const loginUser = useLoginUser({
    mutation: {
      onSuccess: (newUser) => {
        setUser(newUser);
        toast.success(`Welcome, ${newUser.name}!`);
        setLocation(postLoginPath);
      },
      onError: (error) => {
        const statusCode =
          typeof error === "object" && error !== null && "status" in error
            ? (error as { status?: unknown }).status
            : undefined;
        if (seasonLocked && statusCode === 403) {
          toast.error("Season is underway. Pick your existing team name.");
        } else {
          toast.error("Failed to join — try again.");
        }
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    loginUser.mutate({ data: { name: name.trim() } });
  };

  const handleSelectPlayer = (playerName: string) => {
    setName(playerName);
    loginUser.mutate({ data: { name: playerName } });
  };

  // Already logged in — show "continue as" screen
  if (user && !switchingAccount) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="w-full max-w-sm relative z-10 space-y-6">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto bg-primary rounded-3xl flex items-center justify-center text-4xl mb-4 shadow-2xl shadow-primary/30">
              🏈
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Pick'em 272</h1>
            <p className="text-muted-foreground mt-1 text-sm">2026–27 NFL Season</p>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-5 shadow-xl shadow-black/20">
            <p className="text-center text-sm text-muted-foreground">You're signed in as</p>
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg"
                style={{ backgroundColor: user.avatar ?? "#007AFF" }}
              >
                {getInitials(user.name)}
              </div>
              <div className="text-center">
                <p className="text-xl font-bold">{user.name}</p>
              </div>
            </div>
            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={() => setLocation(postLoginPath)}
            >
              Continue as {user.name}
            </Button>
            <button
              onClick={() => setSwitchingAccount(true)}
              className="w-full text-sm text-muted-foreground hover:text-foreground text-center transition-colors py-1"
            >
              Not you? Sign in with a different name
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground px-4">
            Each player can only have one pick list. If you need to start over, tell the commish which list to keep before the season starts.
          </p>
        </div>
      </div>
    );
  }

  const players = leaderboard ?? [];

  // Normal login / new user
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10 space-y-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto bg-primary rounded-3xl flex items-center justify-center text-4xl mb-4 shadow-2xl shadow-primary/30">
            🏈
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Pick'em 272</h1>
          <p className="text-muted-foreground mt-1 text-sm">2026–27 NFL Season</p>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-4 shadow-xl shadow-black/20">
          {switchingAccount && user && (
            <div className="bg-secondary/60 rounded-xl p-3 text-sm text-muted-foreground flex items-center justify-between">
              <span>
                Switching from <strong className="text-foreground">{user.name}</strong>
              </span>
              <button
                onClick={() => setSwitchingAccount(false)}
                className="text-xs text-primary hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold mb-1">
              {seasonLocked
                ? "Season is underway"
                : switchingAccount
                ? "Sign in with a different name"
                : "Enter the League"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {seasonLocked
                ? "Pick your name from the list of active players."
                : switchingAccount
                ? "Type your name to switch accounts."
                : "Enter your name to join or pick up where you left off."}
            </p>
          </div>

          {seasonLocked ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {players.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading players…</p>
              ) : (
                players.map((p) => (
                  <button
                    key={p.userId}
                    type="button"
                    disabled={loginUser.isPending}
                    onClick={() => handleSelectPlayer(p.name)}
                    className="w-full flex items-center gap-3 rounded-xl border border-border bg-secondary/40 hover:bg-secondary px-3 py-2.5 text-left transition-colors disabled:opacity-50"
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: p.avatar ?? "#007AFF" }}
                    >
                      {getInitials(p.name)}
                    </div>
                    <span className="text-sm font-medium truncate">{p.name}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                placeholder="Your name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 text-base px-4 bg-background"
                disabled={loginUser.isPending}
                autoFocus
                data-testid="input-name"
              />
              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={!name.trim() || loginUser.isPending}
                data-testid="button-submit"
              >
                {loginUser.isPending ? "Signing in…" : switchingAccount ? "Switch Account" : "Join League"}
              </Button>
            </form>
          )}

          {switchingAccount && (
            <button
              className="w-full text-sm text-destructive hover:text-destructive/80 text-center transition-colors py-1"
              onClick={() => {
                logout();
                setSwitchingAccount(false);
              }}
            >
              Sign out completely
            </button>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {seasonLocked ? "Tap your name to sign in." : "No password needed — just your name."}
        </p>
      </div>
    </div>
  );
}
