import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/AuthContext';
import { C, F, R, shadow } from '@/src/theme';

export default function LoginScreen() {
  const { user, loading, loginEmail, loginGoogle } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  if (!loading && user) return <Redirect href="/(tabs)" />;

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

  const handleGoogle = async () => {
    setError('');
    setGoogleBusy(true);
    try {
      await loginGoogle();
    } catch (e: any) {
      setError(e.message || 'فشل تسجيل الدخول عبر Google');
    } finally {
      setGoogleBusy(false);
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
          <Text style={styles.logo}>
            AZV<Text style={{ color: C.brand }}>IO</Text>
          </Text>
          <View style={styles.logoUnderline} />
          <Text style={styles.tagline}>لوحة إدارة أعمال التصوير الجوي والمونتاج</Text>
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogle}
            disabled={googleBusy}
            testID="google-login-btn"
          >
            {googleBusy ? (
              <ActivityIndicator color={C.onSurface} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#DB4437" />
                <Text style={styles.googleText}>الدخول بحساب Google</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>أو</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.label}>البريد الإلكتروني</Text>
          <TextInput
            style={styles.input}
            placeholder="Info@azvio.co"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="email-input"
          />
          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={C.muted}
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
  logo: { fontFamily: F.bold, fontSize: 46, letterSpacing: 6, color: C.onSurface },
  logoUnderline: { width: 56, height: 4, borderRadius: 2, backgroundColor: C.brand, marginTop: 2 },
  tagline: { fontFamily: F.regular, fontSize: 14, color: C.muted, marginTop: 12, textAlign: 'center' },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    ...shadow,
  },
  googleBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    borderRadius: R.md,
    paddingVertical: 13,
    minHeight: 48,
  },
  googleText: { fontFamily: F.semibold, fontSize: 15, color: C.onSurface },
  dividerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontFamily: F.regular, fontSize: 13, color: C.muted },
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
