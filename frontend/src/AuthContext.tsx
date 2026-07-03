import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { api, clearToken, getToken, setToken } from './api';

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  role?: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthState>({
  user: null,
  loading: true,
  loginEmail: async () => {},
  loginGoogle: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const processSessionId = async (sessionId: string) => {
    const data = await api('/auth/session', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
    await setToken(data.token);
    setUser(data.user);
  };

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const source = `${window.location.hash} ${window.location.search}`;
          const m = source.match(/session_id=([^&#\s]+)/);
          if (m) {
            await processSessionId(m[1]);
            window.history.replaceState(null, '', window.location.pathname);
            setLoading(false);
            return;
          }
        } else if (Platform.OS !== 'web') {
          const initial = await Linking.getInitialURL();
          const m = initial?.match(/session_id=([^&#\s]+)/);
          if (m) {
            await processSessionId(m[1]);
            setLoading(false);
            return;
          }
        }
        const token = await getToken();
        if (token) {
          const me = await api('/auth/me');
          setUser(me);
        }
      } catch {
        await clearToken();
      }
      setLoading(false);
    })();
  }, []);

  const loginEmail = async (email: string, password: string) => {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await setToken(data.token);
    setUser(data.user);
  };

  const loginGoogle = async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const redirectUrl = window.location.origin + '/';
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      return;
    }
    const redirectUrl = Linking.createURL('auth');
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === 'success' && result.url) {
      const m = result.url.match(/session_id=([^&#\s]+)/);
      if (m) await processSessionId(m[1]);
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}
    await clearToken();
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, loginEmail, loginGoogle, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
