import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { AppModal, Field, ScreenHeader } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

const ALL_CARDS = [
  { key: 'content', title: 'المحتوى', icon: 'film' as const },
  { key: 'calendar', title: 'التقويم', icon: 'calendar' as const },
  { key: 'services', title: 'خدماتي', icon: 'briefcase' as const },
  { key: 'pricing', title: 'تسعيرتي', icon: 'pricetags' as const },
  { key: 'invoices', title: 'الفواتير وعروض السعر', icon: 'document-text' as const },
  { key: 'portfolio', title: 'البورتفوليو', icon: 'images' as const },
  { key: 'whatsapp', title: 'تحليل واتساب', icon: 'logo-whatsapp' as const },
  { key: 'insights', title: 'رؤى الأسبوع', icon: 'analytics' as const },
  { key: 'google_accounts', title: 'حسابات Google', icon: 'logo-google' as const },
  { key: 'links', title: 'روابط سريعة', icon: 'link' as const },
  { key: 'settings', title: 'الإعدادات', icon: 'settings' as const },
  { key: 'team', title: 'إدارة المستخدمين', icon: 'people' as const },
  { key: 'tickets', title: 'ملاحظات سند', icon: 'chatbubbles' as const },
];

const SIZE_LABEL: Record<string, string> = { small: 'مصغّرة', medium: 'قياسية', large: 'موسّعة' };
const SIZE_CYCLE = ['medium', 'small', 'large'];

// مجمع الإحصائيات المتاحة للرئيسية — اختيار مدقق، يغطي المالية والعملاء والمهام
// والتقويم وسند (طلب: الإحصائيات تكون غير المالية على العملاء والمهام والتقويم وسند).
const STATS_POOL: { key: string; title: string; icon: any; group: string }[] = [
  { key: 'month_income', title: 'دخل هذا الشهر', icon: 'trending-up', group: 'المالية' },
  { key: 'month_expenses', title: 'مصاريف الشهر', icon: 'trending-down', group: 'المالية' },
  { key: 'net_profit', title: 'صافي الربح', icon: 'wallet', group: 'المالية' },
  { key: 'clients_in_progress', title: 'مشاريع قيد التنفيذ', icon: 'hourglass', group: 'العملاء' },
  { key: 'clients_delivered', title: 'مشاريع مُسلّمة', icon: 'checkmark-circle', group: 'العملاء' },
  { key: 'clients_total', title: 'إجمالي العملاء', icon: 'people', group: 'العملاء' },
  { key: 'delivery_rate', title: 'معدل التسليم', icon: 'speedometer', group: 'العملاء' },
  { key: 'repeat_clients', title: 'عملاء متكررون', icon: 'repeat', group: 'العملاء' },
  { key: 'tasks_overdue', title: 'مهام متأخرة', icon: 'alert-circle', group: 'المهام' },
  { key: 'tasks_completion_rate', title: 'معدل إنجاز المهام', icon: 'checkbox', group: 'المهام' },
  { key: 'tasks_pending', title: 'مهام متبقية اليوم', icon: 'list', group: 'المهام' },
  { key: 'upcoming_events_count', title: 'المواعيد القادمة', icon: 'calendar', group: 'التقويم' },
  { key: 'events_today_count', title: 'مواعيد اليوم', icon: 'today', group: 'التقويم' },
  { key: 'sanad_alerts_count', title: 'تنبيهات سند', icon: 'sparkles', group: 'سند' },
];
const STATS_GROUPS = ['المالية', 'العملاء', 'المهام', 'التقويم', 'سند'];

type Card = { key: string; title: string; icon: any; isCustom: boolean; customId?: string };

