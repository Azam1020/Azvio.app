import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { AppModal, Empty, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

const DEFAULT_ICON = 'link-outline';

const ICON_OPTIONS: any[] = [
  'link-outline',
  'rocket-outline',
  'globe-outline',
  'server-outline',
  'cube-outline',
  'folder-open-outline',
  'briefcase-outline',
  'card-outline',
  'stats-chart-outline',
  'people-outline',
  'chatbubbles-outline',
  'cloud-outline',
];

export default function LinksScreen() {
  const [links, setLinks] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', url: '', icon: DEFAULT_ICON });

  const load = useCallback(async () => {
    try {
      setLinks(await api('/links'));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openAdd = () => {
    setEditId(null);
    setForm({ title: '', url: '', icon: DEFAULT_ICON });
    setModal(true);
  };

  const openEdit = (l: any) => {
    setEditId(l.id);
    setForm({ title: l.title || '', url: l.url || '', icon: l.icon || DEFAULT_ICON });
    setModal(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      const url = form.url.startsWith('http') ? form.url : `https://${form.url}`;
      const payload = { title: form.title.trim(), url, icon: form.icon };
      if (editId) {
        await api(`/links/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/links', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModal(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (l: any) => {
    if (await confirmAsync('حذف الرابط', `حذف "${l.title}"؟`)) {
      await api(`/links/${l.id}`, { method: 'DELETE' });
      load();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title="روابط سريعة"
        subtitle="روابطك اليومية والخارجية"
        canBack
        right={
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} testID="add-link-btn">
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {links.length === 0 && (
          <Empty icon="link-outline" text="لا توجد روابط بعد" hint="أضف روابطك اليومية للوصول السريع" />
        )}
        {links.map((l) => (
          <View key={l.id} style={styles.card}>
            <TouchableOpacity style={styles.cardMain} onPress={() => Linking.openURL(l.url)} testID={`link-${l.id}`}>
              <View style={styles.iconWrap}>
                <Ionicons name={l.icon || DEFAULT_ICON} size={22} color={C.brand} />
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.title}>{l.title}</Text>
                <Text style={styles.url} numberOfLines={1}>
                  {l.url}
                </Text>
              </View>
              <Ionicons name="open-outline" size={18} color={C.muted} />
            </TouchableOpacity>
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => openEdit(l)} hitSlop={6} testID={`edit-link-${l.id}`}>
                <Ionicons name="create-outline" size={18} color={C.muted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(l)} hitSlop={6} testID={`delete-link-${l.id}`}>
                <Ionicons name="trash-outline" size={18} color={C.error} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <AppModal
        visible={modal}
        title={editId ? 'تعديل الرابط' : 'إضافة رابط جديد'}
        onClose={() => setModal(false)}
        onSave={save}
        saving={saving}
      >
        <Field
          label="العنوان *"
          value={form.title}
          onChangeText={(v) => setForm({ ...form, title: v })}
          placeholder="مثال: منصة رائد"
        />
        <Field
          label="الرابط *"
          value={form.url}
          onChangeText={(v) => setForm({ ...form, url: v })}
          placeholder="https://..."
          autoCapitalize="none"
          keyboardType="url"
        />
        <Text style={styles.iconLabel}>الأيقونة</Text>
        <View style={styles.iconGrid}>
          {ICON_OPTIONS.map((ic) => {
            const active = form.icon === ic;
            return (
              <TouchableOpacity
                key={ic}
                onPress={() => setForm({ ...form, icon: ic })}
                style={[styles.iconOption, active && styles.iconOptionActive]}
              >
                <Ionicons name={ic} size={20} color={active ? '#FFF' : C.onSurface2} />
              </TouchableOpacity>
            );
          })}
        </View>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 14,
    marginBottom: 10,
    ...shadow,
  },
  cardMain: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: F.bold, fontSize: 15, color: C.onSurface },
  url: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
  actions: {
    flexDirection: 'row-reverse',
    gap: 18,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    justifyContent: 'flex-end',
  },
  iconLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 8, textAlign: 'right' },
  iconGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  iconOption: {
    width: 42,
    height: 42,
    borderRadius: R.md,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  iconOptionActive: { backgroundColor: C.brand, borderColor: C.brand },
});
