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
import { useTheme } from '@/src/ThemeContext';
import { hasSeenOnboarding } from '@/src/onboarding';
import { DiagonalBand } from '@/src/ui';
import { F, R } from '@/src/theme';

export default function LoginScreen() {
  const { user, loading, loginEmail } = useAuth();
  const { C, isDark } = useTheme();
  const styles = makeStyles(C);
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
      style={{ flex: 1, backgroundColor: C.surface2 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* الشريط القطري المزدوج — هوية شاشة الدخول المعتمدة */}
      <DiagonalBand height={220} teal={C.brand} charcoal={C.charcoal} style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 90, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandWrap}>
          <Image
            source={require('../assets/images/azvio-logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <Text style={styles.wordmark}>AZVIO</Text>
          <Text style={styles.tagline}>من أول معك، إلى النهاية</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="البريد الإلكتروني"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="email-input"
          />
          <TextInput
            style={styles.input}
            placeholder="كلمة المرور"
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

          <TouchableOpacity style={styles.googleBtn}>
            <Text style={styles.googleText}>الدخول عبر Google</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>الدخول مقيّد لمدراء AZVIO فقط</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    container: { flexGrow: 1, paddingHorizontal: 24, alignItems: 'center' },
    brandWrap: { alignItems: 'center', marginBottom: 28 },
    logoImg: { width: 72, height: 72, marginBottom: 14 },
    wordmark: { fontFamily: F.bold, fontSize: 26, letterSpacing: 0.5, color: C.onSurface },
    tagline: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center' },
    form: { width: '100%', maxWidth: 320, gap: 12 },
    input: {
      backgroundColor: C.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 16,
      paddingVertical: Platform.OS === 'ios' ? 14 : 12,
      fontFamily: F.regular,
      fontSize: 14,
      color: C.onSurface,
      textAlign: 'right',
    },
    error: { fontFamily: F.regular, fontSize: 13, color: C.error, textAlign: 'center' },
    loginBtn: {
      backgroundColor: C.brand,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      marginTop: 4,
    },
    loginText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
    googleBtn: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleText: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface },
    footer: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 24 },
  });
