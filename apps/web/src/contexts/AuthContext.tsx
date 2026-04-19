import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAuthToken } from '../lib/api';
import type { AuthUser } from '@band-spectrum-mapper/shared';

const BASE = import.meta.env['VITE_API_URL'] ?? '';
const STORAGE_KEY = 'bsm_token';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: () => undefined,
  logout: () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Token is captured from ?token= URL param into localStorage by main.tsx
    // before React renders, so we only need to read from localStorage here.
    const token = localStorage.getItem(STORAGE_KEY);
    if (token) {
      try {
        const raw = JSON.parse(atob(token.split('.')[1]!));
        if (raw.exp && Date.now() / 1000 > raw.exp) {
          clearAuth();
        } else {
          setAuthToken(token);
          setUser({
            userId: raw.userId,
            email: raw.email,
            ...(raw.name ? { name: raw.name } : {}),
            ...(raw.avatarUrl ? { avatarUrl: raw.avatarUrl } : {}),
            ...(raw.isAdmin ? { isAdmin: true } : {}),
          });
        }
      } catch {
        clearAuth();
      }
    }
    setIsLoading(false);
  }, []);

  function clearAuth() {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken(null);
    setUser(null);
  }

  const login = () => {
    window.location.href = `${BASE}/api/auth/google`;
  };

  const logout = () => {
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
