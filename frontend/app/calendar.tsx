import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { AppModal, Chips, Empty, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { DateField, TimeField, formatDateArabic, formatTime12h } from '@/src/DateTimePicker';
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

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

const todayStr = () => new Date().toISOString().slice(0, 10);
const dateISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type ViewMode = 'month' | 'week' | 'list';

export default function CalendarScreen() {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState<Date>(new Date()); // anchor date (month/week)
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [events, setEvents] = useState<any[]>([]);
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([]);
  const [enabledCalendars, setEnabledCalendars] = useState<Record<string, boolean>>({ internal: true });
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
      // Ensure enabledCalendars has entries for all accounts
      setEnabledCalendars((prev) => {
        const next = { ...prev };
        accts.forEach((a: any) => {
          if (!(a.email in next)) next[a.email] = true;
        });
        return next;
      });
      if (accts.length > 0 && !syncAccountEmail) {
        setSyncAccountEmail(accts[0].email);
      }
      if (accts.length > 0) {
        setLoadingGoogle(true);
        const all: any[] = [];
        for (const acc of accts) {
          try {
            const g = await api(`/google/calendar/events?account=${encodeURIComponent(acc.email)}&days_ahead=90`);
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

  // Combine events (respecting filters)
  const combined = useMemo(() => {
    const arr: any[] = [];
    if (enabledCalendars.internal !== false) {
      events.forEach((e) => arr.push({ ...e, __source: 'internal', __color: EVENT_META[e.event_type]?.color || C.muted }));
    }
    googleEvents.forEach((g) => {
      if (enabledCalendars[g.__account] === false) return;
      const start = g.start?.dateTime || g.start?.date || '';
      arr.push({
        id: `g-${g.id}`,
        title: g.summary || '(بدون عنوان)',
        event_type: 'other',
        date: start.slice(0, 10),
        time: g.start?.dateTime ? start.slice(11, 16) : '',
        notes: g.description || '',
        __source: 'google',
        __account: g.__account,
        __color: '#DB4437',
        __htmlLink: g.htmlLink,
      });
    });
    arr.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : (a.time || '').localeCompare(b.time || '')));
    return arr;
  }, [events, googleEvents, enabledCalendars]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of combined) {
      if (!e.date) continue;
      (map[e.date] = map[e.date] || []).push(e);
    }
    return map;
  }, [combined]);

  // Nav helpers
  const shiftMonth = (delta: number) => {
    const d = new Date(cursor);
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    setCursor(d);
  };
  const shiftWeek = (delta: number) => {
    const d = new Date(cursor);
    d.setDate(d.getDate() + 7 * delta);
    setCursor(d);
  };
  const goToday = () => {
    const t = new Date();
    setCursor(t);
    setSelectedDate(dateISO(t));
  };

  const save = async () => {
    if (!form.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return;
    setSaving(true);
    try {
      await api('/events', { method: 'POST', body: JSON.stringify(form) });
      if (syncToGoogle && syncAccountEmail && googleAccounts.length > 0) {
        try {
          const startIso = form.time
            ? `${form.date}T${form.time}:00`
            : `${form.date}T00:00:00`;
          const hParts = form.time ? form.time.split(':') : ['0', '0'];
          const nextH = Math.min(23, parseInt(hParts[0] || '0', 10) + 1);
          const endIso = form.time
            ? `${form.date}T${String(nextH).padStart(2, '0')}:${hParts[1] || '00'}:00`
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
          console.warn('Google sync failed', e);
        }
      }
      setModal(false);
      setForm({ title: '', event_type: 'shooting', date: selectedDate, time: '', client_name: '', notes: '' });
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (e: any) => {
    if (e.__source === 'google') return; // don't allow deleting google-only from this UI
    if (await confirmAsync('حذف الموعد', `حذف "${e.title}"؟`)) {
      await api(`/events/${e.id}`, { method: 'DELETE' });
      load();
    }
  };

  const openAdd = (dateStr?: string) => {
    setForm({
      title: '',
      event_type: 'shooting',
      date: dateStr || selectedDate,
      time: '',
      client_name: '',
      notes: '',
    });
    setModal(true);
  };

  // Header title
  const headerTitle = mode === 'week'
    ? `الأسبوع • ${AR_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : mode === 'month'
      ? `${AR_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
      : 'كل المواعيد';

  // Calendar filter chips
  const calendarChips = [
    { key: 'internal', label: 'الداخلي', color: C.brand },
    ...googleAccounts.map((a) => ({ key: a.email, label: a.email.split('@')[0], color: '#DB4437' })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title="التقويم"
        subtitle={headerTitle}
        canBack
        right={
          <TouchableOpacity style={styles.addBtn} onPress={() => openAdd()} testID="add-event-btn">
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        }
      />

      {/* View mode segmented */}
      <View style={styles.modeRow}>
        {(['month', 'week', 'list'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            onPress={() => setMode(m)}
            testID={`view-${m}`}
          >
            <Ionicons
              name={m === 'month' ? 'grid-outline' : m === 'week' ? 'list-outline' : 'menu-outline'}
              size={14}
              color={mode === m ? '#FFF' : C.onSurface2}
            />
            <Text style={[styles.modeText, mode === m && { color: '#FFF' }]}>
              {m === 'month' ? 'شهر' : m === 'week' ? 'أسبوع' : 'قائمة'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Calendar sources filter (only if there are Google accounts) */}
      {calendarChips.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {calendarChips.map((ch) => {
            const on = enabledCalendars[ch.key] !== false;
            return (
              <TouchableOpacity
                key={ch.key}
                style={[styles.filterChip, { borderColor: ch.color }, on && { backgroundColor: ch.color }]}
                onPress={() => setEnabledCalendars({ ...enabledCalendars, [ch.key]: !on })}
              >
                <View style={[styles.filterDot, { backgroundColor: on ? '#FFF' : ch.color }]} />
                <Text style={[styles.filterChipText, on && { color: '#FFF' }]}>{ch.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Nav row */}
      {mode !== 'list' && (
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => (mode === 'month' ? shiftMonth(-1) : shiftWeek(-1))} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={C.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToday} style={styles.todayBtn}>
            <Text style={styles.todayText}>اليوم</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => (mode === 'month' ? shiftMonth(1) : shiftWeek(1))} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={C.onSurface} />
          </TouchableOpacity>
        </View>
      )}

      {loadingGoogle && (
        <View style={styles.syncingRow}>
          <ActivityIndicator size="small" color={C.brand} />
          <Text style={styles.syncingText}>يزامن مواعيد Google...</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {mode === 'month' && (
          <MonthView
            cursor={cursor}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            eventsByDate={eventsByDate}
            width={width - 32}
          />
        )}

        {mode === 'week' && (
          <WeekView
            cursor={cursor}
            eventsByDate={eventsByDate}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            onAdd={openAdd}
            onDelete={remove}
          />
        )}

        {/* Selected date events (month mode) */}
        {mode === 'month' && (
          <View style={{ marginTop: 16 }}>
            <View style={styles.selectedDateHeader}>
              <TouchableOpacity onPress={() => openAdd(selectedDate)} style={styles.addOnDate} testID="add-on-date">
                <Ionicons name="add" size={14} color={C.brand} />
                <Text style={styles.addOnDateText}>إضافة</Text>
              </TouchableOpacity>
              <Text style={styles.selectedDateText}>{formatDateArabic(selectedDate)}</Text>
            </View>
            {(eventsByDate[selectedDate] || []).length === 0 ? (
              <Text style={styles.emptyDay}>لا مواعيد في هذا اليوم</Text>
            ) : (
              eventsByDate[selectedDate].map((e) => (
                <EventCard key={e.id} event={e} onDelete={remove} />
              ))
            )}
          </View>
        )}

        {mode === 'list' && (
          <>
            {combined.length === 0 ? (
              <Empty icon="calendar-outline" text="لا توجد مواعيد" hint="أضف موعدك الأول" />
            ) : (
              Object.entries(
                combined.reduce((acc: Record<string, any[]>, e) => {
                  (acc[e.date] = acc[e.date] || []).push(e);
                  return acc;
                }, {})
              ).map(([date, items]) => (
                <View key={date} style={{ marginBottom: 16 }}>
                  <Text style={styles.dateHeader}>{formatDateArabic(date)}</Text>
                  {items.map((e) => (
                    <EventCard key={e.id} event={e} onDelete={remove} />
                  ))}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <AppModal visible={modal} title="إضافة موعد" onClose={() => setModal(false)} onSave={save} saving={saving}>
        <Field label="العنوان *" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="مثال: تصوير فيلا الأمير" />
        <Text style={styles.fieldLabel}>النوع</Text>
        <Chips options={EVENT_TYPES} value={form.event_type} onChange={(v) => setForm({ ...form, event_type: v })} />
        <DateField label="التاريخ" required value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        <TimeField label="الوقت (اختياري)" value={form.time} onChange={(v) => setForm({ ...form, time: v })} allowClear />
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

function EventCard({ event, onDelete }: { event: any; onDelete: (e: any) => void }) {
  const meta = EVENT_META[event.event_type] || EVENT_META.other;
  const isGoogle = event.__source === 'google';
  return (
    <View style={[styles.eventCard, isGoogle && styles.googleEvent]}>
      <View style={[styles.eventIcon, { backgroundColor: `${event.__color || meta.color}18` }]}>
        <Ionicons name={isGoogle ? 'logo-google' : meta.icon} size={18} color={event.__color || meta.color} />
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          {isGoogle && (
            <View style={styles.gTag}>
              <Text style={styles.gTagText}>Google</Text>
            </View>
          )}
        </View>
        <Text style={styles.eventMeta}>
          {!isGoogle ? meta.label : 'موعد'}
          {event.time ? ` • ${formatTime12h(event.time)}` : ''}
          {event.client_name ? ` • ${event.client_name}` : ''}
          {isGoogle && event.__account ? ` • ${event.__account}` : ''}
        </Text>
        {!!event.notes && <Text style={styles.eventNotes} numberOfLines={2}>{event.notes}</Text>}
      </View>
      {!isGoogle && (
        <TouchableOpacity onPress={() => onDelete(event)} hitSlop={6}>
          <Ionicons name="close" size={18} color={C.muted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============ Month grid ============

function MonthView({
  cursor,
  selectedDate,
  onSelect,
  eventsByDate,
  width,
}: {
  cursor: Date;
  selectedDate: string;
  onSelect: (d: string) => void;
  eventsByDate: Record<string, any[]>;
  width: number;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const cellSize = (width - 8) / 7;
  const todayISO = dateISO(new Date());

  return (
    <View style={monthStyles.wrap}>
      {/* Day headers (RTL - Saturday leftmost, Sunday rightmost) */}
      <View style={monthStyles.dayHeaderRow}>
        {AR_DAYS_SHORT.slice().reverse().map((d) => (
          <View key={d} style={[monthStyles.dayHeader, { width: cellSize }]}>
            <Text style={monthStyles.dayHeaderText}>{d}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={monthStyles.row}>
          {row.slice().reverse().map((d, ci) => {
            if (!d) return <View key={ci} style={{ width: cellSize, height: cellSize + 8 }} />;
            const iso = dateISO(d);
            const events = eventsByDate[iso] || [];
            const isSelected = iso === selectedDate;
            const isToday = iso === todayISO;
            return (
              <TouchableOpacity
                key={ci}
                onPress={() => onSelect(iso)}
                style={[
                  monthStyles.cell,
                  { width: cellSize, height: cellSize + 8 },
                  isSelected && monthStyles.cellSelected,
                ]}
              >
                <View style={[isToday && !isSelected && monthStyles.today]}>
                  <Text
                    style={[
                      monthStyles.dayNum,
                      isToday && !isSelected && { color: '#FFF' },
                      isSelected && { color: C.brand, fontFamily: F.bold },
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
                <View style={monthStyles.dots}>
                  {events.slice(0, 3).map((e, i) => (
                    <View key={i} style={[monthStyles.dot, { backgroundColor: e.__color || C.muted }]} />
                  ))}
                  {events.length > 3 && <Text style={monthStyles.moreDot}>+</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ============ Week view ============

function WeekView({
  cursor,
  eventsByDate,
  selectedDate,
  onSelect,
  onAdd,
  onDelete,
}: {
  cursor: Date;
  eventsByDate: Record<string, any[]>;
  selectedDate: string;
  onSelect: (d: string) => void;
  onAdd: (d?: string) => void;
  onDelete: (e: any) => void;
}) {
  // Get week start (Sunday) for cursor
  const start = new Date(cursor);
  start.setDate(start.getDate() - start.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  const todayISO = dateISO(new Date());

  return (
    <View>
      {/* Day strip */}
      <View style={weekStyles.strip}>
        {days.slice().reverse().map((d) => {
          const iso = dateISO(d);
          const isSelected = iso === selectedDate;
          const isToday = iso === todayISO;
          const count = (eventsByDate[iso] || []).length;
          return (
            <TouchableOpacity
              key={iso}
              onPress={() => onSelect(iso)}
              style={[weekStyles.dayCell, isSelected && weekStyles.dayCellActive]}
            >
              <Text style={[weekStyles.dayName, isSelected && { color: '#FFF' }]}>
                {AR_DAYS_SHORT[d.getDay()]}
              </Text>
              <Text style={[weekStyles.dayNum, isSelected && { color: '#FFF' }, isToday && !isSelected && { color: C.brand }]}>
                {d.getDate()}
              </Text>
              {count > 0 && (
                <View style={[weekStyles.badge, isSelected && { backgroundColor: '#FFF' }]}>
                  <Text style={[weekStyles.badgeText, isSelected && { color: C.brand }]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected day details */}
      <View style={{ marginTop: 16 }}>
        <View style={styles.selectedDateHeader}>
          <TouchableOpacity onPress={() => onAdd(selectedDate)} style={styles.addOnDate}>
            <Ionicons name="add" size={14} color={C.brand} />
            <Text style={styles.addOnDateText}>إضافة</Text>
          </TouchableOpacity>
          <Text style={styles.selectedDateText}>{formatDateArabic(selectedDate)}</Text>
        </View>
        {(eventsByDate[selectedDate] || []).length === 0 ? (
          <Text style={styles.emptyDay}>لا مواعيد في هذا اليوم</Text>
        ) : (
          eventsByDate[selectedDate].map((e) => <EventCard key={e.id} event={e} onDelete={onDelete} />)
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  modeRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    padding: 12,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: C.surface2,
    borderRadius: R.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeBtnActive: { backgroundColor: C.brand, borderColor: C.brand },
  modeText: { fontFamily: F.bold, fontSize: 12, color: C.onSurface2 },
  filterRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.surface,
  },
  filterChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: R.pill,
    borderWidth: 1.5,
    backgroundColor: C.surface,
  },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  filterChipText: { fontFamily: F.bold, fontSize: 12, color: C.onSurface },
  navRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: R.pill, backgroundColor: C.brandSoft },
  todayText: { fontFamily: F.bold, fontSize: 12, color: C.brand },
  syncingRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 6, justifyContent: 'center' },
  syncingText: { fontFamily: F.regular, fontSize: 11, color: C.muted },
  selectedDateHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  selectedDateText: { fontFamily: F.bold, fontSize: 14, color: C.brand, textAlign: 'right' },
  addOnDate: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.brandSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  addOnDateText: { fontFamily: F.bold, fontSize: 11, color: C.brand },
  emptyDay: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 20 },
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
  gTag: { backgroundColor: '#FCEDED', paddingHorizontal: 6, paddingVertical: 1, borderRadius: R.sm },
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
  accountChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  accountChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  accountChipText: { fontFamily: F.semibold, fontSize: 11, color: C.onSurface2 },
});

const monthStyles = StyleSheet.create({
  wrap: { backgroundColor: C.surface, borderRadius: R.lg, padding: 4, ...shadow },
  dayHeaderRow: { flexDirection: 'row-reverse', marginBottom: 4 },
  dayHeader: { alignItems: 'center', paddingVertical: 6 },
  dayHeaderText: { fontFamily: F.bold, fontSize: 10, color: C.muted },
  row: { flexDirection: 'row-reverse' },
  cell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    borderRadius: R.sm,
  },
  cellSelected: { backgroundColor: C.brandSoft, borderWidth: 1, borderColor: C.brand },
  today: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface },
  dots: { flexDirection: 'row-reverse', gap: 2, marginTop: 3, alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2 },
  moreDot: { fontFamily: F.bold, fontSize: 8, color: C.muted, marginRight: 2 },
});

const weekStyles = StyleSheet.create({
  strip: { flexDirection: 'row-reverse', gap: 4, padding: 4, backgroundColor: C.surface, borderRadius: R.md, ...shadow },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: R.sm,
    backgroundColor: C.surface2,
    minHeight: 68,
  },
  dayCellActive: { backgroundColor: C.brand },
  dayName: { fontFamily: F.semibold, fontSize: 10, color: C.muted },
  dayNum: { fontFamily: F.bold, fontSize: 16, color: C.onSurface, marginTop: 3 },
  badge: {
    marginTop: 4,
    backgroundColor: C.brand,
    paddingHorizontal: 6,
    borderRadius: R.pill,
    minWidth: 16,
    alignItems: 'center',
  },
  badgeText: { fontFamily: F.bold, fontSize: 10, color: '#FFF' },
});
