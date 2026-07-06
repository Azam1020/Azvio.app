import React, { useCallback, useState } from 'react';
import {
  Alert,
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

  const load = useCallback(async () => {
    try {
      setGroups(await api('/tasks/my-today'));
    } catch {}
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openAdd = () => {
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
      await api('/tasks', { method: 'POST', body: JSON.stringify(form) });
      setModal(false);
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

  const renderTask = (task: Task) => (
    <View key={task.id} style={styles.card}>
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
    </View>
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

      <AppModal visible={modal} title="مهمة جديدة" onClose={() => setModal(false)} onSave={save} saving={saving}>
        <Field label="عنوان المهمة" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="مثال: مونتاج فيديو فلة الرياض" />
        <Field
          label="تفاصيل (اختياري)"
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
          multiline
        />
        <Field
          label="تاريخ الاستحقاق (YYYY-MM-DD)"
          value={form.due_date}
          onChangeText={(v) => setForm({ ...form, due_date: v })}
          placeholder="2026-07-10"
        />
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
    ...shadow,
  },
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
});
