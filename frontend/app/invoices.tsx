import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api, getToken } from '@/src/api';
import { AppModal, Chips, Empty, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, fmt, shadow } from '@/src/theme';
import { ServiceTypeChips } from '@/src/ServiceTypeChips';
import { CategoryPicker } from '@/src/CategoryPicker';

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

type Item = { description: string; amount: string };

type Doc = {
  id: string;
  display_number: string;
  client_name: string;
  is_quote: boolean;
  status: string;
  total: number;
  subtotal: number;
  vat_amount: number;
  vat_rate: number;
  created_at: string;
  converted_to_invoice_id: string | null;
};

const EMPTY_FORM = {
  client_name: '',
  service_type: 'drone',
  sub_category: '',
  is_quote: true,
  apply_vat: true,
  vat_rate: '15',
  notes: '',
  show_sub_category: true,
  show_notes: true,
  design: 'brand' as 'brand' | 'minimal',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  sent: 'مُرسلة',
  approved: 'تمت الموافقة',
  paid: 'مدفوعة',
};

export default function InvoicesScreen() {
  const [filter, setFilter] = useState<'all' | 'quote' | 'invoice'>('all');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<Item[]>([{ description: '', amount: '' }]);

  // AI pricing helper
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingForm, setPricingForm] = useState({ shooting_days: '', editing_minutes: '', effects_level: 'basic' });
  const [pricingResult, setPricingResult] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const q = filter === 'all' ? '' : `?is_quote=${filter === 'quote'}`;
      setDocs(await api(`/documents${q}`));
    } catch {}
  }, [filter]);

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

  const openAdd = (asQuote: boolean) => {
    setForm({ ...EMPTY_FORM, is_quote: asQuote });
    setItems([{ description: '', amount: '' }]);
    setPricingResult(null);
    setModal(true);
  };

  const addItemRow = () => setItems((prev) => [...prev, { description: '', amount: '' }]);
  const removeItemRow = (i: number) => setItems((prev) => prev.filter((_, j) => j !== i));
  const updateItem = (i: number, key: keyof Item, value: string) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, [key]: value } : it)));

  const runPricingSuggestion = async () => {
    setPricingLoading(true);
    try {
      const res = await api('/pricing/suggest', {
        method: 'POST',
        body: JSON.stringify({
          service_type: form.service_type,
          sub_category: form.sub_category,
          shooting_days: parseFloat(pricingForm.shooting_days) || 0,
          editing_minutes: parseFloat(pricingForm.editing_minutes) || 0,
          effects_level: pricingForm.effects_level,
        }),
      });
      setPricingResult(res);
    } catch (e: any) {
      Alert.alert('تعذّر الحساب', e?.message || 'حدث خطأ');
    }
    setPricingLoading(false);
  };

  const useSuggestedPrice = () => {
    if (!pricingResult) return;
    setItems((prev) => [
      ...prev.filter((it) => it.description || it.amount),
      { description: 'السعر المقترح من سند', amount: String(pricingResult.suggested_price) },
    ]);
    setPricingOpen(false);
  };

  const save = async () => {
    const cleanItems = items
      .filter((it) => it.description.trim() && parseFloat(it.amount) > 0)
      .map((it) => ({ description: it.description.trim(), amount: parseFloat(it.amount) }));
    if (!form.client_name.trim() || cleanItems.length === 0) {
      Alert.alert('بيانات ناقصة', 'اسم العميل وبند واحد على الأقل مطلوبان');
      return;
    }
    setSaving(true);
    try {
      await api('/documents', {
        method: 'POST',
        body: JSON.stringify({
          client_name: form.client_name,
          service_type: form.service_type,
          sub_category: form.sub_category,
          is_quote: form.is_quote,
          apply_vat: form.apply_vat,
          vat_rate: parseFloat(form.vat_rate) || 0,
          notes: form.notes,
          show_sub_category: form.show_sub_category,
          show_notes: form.show_notes,
          design: form.design,
          items: cleanItems,
        }),
      });
      setModal(false);
      load();
    } catch (e: any) {
      Alert.alert('تعذّر الحفظ', e?.message || 'حدث خطأ');
    }
    setSaving(false);
  };

  const convertToInvoice = async (doc: Doc) => {
    if (!(await confirmAsync('تحويل لفاتورة', `تحويل عرض السعر ${doc.display_number} إلى فاتورة رسمية؟`))) return;
    try {
      await api(`/documents/${doc.id}/convert-to-invoice`, { method: 'POST' });
      load();
    } catch (e: any) {
      Alert.alert('تعذّر', e?.message || 'حدث خطأ');
    }
  };

  const markPaid = async (doc: Doc) => {
    await api(`/documents/${doc.id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) });
    load();
  };

  const removeDoc = async (doc: Doc) => {
    if (!(await confirmAsync('حذف', `حذف ${doc.display_number}؟`))) return;
    await api(`/documents/${doc.id}`, { method: 'DELETE' });
    load();
  };

  const downloadPdf = async (doc: Doc) => {
    try {
      const token = await getToken();
      const dest = FileSystem.cacheDirectory + `${doc.display_number}.pdf`;
      const res = await FileSystem.downloadAsync(`${BASE}/documents/${doc.id}/pdf`, dest, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, { mimeType: 'application/pdf' });
      }
    } catch (e: any) {
      Alert.alert('تعذّر التحميل', e?.message || 'حدث خطأ');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader title="الفواتير وعروض الأسعار" canBack />
      <View style={styles.topBar}>
        <Chips
          options={[
            { key: 'all', label: 'الكل' },
            { key: 'quote', label: 'عروض السعر' },
            { key: 'invoice', label: 'الفواتير' },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as any)}
        />
        <View style={styles.addRow}>
          <TouchableOpacity style={styles.addBtn} onPress={() => openAdd(true)}>
            <Ionicons name="add" size={16} color={C.brand} />
            <Text style={styles.addBtnText}>عرض سعر</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => openAdd(false)}>
            <Ionicons name="add" size={16} color={C.brand} />
            <Text style={styles.addBtnText}>فاتورة</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.wrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} />}
      >
        {docs.length === 0 ? (
          <Empty icon="document-text-outline" text="لا توجد مستندات بعد" hint="أضف أول عرض سعر أو فاتورة بالأعلى" />
        ) : (
          docs.map((doc) => (
            <View key={doc.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.docNumber}>{doc.display_number}</Text>
                <View style={[styles.statusBadge, doc.status === 'paid' && { backgroundColor: C.success + '22' }]}>
                  <Text style={[styles.statusText, doc.status === 'paid' && { color: C.success }]}>
                    {STATUS_LABELS[doc.status] || doc.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.clientName}>{doc.client_name}</Text>
              <Text style={styles.total}>{fmt(doc.total)} ر.س</Text>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => downloadPdf(doc)}>
                  <Ionicons name="download-outline" size={16} color={C.brand} />
                  <Text style={styles.actionText}>PDF</Text>
                </TouchableOpacity>
                {doc.is_quote && !doc.converted_to_invoice_id && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => convertToInvoice(doc)}>
                    <Ionicons name="swap-horizontal" size={16} color={C.brand} />
                    <Text style={styles.actionText}>تحويل لفاتورة</Text>
                  </TouchableOpacity>
                )}
                {!doc.is_quote && doc.status !== 'paid' && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => markPaid(doc)}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={C.success} />
                    <Text style={[styles.actionText, { color: C.success }]}>تعليم كمدفوعة</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionBtn} onPress={() => removeDoc(doc)}>
                  <Ionicons name="trash-outline" size={16} color={C.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <AppModal
        visible={modal}
        title={form.is_quote ? 'عرض سعر جديد' : 'فاتورة جديدة'}
        onClose={() => setModal(false)}
        onSave={save}
        saving={saving}
      >
        <Field label="اسم العميل" value={form.client_name} onChangeText={(v) => setForm({ ...form, client_name: v })} />
        <Text style={styles.chipsLabel}>نوع الخدمة</Text>
        <ServiceTypeChips
          value={form.service_type}
          onChange={(v) => setForm({ ...form, service_type: v })}
          includeBoth
        />

        <CategoryPicker
          serviceType={form.service_type}
          value={form.sub_category}
          onChange={(v) => setForm({ ...form, sub_category: v })}
          onPriceHint={(price) => {
            // عبّي أول بند تلقائياً بسعر الفئة فقط لو المستخدم ما كتب مبلغ بنفسه
            setItems((prev) => {
              if (prev.length && !prev[0].amount) {
                const next = [...prev];
                next[0] = { ...next[0], amount: String(price), description: next[0].description || form.sub_category };
                return next;
              }
              return prev;
            });
          }}
        />

        <TouchableOpacity style={styles.pricingBtn} onPress={() => setPricingOpen((v) => !v)}>
          <Ionicons name="sparkles" size={16} color={C.brand} />
          <Text style={styles.pricingBtnText}>
            {pricingOpen ? 'إخفاء التسعير الذكي' : 'احسب سعرًا مقترحًا من سند'}
          </Text>
        </TouchableOpacity>

        {pricingOpen && (
          <View style={styles.pricingInline}>
            <Field
              label="أيام التصوير"
              value={pricingForm.shooting_days}
              onChangeText={(v) => setPricingForm({ ...pricingForm, shooting_days: v })}
              keyboardType="numeric"
            />
            <Field
              label="دقائق المونتاج"
              value={pricingForm.editing_minutes}
              onChangeText={(v) => setPricingForm({ ...pricingForm, editing_minutes: v })}
              keyboardType="numeric"
            />
            <Text style={styles.chipsLabel}>مستوى المؤثرات</Text>
            <Chips
              options={[
                { key: 'basic', label: 'بسيط' },
                { key: 'medium', label: 'متوسط' },
                { key: 'advanced', label: 'متقدم' },
              ]}
              value={pricingForm.effects_level}
              onChange={(v) => setPricingForm({ ...pricingForm, effects_level: v })}
            />
            <TouchableOpacity style={styles.calcBtn} onPress={runPricingSuggestion} disabled={pricingLoading}>
              <Text style={styles.calcBtnText}>{pricingLoading ? 'جارٍ الحساب...' : 'احسب السعر المقترح'}</Text>
            </TouchableOpacity>

            {pricingResult && (
              <View style={styles.resultCard}>
                <Text style={styles.resultPrice}>{fmt(pricingResult.suggested_price)} ر.س</Text>
                <Text style={styles.resultRange}>
                  النطاق: {fmt(pricingResult.price_range_low)} - {fmt(pricingResult.price_range_high)} ر.س
                </Text>
                <Text style={styles.resultReason}>{pricingResult.reasoning}</Text>
                <TouchableOpacity style={styles.useBtn} onPress={useSuggestedPrice}>
                  <Text style={styles.useBtnText}>استخدم هذا السعر كبند</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <Text style={styles.chipsLabel}>البنود</Text>
        {items.map((it, i) => (
          <View key={i} style={styles.itemRow}>
            <TouchableOpacity onPress={() => removeItemRow(i)} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={20} color={C.muted} />
            </TouchableOpacity>
            <TextInput
              style={styles.itemAmount}
              placeholder="المبلغ"
              placeholderTextColor={C.muted}
              keyboardType="numeric"
              value={it.amount}
              onChangeText={(v) => updateItem(i, 'amount', v)}
            />
            <TextInput
              style={styles.itemDesc}
              placeholder="وصف البند"
              placeholderTextColor={C.muted}
              value={it.description}
              onChangeText={(v) => updateItem(i, 'description', v)}
            />
          </View>
        ))}
        <TouchableOpacity onPress={addItemRow} style={{ alignSelf: 'flex-end', marginBottom: 14 }}>
          <Text style={styles.addItemText}>+ إضافة بند</Text>
        </TouchableOpacity>

        <Text style={styles.chipsLabel}>خيارات المستند — تحكّم كامل</Text>
        <View style={styles.optionsCard}>
          <View style={styles.optionRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionLabel}>تطبيق ضريبة القيمة المضافة</Text>
              <Text style={styles.optionHint}>عطّلها لو لا تريد إظهار أي ضريبة بالمستند</Text>
            </View>
            <Switch
              value={form.apply_vat}
              onValueChange={(v) => setForm({ ...form, apply_vat: v })}
              trackColor={{ true: C.brand, false: C.border }}
            />
          </View>
          {form.apply_vat && (
            <Field
              label="نسبة الضريبة (%)"
              value={form.vat_rate}
              onChangeText={(v) => setForm({ ...form, vat_rate: v })}
              keyboardType="numeric"
            />
          )}
          <View style={styles.optionRow}>
            <Text style={[styles.optionLabel, { flex: 1 }]}>إظهار الفئة الفرعية بالمستند</Text>
            <Switch
              value={form.show_sub_category}
              onValueChange={(v) => setForm({ ...form, show_sub_category: v })}
              trackColor={{ true: C.brand, false: C.border }}
            />
          </View>
          <View style={styles.optionRow}>
            <Text style={[styles.optionLabel, { flex: 1 }]}>إظهار الملاحظات بالمستند</Text>
            <Switch
              value={form.show_notes}
              onValueChange={(v) => setForm({ ...form, show_notes: v })}
              trackColor={{ true: C.brand, false: C.border }}
            />
          </View>
          <Text style={styles.chipsLabel}>تصميم المستند</Text>
          <Chips
            options={[
              { key: 'brand', label: 'هوية AZVIO (تركواز)' },
              { key: 'minimal', label: 'بسيط (أبيض وأسود)' },
            ]}
            value={form.design}
            onChange={(v) => setForm({ ...form, design: v as 'brand' | 'minimal' })}
          />
        </View>

        <Field label="ملاحظات (اختياري)" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline />
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: C.surface },
  addRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 12 },
  addBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: { fontFamily: F.semibold, fontSize: 12, color: C.brand },
  wrap: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10, ...shadow },
  cardHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  docNumber: { fontFamily: F.bold, fontSize: 13, color: C.muted },
  statusBadge: { backgroundColor: C.surface2, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: F.semibold, fontSize: 11, color: C.onSurface2 },
  clientName: { fontFamily: F.bold, fontSize: 15, color: C.onSurface, textAlign: 'right', marginTop: 6 },
  total: { fontFamily: F.bold, fontSize: 18, color: C.brand, textAlign: 'right', marginTop: 4 },
  actionsRow: { flexDirection: 'row-reverse', gap: 14, marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
  actionBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  actionText: { fontFamily: F.semibold, fontSize: 12, color: C.brand },
  chipsLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginBottom: 6 },
  pricingBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    paddingVertical: 10,
    marginBottom: 16,
  },
  pricingBtnText: { fontFamily: F.semibold, fontSize: 13, color: C.brand },
  pricingInline: {
    backgroundColor: C.surface2,
    borderRadius: R.md,
    padding: 12,
    marginBottom: 16,
  },
  itemRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 },
  itemDesc: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: R.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: F.regular,
    fontSize: 13,
    color: C.onSurface,
    textAlign: 'right',
  },
  itemAmount: {
    width: 90,
    backgroundColor: C.surface2,
    borderRadius: R.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: F.regular,
    fontSize: 13,
    color: C.onSurface,
    textAlign: 'center',
  },
  addItemText: { fontFamily: F.semibold, fontSize: 12, color: C.brand, marginBottom: 14 },
  optionsCard: { backgroundColor: C.surface2, borderRadius: R.md, padding: 12, marginBottom: 14 },
  optionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 },
  optionLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface, textAlign: 'right' },
  optionHint: { fontFamily: F.regular, fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 2 },
  calcBtn: { backgroundColor: C.brand, borderRadius: R.md, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  calcBtnText: { fontFamily: F.bold, fontSize: 13, color: '#FFF' },
  resultCard: { backgroundColor: C.brandSoft, borderRadius: R.md, padding: 14, marginTop: 16 },
  resultPrice: { fontFamily: F.bold, fontSize: 22, color: C.brand, textAlign: 'center' },
  resultRange: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 4 },
  resultReason: { fontFamily: F.regular, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginTop: 10, lineHeight: 20 },
  useBtn: { backgroundColor: C.brand, borderRadius: R.md, paddingVertical: 10, alignItems: 'center', marginTop: 12 },
  useBtnText: { fontFamily: F.bold, fontSize: 13, color: '#FFF' },
});
