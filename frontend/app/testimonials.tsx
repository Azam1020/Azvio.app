import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { useAuth } from '@/src/AuthContext';
import { AppModal, Empty, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

type Testimonial = {
  id: string;
  client_name: string;
  rating: number;
  comment: string;
  service_type: string;
};

export default function TestimonialsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<Testimonial[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ client_name: '', rating: 5, comment: '', service_type: 'drone' });

  const load = useCallback(async () => {
    try {
      setItems(await api('/testimonials'));
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

  const save = async () => {
    if (!form.client_name.trim() || !form.comment.trim()) {
      Alert.alert('بيانات ناقصة', 'اسم العميل والتقييم النصي مطلوبان');
      return;
    }
    setSaving(true);
    try {
      await api('/testimonials', { method: 'POST', body: JSON.stringify(form) });
      setModal(false);
      setForm({ client_name: '', rating: 5, comment: '', service_type: 'drone' });
      load();
    } catch (e: any) {
      Alert.alert('تعذّر الحفظ', e?.message || 'حدث خطأ');
    }
    setSaving(false);
  };

  const remove = async (t: Testimonial) => {
    if (!(await confirmAsync('حذف التقييم', `حذف تقييم ${t.client_name}؟`))) return;
    await api(`/testimonials/${t.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title="شهادات العملاء"
        canBack
        right={
          user?.role === 'admin' ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)} testID="add-testimonial-btn">
              <Ionicons name="add" size={22} color={C.brand} />
            </TouchableOpacity>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={styles.wrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} />}
      >
        {items.length === 0 ? (
          <Empty icon="star-outline" text="لا توجد تقييمات بعد" hint="أضف أول تقييم لعميل راضٍ عن خدمتك" />
        ) : (
          items.map((t) => (
            <View key={t.id} style={styles.card}>
              <View style={styles.headRow}>
                <Text style={styles.name}>{t.client_name}</Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Ionicons key={i} name={i <= t.rating ? 'star' : 'star-outline'} size={14} color="#F5A623" />
                  ))}
                </View>
              </View>
              <Text style={styles.comment}>{t.comment}</Text>
              {user?.role === 'admin' && (
                <TouchableOpacity onPress={() => remove(t)} style={{ marginTop: 8, alignSelf: 'flex-end' }}>
                  <Ionicons name="trash-outline" size={16} color={C.muted} />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <AppModal visible={modal} title="إضافة تقييم" onClose={() => setModal(false)} onSave={save} saving={saving}>
        <Field
          label="اسم العميل"
          value={form.client_name}
          onChangeText={(v) => setForm({ ...form, client_name: v })}
          placeholder="مثال: أبو فهد"
        />
        <Field
          label="نص التقييم"
          value={form.comment}
          onChangeText={(v) => setForm({ ...form, comment: v })}
          placeholder="تجربة رائعة وجودة عالية..."
          multiline
        />
        <Text style={styles.starsLabel}>التقييم</Text>
        <View style={styles.starsPicker}>
          {[1, 2, 3, 4, 5].map((i) => (
            <TouchableOpacity key={i} onPress={() => setForm({ ...form, rating: i })}>
              <Ionicons name={i <= form.rating ? 'star' : 'star-outline'} size={28} color="#F5A623" />
            </TouchableOpacity>
          ))}
        </View>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10, ...shadow },
  headRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: F.bold, fontSize: 14, color: C.onSurface },
  stars: { flexDirection: 'row-reverse', gap: 2 },
  comment: { fontFamily: F.regular, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginTop: 8, lineHeight: 20 },
  starsLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginBottom: 8 },
  starsPicker: { flexDirection: 'row-reverse', gap: 6, justifyContent: 'center' },
});
