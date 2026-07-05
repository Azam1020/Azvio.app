import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { AppModal, Empty, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, fmt, shadow } from '@/src/theme';
import { SanadSuggestModal } from '@/src/SanadSuggestModal';
import { suggestServices } from '@/src/clientHelpers';
import { ServiceTypeChips, useServiceTypeLabel } from '@/src/ServiceTypeChips';

const TYPE_ICONS: Record<string, any> = {
  drone: 'airplane',
  editing: 'cut',
};

const emptyForm = { title: '', description: '', service_type: 'drone', price_from: '', price_to: '' };

export default function ServicesScreen() {
  const serviceLabels = useServiceTypeLabel();
  const [services, setServices] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [sanadOpen, setSanadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    try {
      setServices(await api('/services'));
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
    setEditId(null);
    setForm({ ...emptyForm });
    setModal(true);
  };

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      title: s.title,
      description: s.description,
      service_type: s.service_type,
      price_from: String(s.price_from || ''),
      price_to: String(s.price_to || ''),
    });
    setModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      price_from: parseFloat(form.price_from) || 0,
      price_to: parseFloat(form.price_to) || 0,
    };
    try {
      if (editId) {
        await api(`/services/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/services', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModal(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (s: any) => {
    if (await confirmAsync('حذف الخدمة', `حذف "${s.title}"؟`)) {
      await api(`/services/${s.id}`, { method: 'DELETE' });
      load();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title="خدماتي"
        subtitle="خدمات AZVIO وأسعارها"
        canBack
        right={
          <View style={{ flexDirection: 'row-reverse', gap: 6 }}>
            <TouchableOpacity style={styles.sanadBtn} onPress={() => setSanadOpen(true)} testID="sanad-helps-services">
              <Ionicons name="sparkles" size={16} color={C.brand} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={openAdd} testID="add-service-btn">
              <Ionicons name="add" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} />}
      >
        {services.length === 0 && <Empty icon="briefcase-outline" text="لا توجد خدمات" hint="أضف خدماتك وأسعارها" />}
        {services.map((s) => {
          const icon = TYPE_ICONS[s.service_type] || 'briefcase';
          const label = serviceLabels[s.service_type] || s.service_type;
          return (
            <View key={s.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.iconWrap}>
                  <Ionicons name={icon} size={22} color={C.brand} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.cardTitle}>{s.title}</Text>
                  <Text style={styles.cardType}>{label}</Text>
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                  <TouchableOpacity onPress={() => openEdit(s)} hitSlop={6}>
                    <Ionicons name="create-outline" size={19} color={C.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(s)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={18} color={C.muted} />
                  </TouchableOpacity>
                </View>
              </View>
              {!!s.description && <Text style={styles.cardDesc}>{s.description}</Text>}
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>نطاق السعر</Text>
                <Text style={styles.priceValue}>
                  {fmt(s.price_from)} — {fmt(s.price_to)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <AppModal
        visible={modal}
        title={editId ? 'تعديل الخدمة' : 'إضافة خدمة'}
        onClose={() => setModal(false)}
        onSave={save}
        saving={saving}
      >
        <Field label="اسم الخدمة *" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
        <Field label="الوصف" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
        <Text style={styles.fieldLabel}>النوع</Text>
        <ServiceTypeChips
          value={form.service_type}
          onChange={(v) => setForm({ ...form, service_type: v })}
        />
        <Field label="السعر من (ر.س)" value={form.price_from} onChangeText={(v) => setForm({ ...form, price_from: v })} keyboardType="numeric" />
        <Field label="السعر إلى (ر.س)" value={form.price_to} onChangeText={(v) => setForm({ ...form, price_to: v })} keyboardType="numeric" />
      </AppModal>

      <SanadSuggestModal
        visible={sanadOpen}
        onClose={() => setSanadOpen(false)}
        title="سند يساعدني — أفكار خدمات"
        serviceSelector
        fetcher={async ({ service_type }) => {
          const r = await suggestServices({ service_type: service_type || 'drone' });
          return r.services || [];
        }}
        onAccept={async (it) => {
          await api('/services', {
            method: 'POST',
            body: JSON.stringify({
              title: it.title,
              description: it.description || '',
              service_type: it.service_type || 'drone',
              price_from: it.price_from || 0,
              price_to: it.price_to || 0,
            }),
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
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 16, marginBottom: 12, ...shadow },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: F.bold, fontSize: 15, color: C.onSurface },
  cardType: { fontFamily: F.regular, fontSize: 11, color: C.brand },
  cardDesc: { fontFamily: F.regular, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginTop: 10, lineHeight: 22 },
  priceRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  priceLabel: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  priceValue: { fontFamily: F.bold, fontSize: 14, color: C.onSurface },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
});
