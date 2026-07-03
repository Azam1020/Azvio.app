import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C, F, R, shadow } from '@/src/theme';

/**
 * OAuth callback landing page. The backend redirects here after Google consent.
 * Query params: status=connected&email=... or status=error&reason=...
 */
export default function OAuthCallbackScreen() {
  const params = useLocalSearchParams<{ status?: string; email?: string; reason?: string }>();
  const router = useRouter();
  const [countdown, setCountdown] = useState(3);

  const success = params.status === 'connected';
  const email = params.email as string | undefined;
  const reason = params.reason as string | undefined;

  useEffect(() => {
    if (!success) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    const to = setTimeout(() => router.replace('/google-accounts'), 3000);
    return () => {
      clearInterval(t);
      clearTimeout(to);
    };
  }, [success, router]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {success ? (
          <>
            <View style={[styles.iconWrap, { backgroundColor: '#E9F9EE' }]}>
              <Ionicons name="checkmark-circle" size={44} color={C.success} />
            </View>
            <Text style={styles.title}>تم ربط الحساب بنجاح!</Text>
            {!!email && <Text style={styles.email}>{email}</Text>}
            <Text style={styles.sub}>الآن يمكن إضافة مواعيدك على تقويم Google تلقائياً</Text>
            <ActivityIndicator style={{ marginTop: 20 }} color={C.brand} />
            <Text style={styles.countdown}>سيتم الرجوع خلال {countdown}...</Text>
          </>
        ) : (
          <>
            <View style={[styles.iconWrap, { backgroundColor: '#FCEDED' }]}>
              <Ionicons name="close-circle" size={44} color={C.error} />
            </View>
            <Text style={styles.title}>تعذر ربط الحساب</Text>
            {!!reason && <Text style={styles.sub}>السبب: {reason}</Text>}
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/google-accounts')}>
              <Text style={styles.buttonText}>العودة</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 32,
    alignItems: 'center',
    ...shadow,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontFamily: F.bold, fontSize: 20, color: C.onSurface, textAlign: 'center', marginBottom: 6 },
  email: { fontFamily: F.semibold, fontSize: 14, color: C.brand, marginBottom: 10 },
  sub: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 },
  countdown: { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: 10 },
  button: {
    marginTop: 20,
    backgroundColor: C.brand,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: R.md,
  },
  buttonText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
