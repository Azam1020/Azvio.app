import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { api, apiUpload } from '@/src/api';
import { AppModal, Chips, Empty, Field, confirmAsync } from '@/src/ui';
import { C, F, R, fmt, shadow } from '@/src/theme';

const TX_TYPES = [
  { key: 'income', label: 'دخل', color: C.success },
  { key: 'expense', label: 'مصروف', color: C.error },
  { key: 'withdrawal', label: 'سحب', color: '#B8860B' },
  { key: 'debt', label: 'دين', color: '#8E44AD' },
  { key: 'subscription', label: 'اشتراك', color: '#16808A' },
];

const TX_META: Record<string, { label: string; icon: any; color: string; sign: string }> = {
  income: { label: 'دخل', icon: 'arrow-down-circle', color: C.success, sign: '+' },
  expense: { label: 'مصروف', icon: 'arrow-up-circle', color: C.error, sign: '-' },
  withdrawal: { label: 'سحب', icon: 'cash', color: '#B8860B', sign: '-' },
  debt: { label: 'دين', icon: 'swap-horizontal', color: '#8E44AD', sign: '' },
  subscription: { label: 'اشتراك', icon: 'repeat', color: '#16808A', sign: '-' },
};

const SEGMENTS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'subscriptions', label: 'الاشتراكات' },
  { key: 'debts', label: 'الديون' },
];

const emptyForm = {
  type: 'income',
  amount: '',
  description: '',
  category: '',
  date: '',
  client_name: '',
  debt_direction: 'owed_to_me',
};

