import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { AppModal, Chips, Empty, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { CategoryPicker } from '@/src/CategoryPicker';
import { C, F, R, fmt, shadow } from '@/src/theme';

const SERVICE_OPTIONS = [
  { key: 'drone', label: 'درون' },
  { key: 'editing', label: 'مونتاج' },
];

const emptyForm = {
  service_type: 'drone',
  sub_category: '',
  label: '',
  price_from: '',
  price_to: '',
  notes: '',
};

export default function MyPricingScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  // Advice from Sanad
  const [advice, setAdvice] = useState<any | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api('/my-pricing'));
    } catch {}
  }, []);

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

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      service_type: p.service_type || 'drone',
      sub_category: p.sub_category || '',
      label: p.label || '',
      price_from: String(p.price_from || ''),
      price_to: String(p.price_to || ''),
      notes: p.notes || '',
    });
    setModal(true);
  };

  const save = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      price_from: parseFloat(form.price_from) || 0,
      price_to: parseFloat(form.price_to) || 0,
    };
    try {
      if (editId) {
        await api(`/my-pricing/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/my-pricing', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModal(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (p: any) => {
    if (await confirmAsync('حذف التسعيرة', `حذف "${p.label}"؟`)) {
      await api(`/my-pricing/${p.id}`, { method: 'DELETE' });
      load();
    }
  };

  const askAdvice = async () => {
    setLoadingAdvice(true);
    setAdvice(null);
    try {
      const r = await api('/sanad/pricing-advice', { method: 'POST', body: JSON.stringify({}) });
      setAdvice(r);
    } catch {}
    setLoadingAdvice(false);
  };

  const verdictMeta = (v: string) => {
    if (v === 'fair') return { color: C.success, icon: 'checkmark-circle' as const, label: 'مناسب' };
    if (v === 'low') return { color: '#B8860B', icon: 'trending-down' as const, label: 'أقل من السوق' };
    if (v === 'high') return { color: C.error, icon: 'trending-up' as const, label: 'أعلى من السوق' };
    return { color: C.muted, icon: 'help-circle' as const, label: 'غير محدد' };
  };

  const groupedByService = items.reduce((acc: Record<string, any[]>, p) => {
    (acc[p.service_type] = acc[p.service_type] || []).push(p);
    return acc;
  }, {});

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title="تسعيرتي"
        subtitle="أسعارك الشخصية — سند يقارنها بالسوق"
        canBack
        right={
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} testID="add-pricing-btn">
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <TouchableOpacity
          style={[styles.adviceBtn, loadingAdvice && { opacity: 0.6 }]}
          onPress={askAdvice}
          disabled={loadingAdvice || items.length === 0}
          testID="ask-advice-btn"
        >
          {loadingAdvice ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color="#FFF" />
              <Text style={styles.adviceText}>اطلب نصيحة سند على تسعيرتك</Text>
            </>
          )}
        </TouchableOpacity>

        {advice && (
          <View style={styles.adviceCard}>
            <View style={styles.sanadBadge}>
              <Ionicons name="sparkles" size={12} color={C.brand} />
              <Text style={styles.sanadBadgeText}>سند</Text>
            </View>
            <Text style={styles.adviceHeadline}>{advice.advice}</Text>
            {advice.items?.length > 0 && (
              <View style={{ marginTop: 12, gap: 8 }}>
                {advice.items.map((it: any, i: number) => {
                  const v = verdictMeta(it.verdict);
                  return (
                    <View key={i} style={styles.itemAdvice}>
                      <View style={[styles.itemBadge, { backgroundColor: `${v.color}18` }]}>
                        <Ionicons name={v.icon} size={12} color={v.color} />
                        <Text style={[styles.itemBadgeText, { color: v.color }]}>{v.label}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.itemName}>{it.label}</Text>
                        {it.market_max > 0 && (
                          <Text style={styles.itemRange}>
                            السوق: {it.market_min.toLocaleString('en-US')} – {it.market_max.toLocaleString('en-US')} ر.س
                          </Text>
                        )}
                        {!!it.note && <Text style={styles.itemNote}>{it.note}</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {items.length === 0 && (
          <Empty
            icon="pricetags-outline"
            text="لم تُسجّل تسعيرتك بعد"
            hint="أضف تسعيرتك لكل نوع خدمة/فئة، سند يقارنها بالسوق ويعطي نصائح"
          />
        )}

        {Object.entries(groupedByService).map(([stype, list]) => (
          <View key={stype} style={{ marginBottom: 16 }}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>
                {stype === 'drone' ? 'التصوير الجوي' : stype === 'editing' ? 'المونتاج' : stype}
              </Text>
              <Text style={styles.groupCount}>{list.length}</Text>
            </View>
            {list.map((p: any) => (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.cardName}>{p.label}</Text>
                    <View style={styles.metaRow}>
                      {!!p.sub_category && (
                        <View style={styles.subChip}>
                          <Text style={styles.subChipText}>{p.sub_category}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                    <TouchableOpacity onPress={() => openEdit(p)} hitSlop={6}>
                      <Ionicons name="create-outline" size={18} color={C.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(p)} hitSlop={6}>
                      <Ionicons name="trash-outline" size={17} color={C.muted} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>سعرك</Text>
                  <Text style={styles.priceValue}>
                    {fmt(p.price_from)} — {fmt(p.price_to)}
                  </Text>
                </View>
                {!!p.notes && <Text style={styles.notes}>ملاحظة لسند: {p.notes}</Text>}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <AppModal
        visible={modal}
        title={editId ? 'تعديل التسعيرة' : 'إضافة تسعيرة'}
        onClose={() => setModal(false)}
        onSave={save}
        saving={saving}
      >
        <Text style={styles.fieldLabel}>نوع الخدمة</Text>
        <Chips
          options={SERVICE_OPTIONS}
          value={form.service_type}
          onChange={(v) => setForm({ ...form, service_type: v, sub_category: '' })}
        />
        <CategoryPicker
          serviceType={form.service_type}
          value={form.sub_category}
          onChange={(v) => setForm({ ...form, sub_category: v })}
          label="الفئة (اختياري)"
        />
        <Field
          label="التسمية *"
          value={form.label}
          onChangeText={(v) => setForm({ ...form, label: v })}
          placeholder="مثال: فيلا كبيرة، مونتاج ٦٠ ثانية..."
        />
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field
              label="السعر من (ر.س)"
              value={form.price_from}
              onChangeText={(v) => setForm({ ...form, price_from: v })}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="السعر إلى (ر.س)"
              value={form.price_to}
              onChangeText={(v) => setForm({ ...form, price_to: v })}
              keyboardType="numeric"
            />
          </View>
        </View>
        <Field
          label="ملاحظات لسند (اختياري)"
          value={form.notes}
          onChangeText={(v) => setForm({ ...form, notes: v })}
          placeholder="متى تُستخدم؟ ما يميّز هذا السعر؟"
          multiline
        />
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  adviceBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.brand,
    borderRadius: R.md,
    paddingVertical: 12,
    marginBottom: 14,
    minHeight: 46,
  },
  adviceText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
  adviceCard: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    marginBottom: 14,
    borderRightWidth: 4,
    borderRightColor: C.brand,
    ...shadow,
  },
  sanadBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    backgroundColor: C.brandSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
    marginBottom: 8,
  },
  sanadBadgeText: { fontFamily: F.bold, fontSize: 11, color: C.brand },
  adviceHeadline: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface, textAlign: 'right', lineHeight: 22 },
  itemAdvice: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    backgroundColor: C.surface2,
    borderRadius: R.sm,
  },
  itemBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  itemBadgeText: { fontFamily: F.bold, fontSize: 10 },
  itemName: { fontFamily: F.bold, fontSize: 13, color: C.onSurface },
  itemRange: { fontFamily: F.semibold, fontSize: 11, color: C.brand, marginTop: 3 },
  itemNote: { fontFamily: F.regular, fontSize: 11, color: C.onSurface2, marginTop: 3, textAlign: 'right' },
  groupHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  groupTitle: { fontFamily: F.bold, fontSize: 15, color: C.onSurface },
  groupCount: { fontFamily: F.semibold, fontSize: 13, color: C.muted },
  card: { backgroundColor: C.surface, borderRadius: R.md, padding: 14, marginBottom: 8, ...shadow },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  cardName: { fontFamily: F.bold, fontSize: 14, color: C.onSurface },
  metaRow: { flexDirection: 'row-reverse', gap: 6, marginTop: 4 },
  subChip: { backgroundColor: C.surface2, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 2 },
  subChipText: { fontFamily: F.semibold, fontSize: 11, color: C.onSurface2 },
  priceRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  priceLabel: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  priceValue: { fontFamily: F.bold, fontSize: 14, color: C.onSurface },
  notes: {
    fontFamily: F.regular,
    fontSize: 11,
    color: C.onSurface2,
    textAlign: 'right',
    marginTop: 8,
    backgroundColor: C.brandSoft,
    padding: 8,
    borderRadius: R.sm,
  },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
});
