import React, { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";

export interface User {
  id: number;
  name: string;
  avatar?: string | null;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("auth_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.removeItem("auth_user");
      return null;
    }
  });
  const [, setLocation] = useLocation();

  // Repair stale local sessions after a database reset or deleted user.
  // The app uses a name-based login, so re-login by name preserves the
  // user's session without leaving the client with an invalid foreign key.
  useEffect(() => {
    const saved = localStorage.getItem("auth_user");
    if (!saved) return;

    let cancelled = false;
    const reconcile = async () => {
      try {
        const storedUser = JSON.parse(saved) as User;
        const response = await fetch(`/api/users/${storedUser.id}`, { cache: "no-store" });
        if (response.ok) {
          const currentUser = await response.json() as User;
          if (!cancelled) {
            setUserState(currentUser);
            localStorage.setItem("auth_user", JSON.stringify(currentUser));
          }
          return;
        }

        const loginResponse = await fetch("/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: storedUser.name }),
        });
        if (!loginResponse.ok) throw new Error("Unable to restore session");
        const replacement = await loginResponse.json() as User;
        if (!cancelled) {
          setUserState(replacement);
          localStorage.setItem("auth_user", JSON.stringify(replacement));
        }
      } catch {
        if (!cancelled) {
          setUserState(null);
          localStorage.removeItem("auth_user");
        }
      }
    };

    void reconcile();
    return () => { cancelled = true; };
  }, []);

  const setUser = (user: User | null) => {
    setUserState(user);
    if (user) {
      localStorage.setItem("auth_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("auth_user");
      setLocation("/");
    }
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
