import React, { useCallback, useState } from 'react';
import {
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
import * as Haptics from 'expo-haptics';
import { api } from '@/src/api';
import { useAuth } from '@/src/AuthContext';
import { AppModal, Chips, Empty, Field, ScreenHeader } from '@/src/ui';
import { DateField } from '@/src/DateTimePicker';
import { C, F, R, shadow } from '@/src/theme';

type Task = {
  id: string;
  title: string;
  description: string;
  due_date: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'done';
  client_name?: string;
};

const PRIORITY_COLORS: Record<string, string> = {
  low: C.muted,
  normal: C.brand,
  high: '#E08A00',
  urgent: C.error,
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'مهمة',
  urgent: 'عاجلة',
};

export default function TodayScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<{ overdue: Task[]; today: Task[]; upcoming: Task[] }>({
    overdue: [],
    today: [],
    upcoming: [],
  });
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', due_date: '', priority: 'normal' as Task['priority'] });
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const [stats, setStats] = useState({ completed: 0, pending: 0, completion_rate: 0 });
  const [sanadPlan, setSanadPlan] = useState('');
  const [sanadPlanLoading, setSanadPlanLoading] = useState(false);
  const [refreshingPlan, setRefreshingPlan] = useState(false);

  const load = useCallback(async () => {
    try {
      // مزامنة صامتة مع Google Tasks لو فيه حساب مربوط — أي تعديل/حذف صار مباشرة
      // بتطبيق Google Tasks ينعكس هنا تلقائياً قبل ما نعرض القائمة.
      try {
        const accountsRes = await api('/google/accounts');
        const firstAccount = accountsRes?.accounts?.[0]?.email;
        if (firstAccount) {
          await api(`/gtasks/sync-from-google?account=${encodeURIComponent(firstAccount)}`, { method: 'POST' });
        }
      } catch {
        // ما فيه حساب مربوط أو المزامنة فشلت — نكمل بالمهام المحلية بدون ما نوقف الشاشة
      }

      // جرب الـ Endpoint المحسّن أولاً
      try {
        const enhanced = await api('/tasks/today/enhanced');
        setGroups({
          overdue: enhanced?.sections?.overdue ?? [],
          today: enhanced?.sections?.today ?? [],
          upcoming: enhanced?.sections?.upcoming ?? [],
        });
        setStats(enhanced?.stats ?? { completed: 0, pending: 0, completion_rate: 0 });
      } catch {
        // أسقف للـ Endpoint القديم
        const fallback = await api('/tasks/my-today');
        setGroups({
          overdue: fallback?.overdue ?? [],
          today: fallback?.today ?? [],
          upcoming: fallback?.upcoming ?? [],
        });
      }

      // خطة سند الفعلية لليوم (تحليل حقيقي بالذكاء الصناعي، مخزّنة يوميًا)
      setSanadPlanLoading(true);
      try {
        const r = await api('/tasks/today/sanad-plan');
        setSanadPlan(r?.plan || '');
      } catch {}
      setSanadPlanLoading(false);
    } catch {
      // في حال فشل الاثنين، خلي القيم فاضية بدل ما تنهار الشاشة
      setGroups({ overdue: [], today: [], upcoming: [] });
    }
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const refreshSanadPlan = async () => {
    setRefreshingPlan(true);
    try {
      const r = await api('/tasks/today/sanad-plan/refresh', { method: 'POST' });
      setSanadPlan(r?.plan || '');
    } catch {}
    setRefreshingPlan(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openAdd = () => {
    setEditingTask(null);
    setForm({ title: '', description: '', due_date: '', priority: 'normal' });
    setModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      Alert.alert('العنوان مطلوب', 'اكتب عنوان المهمة');
      return;
    }
    setSaving(true);
    try {
      if (editingTask) {
        await api(`/tasks/${editingTask.id}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await api('/tasks', { method: 'POST', body: JSON.stringify(form) });
      }
      setModal(false);
      setEditingTask(null);
      load();
    } catch (e: any) {
      Alert.alert('تعذّر الحفظ', e?.message || 'حدث خطأ');
    }
    setSaving(false);
  };

  const markDone = async (task: Task) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await api(`/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify({ status: 'done' }) });
      load();
    } catch (e: any) {
      Alert.alert('تعذّر', e?.message || 'حدث خطأ');
    }
  };

  const deleteTask = async (task: Task) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('حذف المهمة', `حذف "${task.title}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/tasks/${task.id}`, { method: 'DELETE' });
            load();
          } catch (e: any) {
            Alert.alert('تعذّر الحذف', e?.message || 'حدث خطأ');
          }
        },
      },
    ]);
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      due_date: task.due_date || '',
      priority: task.priority,
    });
    setModal(true);
  };

  const renderTask = (task: Task) => (
    <TouchableOpacity
      key={task.id}
      style={styles.card}
      onPress={() => openEditTask(task)}
      onLongPress={() => deleteTask(task)}
      activeOpacity={0.7}
    >
      <View pointerEvents="none" style={[styles.cardBracket, styles.cardBracketTL, { opacity: 0.3 }]} />
      <TouchableOpacity style={styles.checkBtn} onPress={() => markDone(task)}>
        <Ionicons name="ellipse-outline" size={22} color={C.brand} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{task.title}</Text>
        {!!task.description && <Text style={styles.desc}>{task.description}</Text>}
        <View style={styles.metaRow}>
          {!!task.due_date && (
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={12} color={C.muted} />
              <Text style={styles.metaText}>{task.due_date}</Text>
            </View>
          )}
          {!!task.client_name && (
            <View style={styles.metaChip}>
              <Ionicons name="person-outline" size={12} color={C.muted} />
              <Text style={styles.metaText}>{task.client_name}</Text>
            </View>
          )}
          <View style={[styles.metaChip, { backgroundColor: PRIORITY_COLORS[task.priority] + '22' }]}>
            <Text style={[styles.metaText, { color: PRIORITY_COLORS[task.priority] }]}>
              {PRIORITY_LABELS[task.priority]}
            </Text>
          </View>
        </View>
      </View>
      <TouchableOpacity onPress={() => deleteTask(task)} hitSlop={8} style={{ padding: 4 }}>
        <Ionicons name="trash-outline" size={18} color={C.muted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const totalCount = groups.overdue.length + groups.today.length + groups.upcoming.length;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title={`مهامي اليوم${user?.name ? ' — ' + user.name : ''}`}
        right={
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} testID="add-task-btn">
            <Ionicons name="add" size={22} color={C.brand} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.wrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} />}
      >
        {/* إحصائيات اليوم + خطة سند الفعلية */}
        {totalCount > 0 && (
          <View style={styles.statsCard}>
            <View pointerEvents="none" style={[styles.cardBracket, styles.cardBracketTL]} />
            <View pointerEvents="none" style={[styles.cardBracket, styles.cardBracketBR]} />
            {/* شريط التقدم */}
            <View style={styles.progressSection}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>التقدم</Text>
                <Text style={styles.progressPercent}>{Math.round(stats.completion_rate)}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max(3, stats.completion_rate)}%`,
                      backgroundColor:
                        stats.completion_rate >= 75
                          ? '#4CAF50'
                          : stats.completion_rate >= 50
                            ? '#FF9800'
                            : stats.completion_rate >= 25
                              ? '#FFC107'
                              : C.error,
                    },
                  ]}
                />
              </View>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Ionicons name="checkmark-done" size={14} color="#4CAF50" />
                  <Text style={styles.statText}>{stats.completed} مكتملة</Text>
                </View>
                <View style={styles.stat}>
                  <Ionicons name="time-outline" size={14} color={C.warning} />
                  <Text style={styles.statText}>{stats.pending} متبقية</Text>
                </View>
              </View>
            </View>

            {/* خطة سند الفعلية — تحليل حقيقي مبني على مهامك ومواعيدك اليوم، مو رسالة جاهزة */}
            <View style={styles.sanadPlanBox}>
              <View style={styles.sanadPlanHeader}>
                <View style={styles.sanadPlanTitleRow}>
                  <Ionicons name="sparkles" size={16} color={C.brand} />
                  <Text style={styles.sanadPlanTitle}>خطة سند لليوم</Text>
                </View>
                <TouchableOpacity onPress={refreshSanadPlan} disabled={refreshingPlan} hitSlop={8}>
                  <Ionicons name="refresh" size={16} color={refreshingPlan ? C.muted : C.brand} />
                </TouchableOpacity>
              </View>
              {sanadPlanLoading ? (
                <Text style={styles.sanadPlanText}>سند يحلل يومك...</Text>
              ) : (
                <Text style={styles.sanadPlanText}>{sanadPlan || 'ما فيه خطة حالياً'}</Text>
              )}
            </View>
          </View>
        )}

        {totalCount === 0 ? (
          <Empty icon="checkmark-done-circle-outline" text="لا مهام عليك اليوم" hint="اضغط + لإضافة مهمة جديدة" />
        ) : (
          <>
            {groups.overdue.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: C.error }]}>متأخرة ({groups.overdue.length})</Text>
                {groups.overdue.map(renderTask)}
              </>
            )}
            {groups.today.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>اليوم ({groups.today.length})</Text>
                {groups.today.map(renderTask)}
              </>
            )}
            {groups.upcoming.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>قادمة ({groups.upcoming.length})</Text>
                {groups.upcoming.map(renderTask)}
              </>
            )}
          </>
        )}
      </ScrollView>

      <AppModal
        visible={modal}
        title={editingTask ? 'تعديل المهمة' : 'مهمة جديدة'}
        onClose={() => {
          setModal(false);
          setEditingTask(null);
        }}
        onSave={save}
        saving={saving}
      >
        <Field label="عنوان المهمة" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="مثال: مونتاج فيديو فلة الرياض" />
        <Field
          label="تفاصيل (اختياري)"
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
          multiline
        />
        <DateField label="تاريخ الاستحقاق" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
        <Text style={styles.chipsLabel}>الأولوية</Text>
        <Chips
          options={[
            { key: 'low', label: 'منخفضة' },
            { key: 'normal', label: 'عادية' },
            { key: 'high', label: 'مهمة' },
            { key: 'urgent', label: 'عاجلة' },
          ]}
          value={form.priority}
          onChange={(v) => setForm({ ...form, priority: v as Task['priority'] })}
        />
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontFamily: F.bold, fontSize: 14, color: C.onSurface, textAlign: 'right', marginBottom: 8, marginTop: 12 },
  card: {
    flexDirection: 'row-reverse',
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 14,
    marginBottom: 10,
    gap: 10,
    overflow: 'hidden',
    ...shadow,
  },
  cardBracket: { position: 'absolute', width: 12, height: 12, borderColor: C.brand },
  cardBracketTL: { top: 6, left: 6, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 4 },
  cardBracketBR: { bottom: 6, right: 6, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: 4, opacity: 0.35 },
  checkBtn: { paddingTop: 2 },
  title: { fontFamily: F.bold, fontSize: 14, color: C.onSurface, textAlign: 'right' },
  desc: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginTop: 4 },
  metaRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.surface2,
    borderRadius: R.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaText: { fontFamily: F.semibold, fontSize: 11, color: C.muted },
  chipsLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginBottom: 6 },
  
  // الإحصائيات والتحفيز
  statsCard: {
    backgroundColor: C.brandSoft,
    borderRadius: R.lg,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.brand + '30',
    overflow: 'hidden',
  },
  progressSection: {
    gap: 10,
  },
  progressRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontFamily: F.semibold,
    fontSize: 12,
    color: C.onSurface,
  },
  progressPercent: {
    fontFamily: F.bold,
    fontSize: 16,
    color: C.brand,
  },
  progressBar: {
    height: 6,
    backgroundColor: C.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  statsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 12,
  },
  stat: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontFamily: F.semibold,
    fontSize: 12,
    color: C.onSurface,
  },
  sanadPlanBox: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 12,
    marginTop: 12,
  },
  sanadPlanHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sanadPlanTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  sanadPlanTitle: { fontFamily: F.semibold, fontSize: 12.5, color: C.brand },
  sanadPlanText: { fontFamily: F.regular, fontSize: 13, color: C.onSurface, textAlign: 'right', lineHeight: 20 },
});
