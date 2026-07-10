import React, { useCallback, useState } from 'react';
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

export default function HomeCustomizeScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState<string[]>(ALL_CARDS.map((c) => c.key));
  const [hidden, setHidden] = useState<string[]>([]);
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<{ id: string; title: string; icon: string; target: string }[]>([]);
  const [addCustomModal, setAddCustomModal] = useState(false);
  const [newCustom, setNewCustom] = useState({ title: '', target: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/home/layout');
      const custom: { id: string; title: string; icon: string; target: string }[] = r?.custom ?? [];
      setCustom(custom);
      const allKeys = [...ALL_CARDS.map((c) => c.key), ...custom.map((c) => `custom:${c.id}`)];
      const savedOrder: string[] = r?.order ?? [];
      const missing = allKeys.filter((k) => !savedOrder.includes(k));
      setOrder(savedOrder.length ? [...savedOrder, ...missing] : allKeys);
      setHidden(r?.hidden ?? []);
      setSizes(r?.sizes ?? {});
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

  const SIZE_CYCLE = ['medium', 'small', 'large'];
  const cycleSize = (key: string) => {
    const current = sizes[key] || 'medium';
    const next = SIZE_CYCLE[(SIZE_CYCLE.indexOf(current) + 1) % SIZE_CYCLE.length];
    setSizes((s) => ({ ...s, [key]: next }));
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
      await api('/home/layout', { method: 'PUT', body: JSON.stringify({ order, hidden, sizes, custom }) });
      Alert.alert('تم الحفظ', '✅ الرئيسية صارت مرتبة على مزاجك');
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
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={C.brand} style={{ marginTop: 60 }} />
      </View>
    );
  }

  const customAsCards = custom.map((c) => ({ key: `custom:${c.id}`, title: c.title, icon: 'link' as const, isCustom: true, customId: c.id }));
  const allCards = [...ALL_CARDS.map((c) => ({ ...c, isCustom: false })), ...customAsCards];
  const orderedCards = order.map((k) => allCards.find((c) => c.key === k)).filter(Boolean) as typeof allCards;

  const SIZE_LABEL: Record<string, string> = { small: 'صغير', medium: 'متوسط', large: 'كبير' };

  return (
    <View style={styles.container}>
      <ScreenHeader title="تخصيص الرئيسية" subtitle="رتّب الأزرار وأخفِ الي ما تحتاجه" canBack />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>اسحب بالأسهم لترتيب الأزرار، اضغط العين للإخفاء، واضغط الحجم لتكبير/تصغير البطاقة.</Text>

        {orderedCards.map((c, idx) => {
          const isHidden = hidden.includes(c.key);
          const size = sizes[c.key] || 'medium';
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

              <Ionicons name={c.icon as any} size={20} color={isHidden ? C.muted : C.onSurface} style={{ marginHorizontal: 12 }} />
              <Text style={[styles.rowTitle, isHidden && styles.rowTitleHidden]}>{c.title}</Text>

              <TouchableOpacity onPress={() => cycleSize(c.key)} style={styles.sizeBtn} hitSlop={6}>
                <Text style={styles.sizeBtnText}>{SIZE_LABEL[size]}</Text>
              </TouchableOpacity>

              {(c as any).isCustom && (
                <TouchableOpacity onPress={() => removeCustomCard((c as any).customId)} hitSlop={8} style={{ marginHorizontal: 4 }}>
                  <Ionicons name="trash-outline" size={18} color={C.error} />
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => toggleHidden(c.key)} hitSlop={8}>
                <Ionicons name={isHidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={isHidden ? C.muted : C.brand} />
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={styles.addCustomBtn} onPress={() => setAddCustomModal(true)}>
          <Ionicons name="add-circle-outline" size={18} color={C.brand} />
          <Text style={styles.addCustomText}>إضافة بطاقة مخصصة (رابط أو شاشة)</Text>
        </TouchableOpacity>

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
  sizeBtn: { backgroundColor: C.surface2, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 5, marginHorizontal: 4 },
  sizeBtnText: { fontFamily: F.semibold, fontSize: 11, color: C.onSurface2 },
  addCustomBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 12, marginTop: 4 },
  addCustomText: { fontFamily: F.semibold, fontSize: 13, color: C.brand },
  resetBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  resetText: { fontFamily: F.semibold, fontSize: 13, color: C.muted },
  saveBtn: { backgroundColor: C.brand, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
