import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
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
  const router = useRouter();
  const [events, setEvents] = useState<any[]>([]);
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([]);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncToGoogle, setSyncToGoogle] = useState(true);
  const [syncAccountEmail, setSyncAccountEmail] = useState<string>('');
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
    try {
      const r = await api('/google/accounts');
      const accts = r.accounts || [];
      setGoogleAccounts(accts);
      if (accts.length > 0 && !syncAccountEmail) {
        setSyncAccountEmail(accts[0].email);
      }
      // Fetch google events from all connected accounts
      if (accts.length > 0) {
        setLoadingGoogle(true);
        const all: any[] = [];
        for (const acc of accts) {
          try {
            const g = await api(`/google/calendar/events?account=${encodeURIComponent(acc.email)}&days_ahead=60`);
            (g.events || []).forEach((e: any) => all.push({ ...e, __account: acc.email }));
          } catch {}
        }
        setGoogleEvents(all);
        setLoadingGoogle(false);
      } else {
        setGoogleEvents([]);
      }
    } catch {}
  }, [syncAccountEmail]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (!form.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return;
    setSaving(true);
    try {
      // 1) Save internal event
      await api('/events', { method: 'POST', body: JSON.stringify(form) });
      // 2) Optionally push to Google Calendar
      if (syncToGoogle && syncAccountEmail && googleAccounts.length > 0) {
        try {
          const startIso = form.time
            ? `${form.date}T${form.time}:00`
            : `${form.date}T00:00:00`;
          const endIso = form.time
            ? `${form.date}T${(parseInt(form.time.split(':')[0] || '0', 10) + 1).toString().padStart(2, '0')}:${form.time.split(':')[1] || '00'}:00`
            : `${form.date}T23:59:00`;
          await api('/google/calendar/events', {
            method: 'POST',
            body: JSON.stringify({
              account_email: syncAccountEmail,
              summary: form.title,
              description: [form.client_name ? `العميل: ${form.client_name}` : '', form.notes].filter(Boolean).join('\n'),
              start: startIso,
              end: endIso,
              all_day: !form.time,
              timezone: 'Asia/Riyadh',
            }),
          });
        } catch (e) {
          // Sync failure shouldn't block internal save
          console.warn('Google sync failed', e);
        }
      }
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

  // Combine internal + google events, group by date
  const combined: any[] = [
    ...events.map((e) => ({ ...e, __source: 'internal' })),
    ...googleEvents.map((g) => {
      const start = g.start?.dateTime || g.start?.date || '';
      return {
        id: `g-${g.id}`,
        title: g.summary || '(بدون عنوان)',
        event_type: 'other',
        date: start.slice(0, 10),
        time: g.start?.dateTime ? start.slice(11, 16) : '',
        notes: g.description || '',
        __source: 'google',
        __account: g.__account,
        __htmlLink: g.htmlLink,
      };
    }),
  ];
  combined.sort((a, b) => (a.date > b.date ? 1 : -1));

  const grouped: { date: string; items: any[] }[] = [];
  for (const e of combined) {
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
        {/* Google connect banner */}
        <TouchableOpacity
          style={[styles.gBanner, googleAccounts.length > 0 && styles.gBannerConnected]}
          onPress={() => router.push('/google-accounts')}
          testID="google-accounts-link"
        >
          <Ionicons name="logo-google" size={18} color={googleAccounts.length > 0 ? C.success : '#DB4437'} />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.gBannerTitle}>
              {googleAccounts.length > 0
                ? `${googleAccounts.length} حساب Google مربوط`
                : 'اربط تقويم Google للمزامنة التلقائية'}
            </Text>
            <Text style={styles.gBannerSub}>
              {googleAccounts.length > 0
                ? googleAccounts.map((a) => a.email).join(' • ')
                : 'اضغط للربط'}
            </Text>
          </View>
          {loadingGoogle && <ActivityIndicator size="small" color={C.brand} />}
          <Ionicons name="chevron-back" size={16} color={C.muted} />
        </TouchableOpacity>

        {grouped.length === 0 ? (
          <Empty icon="calendar-outline" text="لا توجد مواعيد" hint="أضف موعدك الأول" />
        ) : (
          grouped.map((group) => (
            <View key={group.date} style={{ marginBottom: 16 }}>
              <Text style={styles.dateHeader}>{formatDate(group.date)}</Text>
              {group.items.map((e) => {
                const meta = EVENT_META[e.event_type] || EVENT_META.other;
                const isGoogle = e.__source === 'google';
                return (
                  <View key={e.id} style={[styles.eventCard, isGoogle && styles.googleEvent]}>
                    <View style={[styles.eventIcon, { backgroundColor: `${meta.color}18` }]}>
                      <Ionicons name={isGoogle ? 'logo-google' : meta.icon} size={18} color={isGoogle ? '#DB4437' : meta.color} />
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.eventTitle}>{e.title}</Text>
                        {isGoogle && (
                          <View style={styles.gTag}>
                            <Text style={styles.gTagText}>Google</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.eventMeta}>
                        {meta.label}
                        {e.time ? ` • ${e.time}` : ''}
                        {e.client_name ? ` • ${e.client_name}` : ''}
                        {isGoogle && e.__account ? ` • ${e.__account}` : ''}
                      </Text>
                      {!!e.notes && <Text style={styles.eventNotes}>{e.notes}</Text>}
                    </View>
                    {!isGoogle && (
                      <TouchableOpacity onPress={() => remove(e)} hitSlop={6}>
                        <Ionicons name="close" size={18} color={C.muted} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      <AppModal visible={modal} title="إضافة موعد" onClose={() => setModal(false)} onSave={save} saving={saving}>
        <Field label="العنوان *" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="مثال: تصوير فيلا الأمير" />
        <Text style={styles.fieldLabel}>النوع</Text>
        <Chips options={EVENT_TYPES} value={form.event_type} onChange={(v) => setForm({ ...form, event_type: v })} />
        <Field label="التاريخ *" value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <Field label="الوقت" value={form.time} onChangeText={(v) => setForm({ ...form, time: v })} placeholder="HH:MM (اختياري)" autoCapitalize="none" />
        <Field label="اسم العميل" value={form.client_name} onChangeText={(v) => setForm({ ...form, client_name: v })} />
        <Field label="ملاحظات" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline />

        {googleAccounts.length > 0 && (
          <View style={styles.syncCard}>
            <View style={styles.syncRow}>
              <Switch
                value={syncToGoogle}
                onValueChange={setSyncToGoogle}
                trackColor={{ true: C.brand, false: C.border }}
                thumbColor="#FFF"
                testID="sync-google-switch"
              />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.syncTitle}>أضف أيضاً إلى Google Calendar</Text>
                <Text style={styles.syncSub}>يُنشأ الحدث في تقويمك الأساسي فوراً</Text>
              </View>
              <Ionicons name="logo-google" size={18} color="#DB4437" />
            </View>
            {syncToGoogle && googleAccounts.length > 1 && (
              <View style={{ marginTop: 10, gap: 6 }}>
                <Text style={styles.syncSub}>اختر الحساب:</Text>
                <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 }}>
                  {googleAccounts.map((a) => {
                    const active = a.email === syncAccountEmail;
                    return (
                      <TouchableOpacity
                        key={a.email}
                        style={[styles.accountChip, active && styles.accountChipActive]}
                        onPress={() => setSyncAccountEmail(a.email)}
                      >
                        <Text style={[styles.accountChipText, active && { color: '#FFF' }]}>{a.email}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  gBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
    ...shadow,
  },
  gBannerConnected: { borderColor: C.success, backgroundColor: '#F5FFF8' },
  gBannerTitle: { fontFamily: F.bold, fontSize: 13, color: C.onSurface },
  gBannerSub: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
  dateHeader: {
    fontFamily: F.bold,
    fontSize: 14,
    color: C.brand,
    textAlign: 'right',
    marginBottom: 8,
    backgroundColor: C.brandSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: R.pill,
    alignSelf: 'flex-end',
  },
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
  googleEvent: { borderRightWidth: 3, borderRightColor: '#DB4437' },
  eventIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { fontFamily: F.bold, fontSize: 14, color: C.onSurface },
  eventMeta: { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: 2 },
  eventNotes: { fontFamily: F.regular, fontSize: 11, color: C.onSurface2, marginTop: 4, textAlign: 'right' },
  gTag: {
    backgroundColor: '#FCEDED',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: R.sm,
  },
  gTagText: { fontFamily: F.bold, fontSize: 10, color: '#DB4437' },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
  syncCard: {
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(62,145,148,0.25)',
  },
  syncRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  syncTitle: { fontFamily: F.bold, fontSize: 13, color: C.onSurface },
  syncSub: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2, textAlign: 'right' },
  accountChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  accountChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  accountChipText: { fontFamily: F.semibold, fontSize: 11, color: C.onSurface2 },
});
