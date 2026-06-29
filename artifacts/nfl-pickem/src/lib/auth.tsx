import React, { createContext, useContext, useState } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useLocation } from "wouter";

export type UserRole = "member" | "admin";

export interface User {
  id: number;
  name: string;
  avatar?: string | null;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
let protectedFetchInstalled = false;

function normalizeUser(user: User): User {
  return { ...user, role: user.role ?? "member" };
}

function getStoredUserId(): number | null {
  const saved = localStorage.getItem("auth_user");
  if (!saved) return null;

  try {
    const user = JSON.parse(saved) as Pick<User, "id">;
    return Number.isInteger(user.id) ? user.id : null;
  } catch {
    return null;
  }
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function shouldAttachAuth(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url = getRequestUrl(input);
  const method = getRequestMethod(input, init);
  return url.startsWith("/api/admin") || (method === "DELETE" && /^\/api\/users\/\d+/.test(url));
}

function installProtectedFetch() {
  if (protectedFetchInstalled || typeof window === "undefined") return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldAttachAuth(input, init)) return originalFetch(input, init);

    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    new Headers(getAuthHeaders()).forEach((value, key) => headers.set(key, value));

    return originalFetch(input, { ...init, headers });
  };

  protectedFetchInstalled = true;
}

setAuthTokenGetter(() => {
  const userId = getStoredUserId();
  return userId ? String(userId) : null;
});

export function getAuthHeaders(): HeadersInit {
  const userId = getStoredUserId();
  return userId ? { "x-user-id": String(userId) } : {};
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  installProtectedFetch();

  const [user, setUserState] = useState<User | null>(() => {
    const saved = localStorage.getItem("auth_user");
    return saved ? normalizeUser(JSON.parse(saved)) : null;
  });
  const [, setLocation] = useLocation();

  const setUser = (user: User | null) => {
    const normalized = user ? normalizeUser(user) : null;
    setUserState(normalized);
    if (normalized) {
      localStorage.setItem("auth_user", JSON.stringify(normalized));
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