export default function FinanceScreen() {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState('overview');
  const [summary, setSummary] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [analyzing, setAnalyzing] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api('/finance/summary'), api('/transactions')]);
      setSummary(s);
      setTxs(t);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (!form.amount || !parseFloat(form.amount)) return;
    setSaving(true);
    try {
      await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) || 0 }),
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModal(false);
      setForm({ ...emptyForm });
      load();
    } catch {}
    setSaving(false);
  };

  const deleteTx = async (id: string) => {
    if (await confirmAsync('حذف العملية', 'هل أنت متأكد من حذف هذه العملية؟')) {
      await api(`/transactions/${id}`, { method: 'DELETE' });
      load();
    }
  };

  const togglePaid = async (tx: any) => {
    await api(`/transactions/${tx.id}`, { method: 'PUT', body: JSON.stringify({ paid: !tx.paid }) });
    load();
  };

  const pickInvoice = async () => {
    setInvoiceError('');
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setAnalyzing(true);
    try {
      const fd = new FormData();
      if (Platform.OS === 'web' && (asset as any).file) {
        fd.append('file', (asset as any).file, asset.name);
      } else {
        fd.append('file', {
          uri: asset.uri,
          name: asset.name || 'invoice.pdf',
          type: asset.mimeType || 'application/pdf',
        } as any);
      }
      const data = await apiUpload('/invoices/analyze', fd);
      const ex = data.extracted || {};
      setForm({
        type: ex.suggested_type === 'income' ? 'income' : 'expense',
        amount: String(ex.amount || ''),
        description: [ex.vendor, ex.description].filter(Boolean).join(' — '),
        category: ex.category || '',
        date: ex.date || '',
        client_name: '',
        debt_direction: 'owed_to_me',
      });
      setInvoiceModal(true);
    } catch (e: any) {
      setInvoiceError(e.message || 'تعذر تحليل الفاتورة');
    }
    setAnalyzing(false);
  };

  const confirmInvoice = async () => {
    setSaving(true);
    try {
      await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) || 0 }),
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setInvoiceModal(false);
      setForm({ ...emptyForm });
      load();
    } catch {}
    setSaving(false);
  };

  const subs = txs.filter((t) => t.type === 'subscription');
  const debts = txs.filter((t) => t.type === 'debt');
  const recent = txs.slice(0, 30);

  const renderTx = (item: any, showPaidToggle = false) => {
    const meta = TX_META[item.type] || TX_META.expense;
    return (
      <View key={item.id} style={styles.txCard}>
        <View style={[styles.txIcon, { backgroundColor: `${meta.color}15` }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.txDesc} numberOfLines={1}>
            {item.description || meta.label}
          </Text>
          <Text style={styles.txMeta}>
            {meta.label}
            {item.type === 'debt' ? (item.debt_direction === 'owed_to_me' ? ' (لي)' : ' (عليّ)') : ''}
            {item.category ? ` • ${item.category}` : ''} • {item.date}
          </Text>
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={[styles.txAmount, { color: meta.color }]}>
            {meta.sign}
            {fmt(item.amount)}
          </Text>
          <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
            {showPaidToggle && (
              <TouchableOpacity onPress={() => togglePaid(item)} hitSlop={6}>
                <Ionicons
                  name={item.paid ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={item.paid ? C.success : C.muted}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => deleteTx(item.id)} hitSlop={6}>
              <Ionicons name="trash-outline" size={18} color={C.muted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>المالية</Text>
        <View style={styles.segmentRow}>
          {SEGMENTS.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.segmentBtn, segment === s.key && styles.segmentActive]}
              onPress={() => setSegment(s.key)}
              testID={`segment-${s.key}`}
            >
              <Text style={[styles.segmentText, segment === s.key && { color: '#FFF' }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {segment === 'overview' && (
          <>
            <View style={styles.netCard}>
              <Text style={styles.netLabel}>صافي الرصيد</Text>
              <Text style={styles.netValue}>{fmt(summary?.net_balance || 0)}</Text>
              <View style={styles.netRow}>
                <Text style={styles.netSub}>دخل الشهر: {fmt(summary?.month_income || 0)}</Text>
                <Text style={styles.netSub}>مصاريف الشهر: {fmt(summary?.month_expenses || 0)}</Text>
              </View>
            </View>
            <View style={styles.miniRow}>
              <View style={styles.miniCard}>
                <Text style={[styles.miniValue, { color: C.success }]}>{fmt(summary?.total_income || 0)}</Text>
                <Text style={styles.miniLabel}>إجمالي الدخل</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={[styles.miniValue, { color: C.error }]}>{fmt(summary?.total_expenses || 0)}</Text>
                <Text style={styles.miniLabel}>المصاريف</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={[styles.miniValue, { color: '#B8860B' }]}>{fmt(summary?.total_withdrawals || 0)}</Text>
                <Text style={styles.miniLabel}>السحوبات</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>آخر العمليات</Text>
            {recent.length === 0 ? (
              <Empty icon="wallet-outline" text="لا توجد عمليات مالية بعد" hint="أضف عملية أو ارفع فاتورة PDF" />
            ) : (
              recent.map((t) => renderTx(t))
            )}
          </>
        )}

        {segment === 'subscriptions' && (
          <>
            <View style={styles.netCard}>
              <Text style={styles.netLabel}>إجمالي الاشتراكات الشهرية</Text>
              <Text style={styles.netValue}>{fmt(summary?.monthly_subscriptions || 0)}</Text>
            </View>
            {subs.length === 0 ? (
              <Empty icon="repeat-outline" text="لا توجد اشتراكات مسجلة" hint="أضف اشتراكاتك الشهرية (Adobe، تخزين سحابي...)" />
            ) : (
              subs.map((t) => renderTx(t))
            )}
          </>
        )}

        {segment === 'debts' && (
          <>
            <View style={styles.miniRow}>
              <View style={styles.miniCard}>
                <Text style={[styles.miniValue, { color: C.success }]}>{fmt(summary?.debts_owed_to_me || 0)}</Text>
                <Text style={styles.miniLabel}>ديون لي</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={[styles.miniValue, { color: C.error }]}>{fmt(summary?.debts_i_owe || 0)}</Text>
                <Text style={styles.miniLabel}>ديون عليّ</Text>
              </View>
            </View>
            {debts.length === 0 ? (
              <Empty icon="swap-horizontal-outline" text="لا توجد ديون مسجلة" hint="سجّل الديون التي لك أو عليك وتابع سدادها" />
            ) : (
              debts.map((t) => renderTx(t, true))
            )}
          </>
        )}

        {!!invoiceError && <Text style={styles.invoiceError}>{invoiceError}</Text>}
      </ScrollView>

      {/* Bottom actions */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity style={styles.invoiceBtn} onPress={pickInvoice} disabled={analyzing} testID="upload-invoice-btn">
          {analyzing ? (
            <ActivityIndicator color={C.brand} size="small" />
          ) : (
            <Ionicons name="document-text" size={18} color={C.brand} />
          )}
          <Text style={styles.invoiceText}>{analyzing ? 'جارِ التحليل...' : 'فاتورة PDF 🤖'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            setForm({ ...emptyForm });
            setModal(true);
          }}
          testID="add-tx-btn"
        >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addText}>إضافة عملية</Text>
        </TouchableOpacity>
      </View>

      {/* Add transaction modal */}
      <AppModal visible={modal} title="إضافة عملية مالية" onClose={() => setModal(false)} onSave={save} saving={saving}>
        <Text style={styles.fieldLabel}>نوع العملية</Text>
        <Chips options={TX_TYPES} value={form.type} onChange={(v) => setForm({ ...form, type: v })} />
        <Field label="المبلغ (ر.س) *" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} placeholder="0" keyboardType="numeric" />
        <Field label="الوصف" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="مثال: دفعة مشروع، بنزين، اشتراك Adobe..." />
        <Field label="التصنيف" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="معدات، تسويق، مواصلات..." />
        <Field label="التاريخ (YYYY-MM-DD)" value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} placeholder="اتركه فارغاً لتاريخ اليوم" autoCapitalize="none" />
        {form.type === 'debt' && (
          <>
            <Text style={styles.fieldLabel}>اتجاه الدين</Text>
            <Chips
              options={[
                { key: 'owed_to_me', label: 'لي (مستحق)', color: C.success },
                { key: 'i_owe', label: 'عليّ', color: C.error },
              ]}
              value={form.debt_direction}
              onChange={(v) => setForm({ ...form, debt_direction: v })}
            />
          </>
        )}
      </AppModal>

      {/* Invoice confirmation modal */}
      <AppModal
        visible={invoiceModal}
        title="✅ تم استخراج بيانات الفاتورة"
        onClose={() => setInvoiceModal(false)}
        onSave={confirmInvoice}
        saveLabel="تأكيد وإضافة"
        saving={saving}
      >
        <Text style={styles.invoiceHint}>راجع البيانات المستخرجة بالذكاء الاصطناعي وعدّلها إن لزم:</Text>
        <Text style={styles.fieldLabel}>نوع العملية</Text>
        <Chips
          options={[
            { key: 'expense', label: 'مصروف', color: C.error },
            { key: 'income', label: 'دخل', color: C.success },
          ]}
          value={form.type}
          onChange={(v) => setForm({ ...form, type: v })}
        />
        <Field label="المبلغ (ر.س)" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} keyboardType="numeric" />
        <Field label="الوصف" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} />
        <Field label="التصنيف" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} />
        <Field label="التاريخ" value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} autoCapitalize="none" />
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  title: { fontFamily: F.bold, fontSize: 22, color: C.onSurface, textAlign: 'right', marginBottom: 10 },
  segmentRow: { flexDirection: 'row-reverse', backgroundColor: C.surface2, borderRadius: R.md, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: R.sm + 2, alignItems: 'center' },
  segmentActive: { backgroundColor: C.brand },
  segmentText: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2 },
  netCard: { backgroundColor: C.inverse, borderRadius: R.lg, padding: 20, alignItems: 'flex-end', marginBottom: 12, ...shadow },
  netLabel: { fontFamily: F.regular, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  netValue: { fontFamily: F.bold, fontSize: 30, color: '#FFF', marginVertical: 4 },
  netRow: { flexDirection: 'row-reverse', gap: 16 },
  netSub: { fontFamily: F.regular, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  miniRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 12 },
  miniCard: { flex: 1, backgroundColor: C.surface, borderRadius: R.md, padding: 14, alignItems: 'center', ...shadow },
  miniValue: { fontFamily: F.bold, fontSize: 14 },
  miniLabel: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
  sectionTitle: { fontFamily: F.bold, fontSize: 16, color: C.onSurface, textAlign: 'right', marginTop: 8, marginBottom: 10 },
  txCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 14,
    marginBottom: 8,
    ...shadow,
  },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  txDesc: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface },
  txMeta: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
  txAmount: { fontFamily: F.bold, fontSize: 14 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row-reverse',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.brand,
    borderRadius: R.md,
    paddingVertical: 13,
    minHeight: 48,
  },
  addText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
  invoiceBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    paddingVertical: 13,
    minHeight: 48,
  },
  invoiceText: { fontFamily: F.bold, fontSize: 14, color: C.brand },
  invoiceError: { fontFamily: F.regular, fontSize: 13, color: C.error, textAlign: 'center', marginTop: 8 },
  invoiceHint: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'right', marginBottom: 12 },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
});
