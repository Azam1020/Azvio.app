import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { Empty, ScreenHeader } from '@/src/ui';
import { F, R, shadow } from '@/src/theme';
import { useTheme } from '@/src/ThemeContext';

type Ticket = {
  id: string;
  kind: 'bug' | 'feature';
  title: string;
  description: string;
  screen?: string;
  status: 'open' | 'resolved';
  created_at: string;
};

export default function TicketsScreen() {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');

  const load = useCallback(async (f: typeof filter) => {
    try {
      const q = f === 'all' ? '' : `?status=${f}`;
      setTickets(await api(`/tickets${q}`));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [load, filter])
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  }, [load, filter]);

  const toggleResolve = async (t: Ticket) => {
    try {
      await api(`/tickets/${t.id}/${t.status === 'open' ? 'resolve' : 'reopen'}`, { method: 'PATCH' });
      load(filter);
    } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader title="ملاحظات سند" canBack />
      <View style={styles.filters}>
        {(['open', 'resolved', 'all'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'open' ? 'مفتوحة' : f === 'resolved' ? 'محلولة' : 'الكل'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.wrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} />}
      >
        {tickets.length === 0 ? (
          <Empty icon="chatbubbles-outline" text="لا توجد ملاحظات حالياً" hint="أي خطأ أو طلب ميزة يرسله المستخدم لسند يظهر هنا" />
        ) : (
          tickets.map((t) => (
            <View key={t.id} style={styles.card}>
              <View pointerEvents="none" style={styles.cardBracket} />
              <View style={styles.rowTop}>
                <View style={[styles.badge, t.kind === 'bug' ? styles.badgeBug : styles.badgeFeature]}>
                  <Text style={styles.badgeText}>{t.kind === 'bug' ? 'خطأ' : 'ميزة'}</Text>
                </View>
                <TouchableOpacity onPress={() => toggleResolve(t)}>
                  <Ionicons
                    name={t.status === 'open' ? 'ellipse-outline' : 'checkmark-circle'}
                    size={22}
                    color={t.status === 'open' ? C.muted : C.success}
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.title}>{t.title}</Text>
              {!!t.description && <Text style={styles.desc}>{t.description}</Text>}
              {!!t.screen && <Text style={styles.screen}>الشاشة: {t.screen}</Text>}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  filters: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, backgroundColor: C.surface },
  filterChipActive: { backgroundColor: C.brand },
  filterText: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2 },
  filterTextActive: { color: '#FFF' },
  wrap: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10, overflow: 'hidden', ...shadow },
  cardBracket: { position: 'absolute', top: 6, left: 6, width: 10, height: 10, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: C.brand, opacity: 0.3, borderTopLeftRadius: 4 },
  rowTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill },
  badgeBug: { backgroundColor: '#FFE5E5' },
  badgeFeature: { backgroundColor: C.brandSoft },
  badgeText: { fontFamily: F.bold, fontSize: 11, color: C.onSurface },
  title: { fontFamily: F.bold, fontSize: 15, color: C.onSurface, textAlign: 'right' },
  desc: { fontFamily: F.regular, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginTop: 4 },
  screen: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginTop: 4 },
});
