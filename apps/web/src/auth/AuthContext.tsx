import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthResponse, UserDto } from '@exam/shared';
import { post, refreshSession, setAccessToken, setSessionListener } from '../api/client';
import { queryClient } from '../queryClient';

interface AuthState {
  user: UserDto | null;
  ready: boolean;
  login(email: string, password: string): Promise<UserDto>;
  register(email: string, password: string, fullName: string): Promise<UserDto>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionListener((s) => setUser(s?.user ?? null));
    // The access token is memory-only; restore the session from the refresh cookie on load.
    void refreshSession().finally(() => setReady(true));
  }, []);

  const apply = useCallback((s: AuthResponse) => {
    setAccessToken(s.accessToken);
    setUser(s.user);
    return s.user;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      login: async (email, password) => apply(await post<AuthResponse>('/auth/login', { email, password })),
      register: async (email, password, fullName) =>
        apply(await post<AuthResponse>('/auth/register', { email, password, fullName })),
      logout: async () => {
        try {
          await post('/auth/logout');
        } finally {
          setAccessToken(null);
          setUser(null);
          queryClient.clear();
        }
      },
    }),
    [user, ready, apply],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function homeFor(user: UserDto | null): string {
  if (!user) return '/login';
  if (user.role === 'STUDENT') return '/student';
  if (user.role === 'ADMIN') return '/admin/users';
  return '/teacher/exams';
}
