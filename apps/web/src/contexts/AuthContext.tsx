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
    // Pick up token from OAuth redirect (?token=...) or localStorage
    const params   = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');

    const token = urlToken ?? localStorage.getItem(STORAGE_KEY);

    if (urlToken) {
      localStorage.setItem(STORAGE_KEY, urlToken);
      // Remove token from URL without a page reload
      const clean = new URL(window.location.href);
      clean.searchParams.delete('token');
      window.history.replaceState({}, '', clean.toString());
    }

    if (token) {
      try {
        // Decode the JWT payload (no signature verification needed on frontend)
        const raw = JSON.parse(atob(token.split('.')[1]!));
        // Check expiry
        if (raw.exp && Date.now() / 1000 > raw.exp) {
          clearAuth();
        } else {
          setAuthToken(token);
          setUser({ userId: raw.userId, email: raw.email, name: raw.name, avatarUrl: raw.avatarUrl });
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
