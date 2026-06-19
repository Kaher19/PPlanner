/**
 * PPlaner — useAuth Hook
 *
 * Manages authentication state by communicating with /api/auth/me.
 * The session cookie (HttpOnly) is sent automatically by the browser.
 * Tokens are NEVER accessible from JavaScript — they live in HttpOnly cookies.
 *
 * Security:
 *  - No tokens stored in localStorage or React state
 *  - Uses credentials: 'same-origin' to include HttpOnly cookies
 *  - Login redirects to /api/auth/login (server-side OAuth2 flow)
 *  - Logout POSTs to /api/auth/logout and does a full page reload
 */

import { useState, useEffect, useCallback } from 'react';
import type { AuthState, UserInfo } from '../types/index.js';

export interface UseAuthReturn extends AuthState {
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
  });

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'same-origin', // Send the HttpOnly session cookie
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        const user = await res.json() as UserInfo;
        setAuthState({ isLoading: false, isAuthenticated: true, user });
      } else {
        setAuthState({ isLoading: false, isAuthenticated: false, user: null });
      }
    } catch {
      // Network error — treat as unauthenticated
      setAuthState({ isLoading: false, isAuthenticated: false, user: null });
    }
  }, []);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  const login = useCallback((): void => {
    // Navigate to the server-side OAuth2 initiator
    window.location.href = '/api/auth/login';
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      // Full page reload clears all in-memory state (React cache, etc.)
      window.location.href = '/';
    }
  }, []);

  return { ...authState, login, logout, refresh: fetchMe };
}
