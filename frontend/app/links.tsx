import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { AppModal, Empty, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

export default function LinksScreen() {
  const [links, setLinks] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', url: '' });

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

  const save = async () => {
    if (!form.title.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      const url = form.url.startsWith('http') ? form.url : `https://${form.url}`;
      await api('/links', { method: 'POST', body: JSON.stringify({ ...form, url }) });
      setModal(false);
      setForm({ title: '', url: '' });
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
        subtitle="لوحاتك ومواقعك الخارجية"
        canBack
        right={
          <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)} testID="add-link-btn">
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {links.length === 0 && <Empty icon="link-outline" text="لا توجد روابط" hint="أضف روابط لوحاتك الخارجية للوصول السريع" />}
        {links.map((l) => (
          <TouchableOpacity key={l.id} style={styles.card} onPress={() => Linking.openURL(l.url)}>
            <View style={styles.iconWrap}>
              <Ionicons name={(l.icon as any) || 'link-outline'} size={20} color={C.brand} />
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.title}>{l.title}</Text>
              <Text style={styles.url} numberOfLines={1}>
                {l.url}
              </Text>
            </View>
            <TouchableOpacity onPress={() => remove(l)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={C.muted} />
            </TouchableOpacity>
            <Ionicons name="open-outline" size={18} color={C.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <AppModal visible={modal} title="إضافة رابط" onClose={() => setModal(false)} onSave={save} saving={saving}>
        <Field label="العنوان *" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="مثال: لوحة إعلانات TikTok" />
        <Field label="الرابط *" value={form.url} onChangeText={(v) => setForm({ ...form, url: v })} placeholder="https://..." autoCapitalize="none" keyboardType="url" />
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 14,
    marginBottom: 10,
    ...shadow,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface },
  url: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
});
