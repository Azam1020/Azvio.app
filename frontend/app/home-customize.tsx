import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { ScreenHeader } from '@/src/ui';
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

export default function HomeCustomizeScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState<string[]>(ALL_CARDS.map((c) => c.key));
  const [hidden, setHidden] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/home/layout');
      const savedOrder: string[] = r?.order ?? [];
      const missing = ALL_CARDS.map((c) => c.key).filter((k) => !savedOrder.includes(k));
      setOrder(savedOrder.length ? [...savedOrder, ...missing] : ALL_CARDS.map((c) => c.key));
      setHidden(r?.hidden ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const move = (key: string, dir: -1 | 1) => {
    const idx = order.indexOf(key);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= order.length) return;
    const next = [...order];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setOrder(next);
  };

  const toggleHidden = (key: string) => {
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api('/home/layout', { method: 'PUT', body: JSON.stringify({ order, hidden }) });
      Alert.alert('تم الحفظ', '✅ الرئيسية صارت مرتبة على مزاجك');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر الحفظ');
    }
    setSaving(false);
  };

  const reset = () => {
    setOrder(ALL_CARDS.map((c) => c.key));
    setHidden([]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={C.brand} style={{ marginTop: 60 }} />
      </View>
    );
  }

  const orderedCards = order.map((k) => ALL_CARDS.find((c) => c.key === k)).filter(Boolean) as typeof ALL_CARDS;

  return (
    <View style={styles.container}>
      <ScreenHeader title="تخصيص الرئيسية" subtitle="رتّب الأزرار وأخفِ الي ما تحتاجه" canBack />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>اسحب بالأسهم لترتيب الأزرار، واضغط العين لإخفاء أي زر من الرئيسية.</Text>

        {orderedCards.map((c, idx) => {
          const isHidden = hidden.includes(c.key);
          return (
            <View key={c.key} style={[styles.row, isHidden && styles.rowHidden]}>
              <View style={styles.arrows}>
                <TouchableOpacity onPress={() => move(c.key, -1)} disabled={idx === 0} hitSlop={6}>
                  <Ionicons name="chevron-up" size={18} color={idx === 0 ? C.divider : C.brand} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => move(c.key, 1)} disabled={idx === orderedCards.length - 1} hitSlop={6}>
                  <Ionicons name="chevron-down" size={18} color={idx === orderedCards.length - 1 ? C.divider : C.brand} />
                </TouchableOpacity>
              </View>

              <Ionicons name={c.icon} size={20} color={isHidden ? C.muted : C.onSurface} style={{ marginHorizontal: 12 }} />
              <Text style={[styles.rowTitle, isHidden && styles.rowTitleHidden]}>{c.title}</Text>

              <TouchableOpacity onPress={() => toggleHidden(c.key)} hitSlop={8}>
                <Ionicons name={isHidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={isHidden ? C.muted : C.brand} />
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={styles.resetBtn} onPress={reset}>
          <Text style={styles.resetText}>إرجاع الترتيب الافتراضي</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>حفظ الترتيب</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface2 },
  content: { padding: 16, paddingBottom: 40 },
  hint: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginBottom: 16 },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    ...shadow,
  },
  rowHidden: { opacity: 0.5 },
  arrows: { gap: 2 },
  rowTitle: { flex: 1, fontFamily: F.semibold, fontSize: 14, color: C.onSurface, textAlign: 'right' },
  rowTitleHidden: { color: C.muted, textDecorationLine: 'line-through' },
  resetBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  resetText: { fontFamily: F.semibold, fontSize: 13, color: C.muted },
  saveBtn: { backgroundColor: C.brand, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
