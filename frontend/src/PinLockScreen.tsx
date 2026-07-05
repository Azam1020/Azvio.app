import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './AuthContext';
import { C, F, R } from './theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function PinLockScreen() {
  const { user, unlockWithPin, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const press = async (key: string) => {
    if (key === '') return;
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      setError(false);
      return;
    }
    if (pin.length >= 5) return;
    const next = pin + key;
    setPin(next);
    setError(false);
    if (next.length === 5) {
      const ok = await unlockWithPin(next);
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(true);
        setTimeout(() => setPin(''), 400);
      }
    }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.hello}>مرحباً {user?.name || ''}</Text>
      <Text style={styles.sub}>أدخل الرمز لفتح AZVIO</Text>

      <View style={styles.dotsRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < pin.length && styles.dotFilled,
              error && styles.dotError,
            ]}
          />
        ))}
      </View>

      <View style={styles.pad}>
        {KEYS.map((k, i) => (
          <TouchableOpacity
            key={i}
            style={styles.key}
            disabled={k === ''}
            onPress={() => press(k)}
            activeOpacity={0.6}
          >
            <Text style={styles.keyText}>{k === 'del' ? '⌫' : k}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={logout} style={{ marginTop: 20 }}>
        <Text style={styles.logoutText}>تسجيل خروج واستخدام حساب آخر</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.surface, alignItems: 'center', paddingHorizontal: 24 },
  hello: { fontFamily: F.bold, fontSize: 20, color: C.onSurface, marginBottom: 6 },
  sub: { fontFamily: F.regular, fontSize: 14, color: C.muted, marginBottom: 32 },
  dotsRow: { flexDirection: 'row-reverse', gap: 16, marginBottom: 48 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: C.border },
  dotFilled: { backgroundColor: C.brand, borderColor: C.brand },
  dotError: { backgroundColor: C.error, borderColor: C.error },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 260, justifyContent: 'center' },
  key: { width: 80, height: 70, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: F.semibold, fontSize: 24, color: C.onSurface },
  logoutText: { fontFamily: F.regular, fontSize: 13, color: C.muted, textDecorationLine: 'underline' },
});
