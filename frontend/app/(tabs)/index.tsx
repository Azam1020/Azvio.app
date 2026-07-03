import React, { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/src/api';
import { useAuth } from '@/src/AuthContext';
import { confirmAsync } from '@/src/ui';
import { C, F, R, fmt, shadow } from '@/src/theme';

type Dash = {
  clients_total: number;
  clients_in_progress: number;
  clients_delivered: number;
  month_income: number;
  month_expenses: number;
  upcoming_events: any[];
  content_stages: Record<string, number>;
};

const EVENT_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  shooting: { label: 'تصوير', icon: 'videocam', color: C.brand },
  delivery: { label: 'تسليم', icon: 'checkmark-done', color: C.success },
  other: { label: 'موعد', icon: 'calendar', color: C.muted },
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Dash | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api('/dashboard'));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    if (await confirmAsync('تسجيل الخروج', 'هل تريد تسجيل الخروج من AZVIO؟')) {
      await logout();
      router.replace('/login');
    }
  };

  const contentTotal = data
    ? Object.values(data.content_stages).reduce((a, b) => a + b, 0)
    : 0;

  const navCards = [
    { title: 'المحتوى', sub: `${contentTotal} عنصر`, icon: 'film' as const, href: '/content' },
    { title: 'التقويم', sub: 'مواعيد التصوير والتسليم', icon: 'calendar' as const, href: '/calendar' },
    { title: 'خدماتي', sub: 'درون ومونتاج', icon: 'briefcase' as const, href: '/services' },
    { title: 'روابط سريعة', sub: 'لوحاتك الخارجية', icon: 'link' as const, href: '/links' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.greeting}>أهلاً، {user?.name?.split(' ')[0] || 'عزّام'} 👋</Text>
            <Text style={styles.brandSmall}>
              AZV<Text style={{ color: C.brand }}>IO</Text>
            </Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} testID="logout-btn">
            <Ionicons name="log-out-outline" size={22} color={C.onSurface2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
      >
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: C.brand }]}>
            <Ionicons name="trending-up" size={20} color="rgba(255,255,255,0.85)" />
            <Text style={[styles.statValue, { color: '#FFF' }]}>{fmt(data?.month_income || 0)}</Text>
            <Text style={[styles.statLabel, { color: 'rgba(255,255,255,0.85)' }]}>دخل هذا الشهر</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-down" size={20} color={C.error} />
            <Text style={styles.statValue}>{fmt(data?.month_expenses || 0)}</Text>
            <Text style={styles.statLabel}>مصاريف الشهر</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="hourglass" size={20} color={C.warning} />
            <Text style={styles.statValue}>{data?.clients_in_progress ?? 0}</Text>
            <Text style={styles.statLabel}>مشاريع قيد التنفيذ</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={20} color={C.success} />
            <Text style={styles.statValue}>{data?.clients_delivered ?? 0}</Text>
            <Text style={styles.statLabel}>مشاريع مُسلّمة</Text>
          </View>
        </View>

        {/* Sections */}
        <Text style={styles.sectionTitle}>الأقسام</Text>
        <View style={styles.navGrid}>
          {navCards.map((c) => (
            <TouchableOpacity
              key={c.title}
              style={styles.navCard}
              onPress={() => router.push(c.href as any)}
              testID={`nav-${c.href.slice(1)}`}
            >
              <View style={styles.navIcon}>
                <Ionicons name={c.icon} size={22} color={C.brand} />
              </View>
              <Text style={styles.navTitle}>{c.title}</Text>
              <Text style={styles.navSub}>{c.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Upcoming events */}
        <Text style={styles.sectionTitle}>المواعيد القادمة</Text>
        {(data?.upcoming_events?.length ?? 0) === 0 ? (
          <View style={styles.emptyEvents}>
            <Ionicons name="calendar-outline" size={22} color={C.muted} />
            <Text style={styles.emptyText}>لا توجد مواعيد قادمة — أضفها من التقويم</Text>
          </View>
        ) : (
          data!.upcoming_events.map((e) => {
            const meta = EVENT_LABELS[e.event_type] || EVENT_LABELS.other;
            return (
              <View key={e.id} style={styles.eventCard}>
                <View style={[styles.eventIcon, { backgroundColor: `${meta.color}18` }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.eventTitle}>{e.title}</Text>
                  <Text style={styles.eventSub}>
                    {meta.label} • {e.date}
                    {e.time ? ` • ${e.time}` : ''}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  greeting: { fontFamily: F.bold, fontSize: 20, color: C.onSurface },
  brandSmall: { fontFamily: F.bold, fontSize: 12, letterSpacing: 2, color: C.muted },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row-reverse', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    alignItems: 'flex-end',
    gap: 4,
    ...shadow,
  },
  statValue: { fontFamily: F.bold, fontSize: 18, color: C.onSurface },
  statLabel: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  sectionTitle: {
    fontFamily: F.bold,
    fontSize: 16,
    color: C.onSurface,
    textAlign: 'right',
    marginTop: 12,
    marginBottom: 10,
  },
  navGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  navCard: {
    width: '47.8%',
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    alignItems: 'flex-end',
    ...shadow,
  },
  navIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  navTitle: { fontFamily: F.bold, fontSize: 15, color: C.onSurface },
  navSub: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
  emptyEvents: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { fontFamily: F.regular, fontSize: 13, color: C.muted },
  eventCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 14,
    marginBottom: 8,
    ...shadow,
  },
  eventIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface },
  eventSub: { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: 1 },
});