export default function HomeCustomizeScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState<string[]>(ALL_CARDS.map((c) => c.key));
  const [hidden, setHidden] = useState<string[]>([]);
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<{ id: string; title: string; icon: string; target: string }[]>([]);
  const [addCustomModal, setAddCustomModal] = useState(false);
  const [newCustom, setNewCustom] = useState({ title: '', target: '' });
  const [statsSelected, setStatsSelected] = useState<string[]>(['month_income', 'month_expenses', 'clients_in_progress', 'clients_delivered']);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/home/layout');
      const c: { id: string; title: string; icon: string; target: string }[] = r?.custom ?? [];
      setCustom(c);
      const allKeys = [...ALL_CARDS.map((x) => x.key), ...c.map((x) => `custom:${x.id}`)];
      const savedOrder: string[] = r?.order ?? [];
      const missing = allKeys.filter((k) => !savedOrder.includes(k));
      setOrder(savedOrder.length ? [...savedOrder, ...missing] : allKeys);
      setHidden(r?.hidden ?? []);
      setSizes(r?.sizes ?? {});
      setStatsSelected(r?.stats_selected?.length ? r.stats_selected : ['month_income', 'month_expenses', 'clients_in_progress', 'clients_delivered']);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const move = (key: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(key);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const toggleHidden = (key: string) => {
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  };

  const cycleSize = (key: string) => {
    const current = sizes[key] || 'medium';
    const next = SIZE_CYCLE[(SIZE_CYCLE.indexOf(current) + 1) % SIZE_CYCLE.length];
    setSizes((s) => ({ ...s, [key]: next }));
  };

  const toggleStat = (key: string) => {
    setStatsSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const addCustomCard = () => {
    if (!newCustom.title.trim() || !newCustom.target.trim()) return;
    const id = Math.random().toString(36).slice(2);
    setCustom((c) => [...c, { id, title: newCustom.title.trim(), icon: 'link', target: newCustom.target.trim() }]);
    setOrder((o) => [...o, `custom:${id}`]);
    setNewCustom({ title: '', target: '' });
    setAddCustomModal(false);
  };

  const removeCustomCard = (id: string) => {
    setCustom((c) => c.filter((cc) => cc.id !== id));
    setOrder((o) => o.filter((k) => k !== `custom:${id}`));
    setHidden((h) => h.filter((k) => k !== `custom:${id}`));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api('/home/layout', { method: 'PUT', body: JSON.stringify({ order, hidden, sizes, custom, stats_selected: statsSelected }) });
      Alert.alert('تم الحفظ', '✅ الرئيسية صارت مرتبة على ذوقك');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر الحفظ');
    }
    setSaving(false);
  };

  const reset = () => {
    setOrder(ALL_CARDS.map((c) => c.key));
    setHidden([]);
    setSizes({});
    setCustom([]);
    setStatsSelected(['month_income', 'month_expenses', 'clients_in_progress', 'clients_delivered']);
  };

  const customAsCards: Card[] = custom.map((c) => ({ key: `custom:${c.id}`, title: c.title, icon: 'link', isCustom: true, customId: c.id }));
  const allCards: Card[] = [...ALL_CARDS.map((c) => ({ ...c, isCustom: false })), ...customAsCards];
  const cardByKey = useMemo(() => Object.fromEntries(allCards.map((c) => [c.key, c])), [allCards, custom]);
  const orderedCards = order.map((k) => cardByKey[k]).filter(Boolean) as Card[];

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={C.brand} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="تخصيص الرئيسية" subtitle="رتّب بالأسهم، أخفِ، وغيّر الحجم" canBack />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.hintRow}>
          <View style={styles.hintBracketL} />
          <Text style={styles.hint}>رتّب بالأسهم، اضغط العين للإخفاء، والحجم لتكبير/تصغير البطاقة</Text>
          <View style={styles.hintBracketR} />
        </View>

        {orderedCards.map((c, idx) => {
          const isHidden = hidden.includes(c.key);
          const size = sizes[c.key] || 'medium';
          return (
            <View key={c.key} style={[styles.row, isHidden && styles.rowHidden]}>
              <View pointerEvents="none" style={[styles.bracket, styles.bracketTL]} />
              <View pointerEvents="none" style={[styles.bracket, styles.bracketBR]} />

              <View style={styles.arrows}>
                <TouchableOpacity onPress={() => move(c.key, -1)} disabled={idx === 0} hitSlop={8}>
                  <Ionicons name="chevron-up" size={18} color={idx === 0 ? C.divider : C.brand} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => move(c.key, 1)} disabled={idx === orderedCards.length - 1} hitSlop={8}>
                  <Ionicons name="chevron-down" size={18} color={idx === orderedCards.length - 1 ? C.divider : C.brand} />
                </TouchableOpacity>
              </View>

              <View style={[styles.iconBadge, isHidden && styles.iconBadgeMuted]}>
                <Ionicons name={c.icon} size={19} color={isHidden ? C.muted : C.brandDark} />
              </View>

              <Text style={[styles.rowTitle, isHidden && styles.rowTitleHidden]} numberOfLines={1}>
                {c.title}
              </Text>

              <TouchableOpacity onPress={() => cycleSize(c.key)} style={styles.sizeBtn} hitSlop={6}>
                <Text style={styles.sizeBtnText}>{SIZE_LABEL[size]}</Text>
              </TouchableOpacity>

              {c.isCustom && (
                <TouchableOpacity onPress={() => removeCustomCard(c.customId!)} hitSlop={8} style={{ marginHorizontal: 2 }}>
                  <Ionicons name="trash-outline" size={17} color={C.error} />
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => toggleHidden(c.key)} hitSlop={8}>
                <Ionicons name={isHidden ? 'eye-off-outline' : 'eye-outline'} size={19} color={isHidden ? C.muted : C.brand} />
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={styles.addCustomBtn} onPress={() => setAddCustomModal(true)}>
          <Ionicons name="add-circle-outline" size={18} color={C.brand} />
          <Text style={styles.addCustomText}>إضافة بطاقة مخصصة (رابط أو شاشة)</Text>
        </TouchableOpacity>

        <View style={styles.statsSection}>
          <View style={styles.hintRow}>
            <View style={styles.hintBracketL} />
            <Text style={styles.hint}>اختيار مدقق — حدد بالضبط أي إحصائية تظهر أعلى الرئيسية</Text>
            <View style={styles.hintBracketR} />
          </View>

          {STATS_GROUPS.map((group) => {
            const groupStats = STATS_POOL.filter((s) => s.group === group);
            if (!groupStats.length) return null;
            return (
              <View key={group} style={{ marginBottom: 10 }}>
                <Text style={styles.groupLabel}>{group}</Text>
                <View style={styles.statsGrid}>
                  {groupStats.map((s) => {
                    const selectedIdx = statsSelected.indexOf(s.key);
                    const isSelected = selectedIdx !== -1;
                    return (
                      <TouchableOpacity key={s.key} style={[styles.statChip, isSelected && styles.statChipSelected]} onPress={() => toggleStat(s.key)}>
                        {isSelected && (
                          <View style={styles.statChipBadge}>
                            <Text style={styles.statChipBadgeText}>{selectedIdx + 1}</Text>
                          </View>
                        )}
                        <Ionicons name={s.icon} size={16} color={isSelected ? C.brand : C.muted} />
                        <Text style={[styles.statChipText, isSelected && styles.statChipTextSelected]}>{s.title}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.resetBtn} onPress={reset}>
          <Text style={styles.resetText}>إرجاع الترتيب الافتراضي</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>حفظ الترتيب</Text>}
        </TouchableOpacity>
      </ScrollView>

      <AppModal
        visible={addCustomModal}
        title="بطاقة مخصصة جديدة"
        onClose={() => setAddCustomModal(false)}
        onSave={addCustomCard}
        saveLabel="إضافة"
      >
        <Field label="اسم البطاقة" value={newCustom.title} onChangeText={(v) => setNewCustom({ ...newCustom, title: v })} placeholder="مثال: مجلد العقود" />
        <Field
          label="الوجهة (رابط أو مسار شاشة داخل التطبيق)"
          value={newCustom.target}
          onChangeText={(v) => setNewCustom({ ...newCustom, target: v })}
          placeholder="https://... أو /clients"
          autoCapitalize="none"
        />
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface2 },
  hintRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 12 },
  hintBracketL: { width: 10, height: 10, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: C.brand, transform: [{ rotate: '90deg' }] },
  hintBracketR: { width: 10, height: 10, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: C.brand, transform: [{ rotate: '-90deg' }] },
  hint: { flex: 1, fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'center' },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    overflow: 'hidden',
    ...shadow,
  },
  rowHidden: { opacity: 0.5 },
  bracket: { position: 'absolute', width: 12, height: 12, borderColor: C.brand, opacity: 0.3 },
  bracketTL: { top: 6, left: 6, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 4 },
  bracketBR: { bottom: 6, right: 6, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: 4 },

  arrows: { gap: 2, marginLeft: 6 },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  iconBadgeMuted: { backgroundColor: C.surface2 },
  rowTitle: { flex: 1, fontFamily: F.semibold, fontSize: 14, color: C.onSurface, textAlign: 'right' },
  rowTitleHidden: { color: C.muted, textDecorationLine: 'line-through' },
  sizeBtn: { backgroundColor: C.surface2, borderRadius: R.sm, paddingHorizontal: 9, paddingVertical: 5, marginHorizontal: 4 },
  sizeBtnText: { fontFamily: F.semibold, fontSize: 10.5, color: C.onSurface2 },

  addCustomBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 12, marginTop: 4 },
  addCustomText: { fontFamily: F.semibold, fontSize: 13, color: C.brand },

  statsSection: { marginTop: 8 },
  groupLabel: { fontFamily: F.semibold, fontSize: 11.5, color: C.muted, textAlign: 'right', marginBottom: 6 },
  statsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  statChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: R.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.surface,
  },
  statChipSelected: { borderColor: C.brand, backgroundColor: C.brandSoft },
  statChipText: { fontFamily: F.semibold, fontSize: 12.5, color: C.muted },
  statChipTextSelected: { color: C.brandDark },
  statChipBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  statChipBadgeText: { fontFamily: F.bold, fontSize: 9.5, color: '#FFF' },

  resetBtn: { alignItems: 'center', paddingVertical: 10 },
  resetText: { fontFamily: F.semibold, fontSize: 13, color: C.muted },
  saveBtn: { backgroundColor: C.brand, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
