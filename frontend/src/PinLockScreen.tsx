import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';
import { F } from './theme';

export default function PinLockScreen() {
  const { user, unlockWithPin, logout } = useAuth();
  const { C } = useTheme();
  const styles = makeStyles(C);
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const onChange = async (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 5);
    setPin(digits);
    setError(false);
    if (digits.length === 5) {
      const ok = await unlockWithPin(digits);
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
    <View style={[styles.wrap, { paddingTop: insets.top + 80 }]}>
      <TouchableOpacity style={[styles.escapeBtn, { top: insets.top + 16 }]} onPress={logout}>
        <Ionicons name="log-out-outline" size={20} color={C.muted} />
      </TouchableOpacity>

      <Text style={styles.hello}>مرحباً {user?.name || ''}</Text>
      <Text style={styles.sub}>أدخل الرمز لفتح AZVIO</Text>

      <TouchableOpacity
        style={styles.dotsRow}
        activeOpacity={1}
        onPress={() => inputRef.current?.focus()}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[styles.dot, i < pin.length && styles.dotFilled, error && styles.dotError]}
          />
        ))}
      </TouchableOpacity>

      <TextInput
        ref={inputRef}
        value={pin}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={5}
        style={styles.hiddenInput}
        autoFocus
        caretHidden
      />
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: C.surface, alignItems: 'center', paddingHorizontal: 24 },
    escapeBtn: { position: 'absolute', left: 20 },
    hello: { fontFamily: F.bold, fontSize: 20, color: C.onSurface, marginBottom: 6 },
    sub: { fontFamily: F.regular, fontSize: 14, color: C.muted, marginBottom: 32 },
    dotsRow: { flexDirection: 'row-reverse', gap: 16 },
    dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: C.border },
    dotFilled: { backgroundColor: C.brand, borderColor: C.brand },
    dotError: { backgroundColor: C.error, borderColor: C.error },
    hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  });
