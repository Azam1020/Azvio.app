import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { AppModal, Chips, Empty, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

const EVENT_TYPES = [
  { key: 'shooting', label: 'تصوير', color: C.brand },
  { key: 'delivery', label: 'تسليم', color: C.success },
  { key: 'other', label: 'آخر', color: '#8E8E93' },
];

const EVENT_META: Record<string, { label: string; icon: any; color: string }> = {
  shooting: { label: 'تصوير', icon: 'videocam', color: C.brand },
  delivery: { label: 'تسليم', icon: 'checkmark-done', color: C.success },
  other: { label: 'موعد', icon: 'calendar', color: '#8E8E93' },
};

function formatDate(dateStr: string) {
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return dateStr;
  }
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function CalendarScreen() {
  const [events, setEvents] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    event_type: 'shooting',
    date: todayStr(),
    time: '',
    client_name: '',
    notes: '',
  });

  const load = useCallback(async () => {
    try {
      setEvents(await api('/events'));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (!form.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return;
    setSaving(true);
    try {
      await api('/events', { method: 'POST', body: JSON.stringify(form) });
      setModal(false);
      setForm({ title: '', event_type: 'shooting', date: todayStr(), time: '', client_name: '', notes: '' });
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (e: any) => {
    if (await confirmAsync('حذف الموعد', `حذف "${e.title}"؟`)) {
      await api(`/events/${e.id}`, { method: 'DELETE' });
      load();
    }
  };

  // group by date
  const grouped: { date: string; items: any[] }[] = [];
  for (const e of events) {
    const g = grouped.find((x) => x.date === e.date);
    if (g) g.items.push(e);
    else grouped.push({ date: e.date, items: [e] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title="التقويم"
        subtitle="مواعيد التصوير والتسليم"
        canBack
        right={
          <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)} testID="add-event-btn">
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.googleBanner}>
          <Ionicons name="logo-google" size={16} color={C.muted} />
          <Text style={styles.googleBannerText}>ربط Google Calendar قادم قريباً — التقويم الداخلي جاهز الآن</Text>
        </View>

        {grouped.length === 0 && (
          <Empty icon="calendar-outline" text="لا توجد مواعيد" hint="أضف مواعيد التصوير والتسليم لتظهر هنا وفي الرئيسية" />
        )}

        {grouped.map((g) => {
          const isPast = g.date < todayStr();
          return (
            <View key={g.date} style={{ marginBottom: 16, opacity: isPast ? 0.55 : 1 }}>
              <Text style={styles.dateHeader}>
                {formatDate(g.date)}
                {g.date === todayStr() ? '  •  اليوم' : ''}
              </Text>
              {g.items.map((e) => {
                const meta = EVENT_META[e.event_type] || EVENT_META.other;
                return (
                  <View key={e.id} style={styles.card}>
                    <View style={[styles.iconWrap, { backgroundColor: `${meta.color}15` }]}>
                      <Ionicons name={meta.icon} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.cardTitle}>{e.title}</Text>
                      <Text style={styles.cardMeta}>
                        {meta.label}
                        {e.time ? ` • ${e.time}` : ''}
                        {e.client_name ? ` • ${e.client_name}` : ''}
                      </Text>
                      {!!e.notes && <Text style={styles.cardNotes}>{e.notes}</Text>}
                    </View>
                    <TouchableOpacity onPress={() => remove(e)} hitSlop={6}>
                      <Ionicons name="trash-outline" size={17} color={C.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <AppModal visible={modal} title="إضافة موعد" onClose={() => setModal(false)} onSave={save} saving={saving}>
        <Field label="العنوان *" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="مثال: تصوير مشروع الأفق" />
        <Text style={styles.fieldLabel}>نوع الموعد</Text>
        <Chips options={EVENT_TYPES} value={form.event_type} onChange={(v) => setForm({ ...form, event_type: v })} />
        <Field label="التاريخ (YYYY-MM-DD) *" value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} placeholder="2026-06-20" autoCapitalize="none" />
        <Field label="الوقت" value={form.time} onChangeText={(v) => setForm({ ...form, time: v })} placeholder="16:30" autoCapitalize="none" />
        <Field label="اسم العميل" value={form.client_name} onChangeText={(v) => setForm({ ...form, client_name: v })} placeholder="اختياري" />
        <Field label="ملاحظات" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline placeholder="الموقع، المعدات المطلوبة..." />
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  googleBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
  },
  googleBannerText: { flex: 1, fontFamily: F.regular, fontSize: 11, color: C.muted, textAlign: 'right' },
  dateHeader: { fontFamily: F.bold, fontSize: 14, color: C.onSurface2, textAlign: 'right', marginBottom: 8 },
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 14,
    marginBottom: 8,
    ...shadow,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface, textAlign: 'right' },
  cardMeta: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
  cardNotes: { fontFamily: F.regular, fontSize: 11, color: C.onSurface2, marginTop: 4, textAlign: 'right' },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
});
