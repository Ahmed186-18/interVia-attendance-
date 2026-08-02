"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  country: string;
  locale: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  refreshUser: async () => {},
});

function applyPreferences(settings: Record<string, unknown>) {
  const theme = String(settings.theme || "LIGHT");
  const dark = theme === "DARK" || (theme === "SYSTEM" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark-theme", dark);
  document.documentElement.classList.toggle("compact-mode", Boolean(settings.compactMode));
  document.documentElement.classList.toggle("reduce-motion", Boolean(settings.reducedMotion));
}

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        try {
          const settingsResponse = await fetch("/api/settings");
          if (settingsResponse.ok) {
            const settingsData = await settingsResponse.json();
            localStorage.setItem("intervia-preferences", JSON.stringify(settingsData.personal));
            applyPreferences(settingsData.personal);
          }
        } catch {
          // Keep the authenticated session even if preferences cannot be loaded.
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("intervia-preferences");
      if (stored) {
        const settings = JSON.parse(stored);
        applyPreferences(settings);
      }
    } catch {
      localStorage.removeItem("intervia-preferences");
    }
    refreshUser();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
