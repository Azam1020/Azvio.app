import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { api } from '@/src/api';
import { Empty, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

export default function GoogleAccountsScreen() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [tasklists, setTasklists] = useState<any[]>([]);
  const [selectedCalendars, setSelectedCalendars] = useState<string[]>([]);
  const [selectedTasklists, setSelectedTasklists] = useState<string[]>([]);
  const [loadingPicker, setLoadingPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api('/google/accounts');
      setAccounts(r.accounts || []);
    } catch {}
    setLoading(false);
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const startConnect = async () => {
    setError('');
    setConnecting(true);
    try {
      const r = await api('/google/auth-url');
      const url = r.auth_url as string;
      if (Platform.OS === 'web') {
        const w = (globalThis as any).window;
        if (w?.open) w.open(url, '_self');
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (e: any) {
      setError(e?.message || 'تعذر بدء الاتصال');
    }
    setConnecting(false);
    // reload after a bit — user might return
    setTimeout(load, 4000);
  };

  const disconnect = async (email: string) => {
    if (await confirmAsync('فصل الحساب', `فصل حساب ${email} من التطبيق؟`)) {
      try {
        await api(`/google/accounts/${encodeURIComponent(email)}`, { method: 'DELETE' });
        load();
      } catch (e: any) {
        Alert.alert('خطأ', e?.message || 'تعذر الفصل');
      }
    }
  };

  const togglePermissions = async (email: string) => {
    if (expanded === email) {
      setExpanded(null);
      return;
    }
    setExpanded(email);
    setLoadingPicker(true);
    setCalendars([]);
    setTasklists([]);
    try {
      const [calRes, taskRes] = await Promise.all([
        api(`/calendar/list?account=${encodeURIComponent(email)}`).catch(() => null),
        api(`/gtasks/lists?account=${encodeURIComponent(email)}`).catch(() => null),
      ]);
      if (calRes) {
        setCalendars(calRes.calendars || []);
        setSelectedCalendars(calRes.selected_calendar_ids || ['primary']);
      }
      if (taskRes) {
        setTasklists(taskRes.lists || []);
        setSelectedTasklists(taskRes.selected_tasklist_ids || ['@default']);
      }
    } catch {}
    setLoadingPicker(false);
  };

  const toggleCalendar = async (email: string, calendarId: string) => {
    const next = selectedCalendars.includes(calendarId)
      ? selectedCalendars.filter((c) => c !== calendarId)
      : [...selectedCalendars, calendarId];
    if (next.length === 0) return; // لازم تقويم واحد على الأقل يفضل مختار
    setSelectedCalendars(next);
    try {
      await api(`/calendar/select?account=${encodeURIComponent(email)}&calendar_ids=${encodeURIComponent(next.join(','))}`, {
        method: 'POST',
      });
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر حفظ اختيار التقويم');
    }
  };

  const toggleTasklist = async (email: string, tasklistId: string) => {
    const next = selectedTasklists.includes(tasklistId)
      ? selectedTasklists.filter((t) => t !== tasklistId)
      : [...selectedTasklists, tasklistId];
    if (next.length === 0) return;
    setSelectedTasklists(next);
    try {
      await api(`/gtasks/select?account=${encodeURIComponent(email)}&tasklist_ids=${encodeURIComponent(next.join(','))}`, {
        method: 'POST',
      });
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر حفظ اختيار قائمة المهام');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader title="حسابات Google" subtitle="ربط تقويم Google بالتطبيق" canBack />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} />}
      >
        {/* Explainer */}
        <View style={styles.explainCard}>
          <View style={styles.explainHeader}>
            <Ionicons name="logo-google" size={20} color="#DB4437" />
            <Text style={styles.explainTitle}>ماذا يتم ربطه؟</Text>
          </View>
          <View style={styles.explainRow}>
            <Ionicons name="checkmark-circle" size={16} color={C.success} />
            <Text style={styles.explainText}>مواعيدك تُضاف تلقائياً لتقويم Google</Text>
          </View>
          <View style={styles.explainRow}>
            <Ionicons name="checkmark-circle" size={16} color={C.success} />
            <Text style={styles.explainText}>يمكن ربط عدة حسابات (شخصي + عمل)</Text>
          </View>
          <View style={styles.explainRow}>
            <Ionicons name="checkmark-circle" size={16} color={C.success} />
            <Text style={styles.explainText}>الوصول محدود للتقويم فقط (لا يقرأ Gmail)</Text>
          </View>
        </View>

        {/* Connect button */}
        <TouchableOpacity
          style={[styles.connectBtn, connecting && { opacity: 0.6 }]}
          onPress={startConnect}
          disabled={connecting}
          testID="connect-google-btn"
        >
          {connecting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color="#FFF" />
              <Text style={styles.connectText}>ربط حساب Google جديد</Text>
            </>
          )}
        </TouchableOpacity>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {/* Connected accounts */}
        <Text style={styles.sectionTitle}>الحسابات المربوطة</Text>
        {loading ? (
          <View style={{ padding: 30, alignItems: 'center' }}>
            <ActivityIndicator color={C.brand} />
          </View>
        ) : accounts.length === 0 ? (
          <Empty
            icon="link-outline"
            text="لا توجد حسابات مربوطة"
            hint="اضغط زر الربط أعلاه لبدء المزامنة"
          />
        ) : (
          accounts.map((a) => (
            <View key={a.email} style={styles.accountCard}>
              <View style={{ width: '100%' }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                  <View style={styles.accountIcon}>
                    <Ionicons name="logo-google" size={20} color="#DB4437" />
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.accountEmail}>{a.email}</Text>
                    <Text style={styles.accountLinked}>
                      رُبط: {(a.linked_at || '').slice(0, 10)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => disconnect(a.email)}
                    style={styles.disconnectBtn}
                    testID={`disconnect-${a.email}`}
                  >
                    <Ionicons name="unlink" size={16} color={C.error} />
                    <Text style={styles.disconnectText}>فصل</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.permBtn} onPress={() => togglePermissions(a.email)}>
                  <Ionicons name={expanded === a.email ? 'chevron-up' : 'chevron-down'} size={16} color={C.brand} />
                  <Text style={styles.permBtnText}>اختيار التقويم وقائمة المهام (الصلاحيات)</Text>
                </TouchableOpacity>

                {expanded === a.email && (
                  <View style={styles.permBox}>
                    {loadingPicker ? (
                      <ActivityIndicator color={C.brand} style={{ marginVertical: 12 }} />
                    ) : (
                      <>
                        <Text style={styles.permLabel}>📅 التقاويم المستخدمة بالتطبيق (تقدر تختار أكثر من وحد)</Text>
                        {calendars.length === 0 ? (
                          <Text style={styles.permEmpty}>تعذر جلب التقاويم (تأكد Calendar API مفعّلة)</Text>
                        ) : (
                          calendars.map((c) => (
                            <TouchableOpacity
                              key={c.id}
                              style={styles.permOption}
                              onPress={() => toggleCalendar(a.email, c.id)}
                            >
                              <Ionicons
                                name={selectedCalendars.includes(c.id) ? 'checkbox' : 'square-outline'}
                                size={18}
                                color={C.brand}
                              />
                              <Text style={styles.permOptionText}>
                                {c.summary} {c.primary ? '(الأساسي)' : ''}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}

                        <Text style={[styles.permLabel, { marginTop: 14 }]}>✅ قوائم المهام المستخدمة بالتطبيق (تقدر تختار أكثر من وحدة)</Text>
                        {tasklists.length === 0 ? (
                          <Text style={styles.permEmpty}>تعذر جلب قوائم المهام (تأكد Google Tasks API مفعّلة وأعدت تسجيل الدخول)</Text>
                        ) : (
                          tasklists.map((t) => (
                            <TouchableOpacity
                              key={t.id}
                              style={styles.permOption}
                              onPress={() => toggleTasklist(a.email, t.id)}
                            >
                              <Ionicons
                                name={selectedTasklists.includes(t.id) ? 'checkbox' : 'square-outline'}
                                size={18}
                                color={C.brand}
                              />
                              <Text style={styles.permOptionText}>{t.title}</Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  explainCard: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    marginBottom: 16,
    ...shadow,
  },
  explainHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
  explainTitle: { fontFamily: F.bold, fontSize: 14, color: C.onSurface, flex: 1, textAlign: 'right' },
  explainRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 4 },
  explainText: { flex: 1, fontFamily: F.regular, fontSize: 13, color: C.onSurface2, textAlign: 'right' },
  connectBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.brand,
    borderRadius: R.md,
    paddingVertical: 13,
    marginBottom: 6,
    minHeight: 48,
  },
  connectText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
  errorText: { fontFamily: F.regular, fontSize: 12, color: C.error, textAlign: 'center', marginBottom: 8 },
  sectionTitle: { fontFamily: F.bold, fontSize: 15, color: C.onSurface, textAlign: 'right', marginTop: 16, marginBottom: 10 },
  accountCard: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 14,
    marginBottom: 8,
    ...shadow,
  },
  permBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.divider,
  },
  permBtnText: { fontFamily: F.semibold, fontSize: 12, color: C.brand },
  permBox: { marginTop: 10, backgroundColor: C.surface2, borderRadius: R.md, padding: 12 },
  permLabel: { fontFamily: F.bold, fontSize: 12, color: C.onSurface, textAlign: 'right', marginBottom: 8 },
  permEmpty: { fontFamily: F.regular, fontSize: 11, color: C.muted, textAlign: 'right' },
  permOption: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6 },
  permOptionText: { fontFamily: F.regular, fontSize: 13, color: C.onSurface, textAlign: 'right', flex: 1 },
  accountIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FCEDED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountEmail: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface },
  accountLinked: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
  disconnectBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FCEDED',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.pill,
  },
  disconnectText: { fontFamily: F.bold, fontSize: 11, color: C.error },
});
