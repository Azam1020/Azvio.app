import React, { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '@/src/api';
import { AppModal, Chips, Empty, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';
import { SanadSuggestModal } from '@/src/SanadSuggestModal';
import { suggestContent } from '@/src/clientHelpers';

const STAGES = [
  { key: 'idea', label: 'فكرة', icon: 'bulb' as const, color: '#B8860B' },
  { key: 'filming', label: 'تصوير', icon: 'videocam' as const, color: C.brand },
  { key: 'editing', label: 'مونتاج', icon: 'cut' as const, color: '#16808A' },
  { key: 'published', label: 'منشور', icon: 'checkmark-circle' as const, color: C.success },
];

const NEXT_STAGE: Record<string, string> = {
  idea: 'filming',
  filming: 'editing',
  editing: 'published',
};

export default function ContentScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [sanadOpen, setSanadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', stage: 'idea' });

  const load = useCallback(async () => {
    try {
      setItems(await api('/content'));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api('/content', { method: 'POST', body: JSON.stringify(form) });
      setModal(false);
      setForm({ title: '', description: '', stage: 'idea' });
      load();
    } catch {}
    setSaving(false);
  };

  const advance = async (item: any) => {
    const next = NEXT_STAGE[item.stage];
    if (!next) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    await api(`/content/${item.id}`, { method: 'PUT', body: JSON.stringify({ stage: next }) });
    load();
  };

  const remove = async (item: any) => {
    if (await confirmAsync('حذف', `حذف "${item.title}"؟`)) {
      await api(`/content/${item.id}`, { method: 'DELETE' });
      load();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title="المحتوى"
        subtitle="فكرة ← تصوير ← مونتاج ← منشور"
        canBack
        right={
          <View style={{ flexDirection: 'row-reverse', gap: 6 }}>
            <TouchableOpacity style={styles.sanadBtn} onPress={() => setSanadOpen(true)} testID="sanad-helps-content">
              <Ionicons name="sparkles" size={16} color={C.brand} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)} testID="add-content-btn">
              <Ionicons name="add" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {items.length === 0 && (
          <Empty icon="film-outline" text="ابدأ بتتبع محتواك" hint="أضف أفكار الفيديوهات وتابعها من الفكرة حتى النشر" />
        )}
        {STAGES.map((stage) => {
          const stageItems = items.filter((i) => i.stage === stage.key);
          if (stageItems.length === 0) return null;
          return (
            <View key={stage.key} style={{ marginBottom: 16 }}>
              <View style={styles.stageHeader}>
                <View style={[styles.stageBadge, { backgroundColor: `${stage.color}18` }]}>
                  <Ionicons name={stage.icon} size={15} color={stage.color} />
                  <Text style={[styles.stageLabel, { color: stage.color }]}>{stage.label}</Text>
                </View>
                <Text style={styles.stageCount}>{stageItems.length}</Text>
              </View>
              {stageItems.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    {!!item.description && (
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                    )}
                  </View>
                  <View style={styles.cardActions}>
                    {NEXT_STAGE[item.stage] && (
                      <TouchableOpacity
                        style={[styles.moveBtn, { backgroundColor: `${stage.color}15` }]}
                        onPress={() => advance(item)}
                        testID={`advance-${item.id}`}
                      >
                        <Ionicons name="arrow-back" size={14} color={stage.color} />
                        <Text style={[styles.moveText, { color: stage.color }]}>
                          {STAGES.find((s) => s.key === NEXT_STAGE[item.stage])?.label}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => remove(item)} hitSlop={6}>
                      <Ionicons name="trash-outline" size={17} color={C.muted} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>

      <AppModal visible={modal} title="إضافة محتوى" onClose={() => setModal(false)} onSave={save} saving={saving}>
        <Field label="العنوان *" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="مثال: فيديو جوي لكورنيش جدة" />
        <Field label="الوصف" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline placeholder="تفاصيل الفكرة..." />
        <Text style={styles.fieldLabel}>المرحلة</Text>
        <Chips options={STAGES.map((s) => ({ key: s.key, label: s.label, color: s.color }))} value={form.stage} onChange={(v) => setForm({ ...form, stage: v })} />
      </AppModal>

      <SanadSuggestModal
        visible={sanadOpen}
        onClose={() => setSanadOpen(false)}
        title="سند يساعدني — أفكار محتوى"
        showTopic
        fetcher={async ({ topic }) => {
          const r = await suggestContent({ topic, count: 5 });
          return r.ideas || [];
        }}
        onAccept={async (it) => {
          await api('/content', {
            method: 'POST',
            body: JSON.stringify({ title: it.title, description: it.description || '', stage: 'idea' }),
          });
          load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  sanadBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(62,145,148,0.25)' },
  stageHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  stageBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 5 },
  stageLabel: { fontFamily: F.bold, fontSize: 13 },
  stageCount: { fontFamily: F.semibold, fontSize: 13, color: C.muted },
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
  cardTitle: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface, textAlign: 'right' },
  cardDesc: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginTop: 2 },
  cardActions: { alignItems: 'center', gap: 8 },
  moveBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5 },
  moveText: { fontFamily: F.semibold, fontSize: 11 },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
});
