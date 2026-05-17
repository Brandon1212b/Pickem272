import React, { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { LogOut, LayoutDashboard, Grid, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

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
    { href: "/picks", label: "The Grid", icon: Grid },
    { href: "/leaderboard", label: "Standings", icon: Trophy },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background pb-20 md:pb-0">
      {user && (
        <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                N
              </div>
              <span className="font-semibold text-lg tracking-tight">Pick'em</span>
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
              <Link
                href="/admin"
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  location === "/admin" ? "text-primary" : "text-muted-foreground"
                }`}
              >
                Admin
              </Link>
            </nav>

            <div className="flex items-center gap-4">
              <span className="text-sm font-medium hidden md:inline-block">
                {user.name}
              </span>
              <Button variant="ghost" size="icon" onClick={logout} className="rounded-full">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
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
