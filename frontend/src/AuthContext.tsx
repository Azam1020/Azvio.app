import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { api, clearToken, getToken, setToken } from './api';
import { registerForPushNotifications } from './pushNotifications';
import { hasPin, verifyPin } from './pin';

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
  pinLocked: boolean;
  unlockWithPin: (pin: string) => Promise<boolean>;
};

const AuthCtx = createContext<AuthState>({
  user: null,
  loading: true,
  loginEmail: async () => {},
  loginGoogle: async () => {},
  logout: async () => {},
  pinLocked: false,
  unlockWithPin: async () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinLocked, setPinLocked] = useState(false);

  const processLoginToken = async (loginToken: string) => {
    // The backend already verified this with Google directly and minted
    // this token itself — no external proxy is trusted here.
    await setToken(loginToken);
    const me = await api('/auth/me');
    setUser(me);
  };

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const source = `${window.location.hash} ${window.location.search}`;
          const m = source.match(/token=([^&#\s]+)/);
          if (m) {
            await processLoginToken(m[1]);
            window.history.replaceState(null, '', window.location.pathname);
            setLoading(false);
            return;
          }
        } else if (Platform.OS !== 'web') {
          const initial = await Linking.getInitialURL();
          const m = initial?.match(/token=([^&#\s]+)/);
          if (m) {
            await processLoginToken(m[1]);
            setLoading(false);
            return;
          }
        }
        const token = await getToken();
        if (token) {
          const me = await api('/auth/me');
          setUser(me);
          if (await hasPin()) {
            setPinLocked(true);
          }
        }
      } catch {
        await clearToken();
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (user) {
      registerForPushNotifications();
    }
  }, [user?.user_id]);

  const loginEmail = async (email: string, password: string) => {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await setToken(data.token);
    setUser(data.user);
  };

  const loginGoogle = async () => {
    // Ask our own backend for Google's real consent-screen URL — the
    // backend then redirects straight back into the app with our own
    // token. No third-party auth proxy is involved anywhere in this flow.
    const { auth_url } = await api('/auth/google/login-url');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = auth_url;
      return;
    }
    const redirectUrl = Linking.createURL('auth');
    const result = await WebBrowser.openAuthSessionAsync(auth_url, redirectUrl);
    if (result.type === 'success' && result.url) {
      const m = result.url.match(/token=([^&#\s]+)/);
      if (m) await processLoginToken(m[1]);
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}
    await clearToken();
    setUser(null);
    setPinLocked(false);
  };

  const unlockWithPin = async (pin: string) => {
    const ok = await verifyPin(pin);
    if (ok) setPinLocked(false);
    return ok;
  };

  return (
    <AuthCtx.Provider value={{ user, loading, loginEmail, loginGoogle, logout, pinLocked, unlockWithPin }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
