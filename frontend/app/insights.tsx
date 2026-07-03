import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { ScreenHeader } from '@/src/ui';
import { C, F, R, fmt, shadow } from '@/src/theme';

type Insight = {
  stats: {
    week_start: string;
    week_end: string;
    income: number;
    expense: number;
    net: number;
    income_transactions: number;
    prev_income: number;
    prev_expense: number;
    income_change_pct: number;
    new_clients: number;
    delivered_clients: number;
    in_progress_clients: number;
    upcoming_events: any[];
    content_added: number;
    content_published: number;
  };
  insights: {
    headline: string;
    wins: string[];
    alerts: string[];
    focus_next_week: string[];
  };
};

export default function InsightsScreen() {
  const [data, setData] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api('/insights/weekly'));
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const s = data?.stats;
  const i = data?.insights;
  const trend = s ? (s.income_change_pct >= 0 ? 'up' : 'down') : 'flat';
  const trendColor = trend === 'up' ? C.success : trend === 'down' ? C.error : C.muted;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader title="رؤى الأسبوع" subtitle="تقريرك الأسبوعي مع سند ✨" canBack />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
      >
        {loading && !data ? (
          <View style={styles.loading}>
            <ActivityIndicator color={C.brand} size="large" />
            <Text style={styles.loadingText}>يجهّز سند تقريرك...</Text>
          </View>
        ) : !data ? (
          <View style={styles.loading}>
            <Ionicons name="cloud-offline-outline" size={40} color={C.muted} />
            <Text style={styles.loadingText}>تعذر تحميل الرؤى — اسحب للأسفل للتحديث</Text>
          </View>
        ) : (
          <>
            <View style={styles.periodBadge}>
              <Ionicons name="calendar" size={14} color={C.brand} />
              <Text style={styles.periodText}>
                {s?.week_start} → {s?.week_end}
              </Text>
            </View>

            {!!i?.headline && (
              <View style={styles.headlineCard}>
                <View style={styles.sanadBadge}>
                  <Ionicons name="sparkles" size={12} color={C.brand} />
                  <Text style={styles.sanadBadgeText}>سند يقول</Text>
                </View>
                <Text style={styles.headline}>{i.headline}</Text>
              </View>
            )}

            {/* Key metrics */}
            <View style={styles.metricGrid}>
              <MetricCard
                icon="trending-up"
                iconColor={C.success}
                value={fmt(s?.income || 0)}
                label="دخل الأسبوع"
                trend={s?.income_change_pct}
                trendColor={trendColor}
              />
              <MetricCard
                icon="trending-down"
                iconColor={C.error}
                value={fmt(s?.expense || 0)}
                label="مصاريف الأسبوع"
              />
              <MetricCard
                icon="wallet"
                iconColor={C.brand}
                value={fmt(s?.net || 0)}
                label="صافي الأسبوع"
              />
              <MetricCard
                icon="receipt"
                iconColor={C.warning}
                value={String(s?.income_transactions || 0)}
                label="معاملات دخل"
              />
            </View>

            <View style={styles.metricGrid}>
              <MetricCard icon="people-outline" iconColor={C.brand} value={String(s?.new_clients || 0)} label="عملاء جدد" />
              <MetricCard icon="checkmark-done" iconColor={C.success} value={String(s?.delivered_clients || 0)} label="تم التسليم" />
              <MetricCard icon="hourglass-outline" iconColor={C.warning} value={String(s?.in_progress_clients || 0)} label="قيد التنفيذ" />
              <MetricCard icon="film-outline" iconColor={'#16808A'} value={String(s?.content_added || 0)} label="محتوى جديد" />
            </View>

            {/* Wins */}
            {i?.wins && i.wins.length > 0 && (
              <View style={styles.listCard}>
                <View style={styles.listHeader}>
                  <Ionicons name="trophy" size={18} color={C.success} />
                  <Text style={styles.listTitle}>إنجازات الأسبوع</Text>
                </View>
                {i.wins.map((w, idx) => (
                  <View key={idx} style={styles.listItem}>
                    <View style={[styles.dot, { backgroundColor: C.success }]} />
                    <Text style={styles.itemText}>{w}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Alerts */}
            {i?.alerts && i.alerts.length > 0 && (
              <View style={styles.listCard}>
                <View style={styles.listHeader}>
                  <Ionicons name="warning" size={18} color={C.warning} />
                  <Text style={styles.listTitle}>تنبيهات وانتباهات</Text>
                </View>
                {i.alerts.map((a, idx) => (
                  <View key={idx} style={styles.listItem}>
                    <View style={[styles.dot, { backgroundColor: C.warning }]} />
                    <Text style={styles.itemText}>{a}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Focus next week */}
            {i?.focus_next_week && i.focus_next_week.length > 0 && (
              <View style={styles.listCard}>
                <View style={styles.listHeader}>
                  <Ionicons name="flag" size={18} color={C.brand} />
                  <Text style={styles.listTitle}>أولويات الأسبوع القادم</Text>
                </View>
                {i.focus_next_week.map((f, idx) => (
                  <View key={idx} style={styles.listItem}>
                    <View style={styles.focusNum}>
                      <Text style={styles.focusNumText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.itemText}>{f}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Upcoming events */}
            {(s?.upcoming_events?.length || 0) > 0 && (
              <View style={styles.listCard}>
                <View style={styles.listHeader}>
                  <Ionicons name="calendar-outline" size={18} color={C.brand} />
                  <Text style={styles.listTitle}>مواعيد الأسبوع القادم ({s!.upcoming_events.length})</Text>
                </View>
                {s!.upcoming_events.slice(0, 6).map((e) => (
                  <View key={e.id} style={styles.listItem}>
                    <View style={[styles.dot, { backgroundColor: C.brand }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemText}>{e.title}</Text>
                      <Text style={styles.itemSub}>{e.date}{e.time ? ` • ${e.time}` : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.footerNote}>
              💡 هذه الرؤى تُولَّد لحظياً بواسطة سند. سيصلك إشعار كل سبت تلقائياً بعد نشر التطبيق على جوالك.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MetricCard({
  icon,
  iconColor,
  value,
  label,
  trend,
  trendColor,
}: {
  icon: any;
  iconColor: string;
  value: string;
  label: string;
  trend?: number;
  trendColor?: string;
}) {
  const hasTrend = typeof trend === 'number' && Math.abs(trend) >= 1;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={styles.metricValue}>{value}</Text>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
          <Text style={styles.metricLabel}>{label}</Text>
          {hasTrend && trendColor && (
            <View style={[styles.trendPill, { backgroundColor: `${trendColor}18` }]}>
              <Text style={[styles.trendText, { color: trendColor }]}>
                {(trend as number) > 0 ? '+' : ''}{Math.round(trend as number)}%
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'center' },
  periodBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    backgroundColor: C.brandSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: R.pill,
    marginBottom: 12,
  },
  periodText: { fontFamily: F.semibold, fontSize: 12, color: C.brand },
  headlineCard: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 18,
    marginBottom: 12,
    ...shadow,
    borderRightWidth: 4,
    borderRightColor: C.brand,
  },
  sanadBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    backgroundColor: C.brandSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
    marginBottom: 8,
  },
  sanadBadgeText: { fontFamily: F.bold, fontSize: 11, color: C.brand },
  headline: { fontFamily: F.bold, fontSize: 16, color: C.onSurface, textAlign: 'right', lineHeight: 26 },
  metricGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metricCard: {
    width: '47.8%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 12,
    ...shadow,
  },
  metricIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontFamily: F.bold, fontSize: 15, color: C.onSurface },
  metricLabel: { fontFamily: F.regular, fontSize: 11, color: C.muted },
  trendPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: R.pill },
  trendText: { fontFamily: F.bold, fontSize: 10 },
  listCard: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    marginBottom: 12,
    ...shadow,
  },
  listHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  listTitle: { fontFamily: F.bold, fontSize: 14, color: C.onSurface, textAlign: 'right', flex: 1 },
  listItem: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  focusNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusNumText: { fontFamily: F.bold, fontSize: 12, color: '#FFF' },
  itemText: { flex: 1, fontFamily: F.regular, fontSize: 13, color: C.onSurface, textAlign: 'right', lineHeight: 22 },
  itemSub: { fontFamily: F.regular, fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 2 },
  footerNote: {
    fontFamily: F.regular,
    fontSize: 11,
    color: C.muted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
    padding: 12,
  },
});
