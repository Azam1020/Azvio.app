import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/AuthContext';
import { hasSeenOnboarding } from '@/src/onboarding';
import { C, F, R, shadow } from '@/src/theme';

export default function LoginScreen() {
  const { user, loading, loginEmail } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  useEffect(() => {
    hasSeenOnboarding().then((seen) => {
      if (!seen) router.replace('/onboarding');
      else setCheckedOnboarding(true);
    });
  }, []);

  if (!loading && user) return <Redirect href="/(tabs)" />;
  if (!checkedOnboarding) return null;

  const handleEmailLogin = async () => {
    if (!email.trim() || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await loginEmail(email.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message || 'فشل تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandWrap}>
          <Image
            source={require('../assets/images/azvio-logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <Text style={styles.wordmark}>
            AZV<Text style={{ color: C.brand }}>IO</Text>
          </Text>
          <Text style={styles.tagline}>لوحة إدارة أعمال التصوير الجوي والمونتاج</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>البريد الإلكتروني</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="email-input"
          />
          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            testID="password-input"
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleEmailLogin}
            disabled={busy}
            testID="login-btn"
          >
            {busy ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.loginText}>تسجيل الدخول</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>الدخول مقيّد لمدراء AZVIO فقط</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24 },
  brandWrap: { alignItems: 'center', marginBottom: 36 },
  logoImg: { width: 88, height: 88, marginBottom: 12 },
  wordmark: { fontFamily: F.bold, fontSize: 32, letterSpacing: 4, color: C.onSurface },
  tagline: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 10, textAlign: 'center' },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    ...shadow,
  },
  googleBtn: {
    display: 'none' as any,
  },
  googleText: { fontFamily: F.semibold, fontSize: 15, color: C.onSurface },
  label: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
  input: {
    backgroundColor: C.surface2,
    borderRadius: R.md,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    fontFamily: F.regular,
    fontSize: 15,
    color: C.onSurface,
    textAlign: 'right',
    marginBottom: 14,
  },
  error: { fontFamily: F.regular, fontSize: 13, color: C.error, textAlign: 'center', marginBottom: 10 },
  loginBtn: {
    backgroundColor: C.brand,
    borderRadius: R.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  loginText: { fontFamily: F.bold, fontSize: 16, color: '#FFF' },
  footer: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 24 },
});
