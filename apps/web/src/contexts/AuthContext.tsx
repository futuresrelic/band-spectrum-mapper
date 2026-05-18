import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { setAuthToken } from '../lib/api';
import type { AuthUser } from '@band-spectrum-mapper/shared';

const BASE = import.meta.env['VITE_API_URL'] ?? '';
const STORAGE_KEY = 'bsm_token';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: () => undefined,
  logout: () => undefined,
  refreshUser: async () => undefined,
});

async function fetchMe(token: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<AuthUser>;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function clearAuth() {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken(null);
    setUser(null);
  }

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) return;
    const fresh = await fetchMe(token);
    if (fresh) setUser(fresh);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const raw = JSON.parse(atob(token.split('.')[1]!)) as Record<string, unknown>;
      if (typeof raw['exp'] === 'number' && Date.now() / 1000 > raw['exp']) {
        clearAuth();
        setIsLoading(false);
        return;
      }
      setAuthToken(token);
      // Instant load from JWT (always has userId + email)
      setUser({
        userId:   raw['userId']   as string,
        email:    raw['email']    as string,
        ...(raw['name']     ? { name:     raw['name']     as string  } : {}),
        ...(raw['username'] ? { username: raw['username'] as string  } : {}),
        ...(raw['avatarUrl'] ? { avatarUrl: raw['avatarUrl'] as string } : {}),
        ...(raw['isAdmin']  ? { isAdmin:  true }                      : {}),
      });
    } catch {
      clearAuth();
      setIsLoading(false);
      return;
    }
    setIsLoading(false);

    // Refresh from DB in background — picks up username even if not in old JWT
    const token2 = localStorage.getItem(STORAGE_KEY);
    if (token2) {
      void fetchMe(token2).then((fresh) => { if (fresh) setUser(fresh); });
    }
  }, []);

  const login = () => { window.location.href = `${BASE}/api/auth/google`; };
  const logout = () => { clearAuth(); };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
