import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { api, apiUpload } from '@/src/api';
import { apiCached } from '@/src/offlineCache';
import { OfflineBanner } from '@/src/OfflineBanner';
import { AppModal, Chips, Empty, Field, confirmAsync } from '@/src/ui';
import { DateField } from '@/src/DateTimePicker';
import { F, R, fmt, shadow } from '@/src/theme';
import { useTheme } from '@/src/ThemeContext';

const makeTxTypes = (C: any) => [
  { key: 'income', label: 'دخل', color: C.success },
  { key: 'expense', label: 'مصروف', color: C.error },
  { key: 'withdrawal', label: 'سحب', color: '#B8860B' },
  { key: 'debt', label: 'دين', color: '#8E44AD' },
  { key: 'subscription', label: 'اشتراك', color: '#16808A' },
];

const makeTxMeta = (C: any): Record<string, { label: string; icon: any; color: string; sign: string }> => ({
  income: { label: 'دخل', icon: 'arrow-down-circle', color: C.success, sign: '+' },
  expense: { label: 'مصروف', icon: 'arrow-up-circle', color: C.error, sign: '-' },
  withdrawal: { label: 'سحب', icon: 'cash', color: '#B8860B', sign: '-' },
  debt: { label: 'دين', icon: 'swap-horizontal', color: '#8E44AD', sign: '' },
  subscription: { label: 'اشتراك', icon: 'repeat', color: '#16808A', sign: '-' },
});

const SEGMENTS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'stats', label: 'الإحصائيات' },
  { key: 'subscriptions', label: 'اشتراكات' },
  { key: 'debts', label: 'ديون' },
  { key: 'operations', label: 'العمليات' },
];

const AR_MONTHS_SHORT = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];
const monthShort = (ym: string) => {
  const [, m] = ym.split('-').map(Number);
  return AR_MONTHS_SHORT[(m - 1) % 12];
};

const makeTypeColors = (C: any): Record<string, string> => ({
  income: C.success,
  expense: C.error,
  withdrawal: '#B8860B',
  subscription: '#16808A',
});

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
  const { C } = useTheme();
  const styles = makeStyles(C);
  const TX_TYPES = makeTxTypes(C);
  const TX_META = makeTxMeta(C);
  const TYPE_COLORS = makeTypeColors(C);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [segment, setSegment] = useState('overview');
  const [summary, setSummary] = useState<any>(null);
  const [offline, setOffline] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [analyzing, setAnalyzing] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  // Bank statement
  const [statementAnalyzing, setStatementAnalyzing] = useState(false);
  const [statementModal, setStatementModal] = useState(false);
  const [statementTxs, setStatementTxs] = useState<any[]>([]);
  const [statementSelected, setStatementSelected] = useState<Record<number, boolean>>({});
  const [statementError, setStatementError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, t, st] = await Promise.all([
        apiCached('/finance/summary', 'finance_summary'),
        apiCached('/transactions', 'transactions'),
        apiCached('/finance/statistics?months=6', 'finance_stats'),
      ]);
      setSummary(s.data);
      setTxs(t.data);
      setStats(st.data);
      setOffline(s.fromCache || t.fromCache || st.fromCache);
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

  const [pendingAttachments, setPendingAttachments] = useState<any[]>([]);
  const [editingTx, setEditingTx] = useState<any>(null);

  const openEditTx = (item: any) => {
    setEditingTx(item);
    setForm({
      type: item.type,
      amount: String(item.amount),
      description: item.description || '',
      category: item.category || '',
      date: item.date || '',
      client_name: item.client_name || '',
      debt_direction: item.debt_direction || 'owed_to_me',
    });
    setPendingAttachments([]);
    setModal(true);
  };

  const pickAttachmentsFromFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    setPendingAttachments((prev) => [...prev, ...res.assets]);
  };

  const pickAttachmentsFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('الإذن مطلوب', 'يحتاج التطبيق إذن الوصول لمعرض الصور');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, // طلب: اختيار عدة صور مباشرة من المعرض بدون حفظها بملف أولاً
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.length) return;
    const mapped = res.assets.map((a) => ({
      uri: a.uri,
      name: a.fileName || `photo_${Date.now()}.jpg`,
      mimeType: a.mimeType || 'image/jpeg',
    }));
    setPendingAttachments((prev) => [...prev, ...mapped]);
  };

  // زر المرفقات يعرض خيارين: من المعرض مباشرة (الأسهل للصور) أو من الملفات (للـ PDF)
  const pickAttachments = () => {
    if (Platform.OS === 'web') {
      pickAttachmentsFromFiles();
      return;
    }
    Alert.alert('إضافة مرفق', 'اختر المصدر', [
      { text: 'من معرض الصور', onPress: pickAttachmentsFromGallery },
      { text: 'من الملفات (PDF/صور)', onPress: pickAttachmentsFromFiles },
      { text: 'إلغاء', style: 'cancel' },
    ]);
  };

  const removePendingAttachment = (idx: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!form.amount || !parseFloat(form.amount)) return;
    setSaving(true);
    try {
      let txId = editingTx?.id;
      if (editingTx) {
        await api(`/transactions/${editingTx.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...form, amount: parseFloat(form.amount) || 0 }),
        });
      } else {
        const created = await api('/transactions', {
          method: 'POST',
          body: JSON.stringify({ ...form, amount: parseFloat(form.amount) || 0 }),
        });
        txId = created?.id;
      }

      // ارفع أي ملفات/صور اخترتها (طلب #13: رفع ملفات متعددة) بعد الحفظ مباشرة
      if (pendingAttachments.length > 0 && txId) {
        try {
          const fd = new FormData();
          for (const a of pendingAttachments) {
            if (Platform.OS === 'web' && a.file) {
              fd.append('files', a.file, a.name || 'file');
            } else {
              fd.append('files', { uri: a.uri, name: a.name || 'file', type: a.mimeType || 'application/octet-stream' } as any);
            }
          }
          await apiUpload(`/transactions/${txId}/attachments`, fd);
        } catch (e) {
          console.warn('attachment upload failed', e);
        }
      }

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModal(false);
      setEditingTx(null);
      setForm({ ...emptyForm });
      setPendingAttachments([]);
      load();
    } catch (e: any) {
      Alert.alert('تعذّر الحفظ', e?.message || 'حدث خطأ');
    }
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

  const analyzeInvoiceAsset = async (asset: { uri: string; name?: string; mimeType?: string; file?: any }) => {
    setAnalyzing(true);
    setInvoiceError('');
    try {
      const fd = new FormData();
      if (Platform.OS === 'web' && asset.file) {
        fd.append('file', asset.file, asset.name || 'receipt.jpg');
      } else {
        fd.append('file', {
          uri: asset.uri,
          name: asset.name || 'receipt.jpg',
          type: asset.mimeType || 'image/jpeg',
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

  const pickInvoiceFromFiles = async () => {
    setInvoiceError('');
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    await analyzeInvoiceAsset(res.assets[0] as any);
  };

  const pickInvoiceFromGallery = async () => {
    setInvoiceError('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('الإذن مطلوب', 'يحتاج التطبيق إذن الوصول لمعرض الصور');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    await analyzeInvoiceAsset({ uri: a.uri, name: a.fileName || 'receipt.jpg', mimeType: a.mimeType || 'image/jpeg' });
  };

  const pickInvoice = () => {
    if (Platform.OS === 'web') {
      pickInvoiceFromFiles();
      return;
    }
    Alert.alert('رفع فاتورة/إيصال', 'اختر المصدر', [
      { text: 'من معرض الصور', onPress: pickInvoiceFromGallery },
      { text: 'من الملفات', onPress: pickInvoiceFromFiles },
      { text: 'إلغاء', style: 'cancel' },
    ]);
  };

  const scanReceipt = async () => {
    setInvoiceError('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('الإذن مطلوب', 'يحتاج التطبيق إذن الكاميرا لمسح الإيصال');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    await analyzeInvoiceAsset({ uri: a.uri, name: 'receipt.jpg', mimeType: a.mimeType || 'image/jpeg' });
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

  const pickBankStatement = async () => {
    setStatementError('');
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    if (asset.size && asset.size > 15 * 1024 * 1024) {
      Alert.alert('الملف كبير', 'الحد الأقصى 15MB');
      return;
    }
    setStatementAnalyzing(true);
    try {
      const fd = new FormData();
      if (Platform.OS === 'web' && (asset as any).file) {
        fd.append('file', (asset as any).file, asset.name);
      } else {
        fd.append('file', {
          uri: asset.uri,
          name: asset.name || 'statement.pdf',
          type: asset.mimeType || 'application/pdf',
        } as any);
      }
      const data = await apiUpload('/finance/statement/analyze', fd);
      const extracted: any[] = data.extracted || [];
      setStatementTxs(extracted);
      // pre-select all by default
      const sel: Record<number, boolean> = {};
      extracted.forEach((_, i) => (sel[i] = true));
      setStatementSelected(sel);
      setStatementModal(true);
    } catch (e: any) {
      setStatementError(e.message || 'تعذر تحليل الكشف');
    }
    setStatementAnalyzing(false);
  };

  const saveStatementTxs = async () => {
    const chosen = statementTxs.filter((_, i) => statementSelected[i]);
    if (chosen.length === 0) return;
    setSaving(true);
    try {
      const r = await api('/finance/statement/save', {
        method: 'POST',
        body: JSON.stringify({ transactions: chosen }),
      });
      Alert.alert('تم', `تم إضافة ${r.inserted} معاملة`);
      setStatementModal(false);
      setStatementTxs([]);
      setStatementSelected({});
      load();
    } catch (e: any) {
      Alert.alert('خطأ', e.message || 'تعذر الحفظ');
    }
    setSaving(false);
  };

  const subs = txs.filter((t) => t.type === 'subscription');
  const debts = txs.filter((t) => t.type === 'debt');

  const [opSearch, setOpSearch] = useState('');
  const [opTypeFilter, setOpTypeFilter] = useState('');
  const opLoading = false;
  const filteredOps = txs.filter((t) => {
    if (opTypeFilter && t.type !== opTypeFilter) return false;
    if (opSearch) {
      const hay = `${t.description || ''} ${t.category || ''} ${t.client_name || ''}`.toLowerCase();
      if (!hay.includes(opSearch.toLowerCase())) return false;
    }
    return true;
  });
  const recent = txs.slice(0, 30);

  const chartWidth = Math.min(width - 32 - 32, 520);

  const netLineData = useMemo(() => {
    if (!stats?.months) return [] as any[];
    return stats.months.map((ym: string, i: number) => ({
      value: stats.net_series[i] || 0,
      label: monthShort(ym),
      dataPointColor: (stats.net_series[i] || 0) >= 0 ? C.success : C.error,
    }));
  }, [stats]);

  const incomeExpenseBars = useMemo(() => {
    if (!stats?.months) return [] as any[];
    const rows: any[] = [];
    stats.months.forEach((ym: string, i: number) => {
      rows.push({ value: stats.income_series[i] || 0, label: monthShort(ym), frontColor: C.success, spacing: 2 });
      rows.push({ value: stats.expense_series[i] || 0, frontColor: '#E5A4A4', spacing: 14 });
    });
    return rows;
  }, [stats]);

  const typePieData = useMemo(() => {
    if (!stats?.type_breakdown) return [] as any[];
    return Object.entries(stats.type_breakdown)
      .filter(([, v]) => (v as number) > 0)
      .map(([k, v]) => ({ value: v as number, color: TYPE_COLORS[k] || C.muted, text: '' }));
  }, [stats]);

  const maxIE = useMemo(() => {
    if (!stats) return 100;
    const arr = [...(stats.income_series || []), ...(stats.expense_series || [])];
    const m = Math.max(...arr, 100);
    return Math.ceil(m / 100) * 100;
  }, [stats]);

  const renderTx = (item: any, showPaidToggle = false) => {
    const meta = TX_META[item.type] || TX_META.expense;
    return (
      <TouchableOpacity key={item.id} style={styles.txCard} onPress={() => openEditTx(item)} activeOpacity={0.7}>
        <View pointerEvents="none" style={[styles.txCardBracket]} />
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
          {!!item.attachments?.length && (
            <TouchableOpacity
              style={styles.attachmentBadge}
              onPress={() => Linking.openURL(item.attachments[0].url)}
            >
              <Ionicons name="attach" size={12} color={C.brand} />
              <Text style={styles.attachmentBadgeText}>{item.attachments.length} مرفق</Text>
            </TouchableOpacity>
          )}
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
      </TouchableOpacity>
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

      <OfflineBanner visible={offline} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} />}
      >
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

        {segment === 'stats' && stats && (
          <>
            <View style={styles.netCard}>
              <Text style={styles.netLabel}>الصافي الإجمالي</Text>
              <Text style={styles.netValue}>{fmt(stats.totals.net)}</Text>
              <View style={styles.netRow}>
                <Text style={styles.netSub}>دخل: {fmt(stats.totals.income)}</Text>
                <Text style={styles.netSub}>مصاريف: {fmt(stats.totals.expenses)}</Text>
              </View>
            </View>

            {/* Income vs Expense bars */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.chartTitle}>الدخل مقابل المصاريف</Text>
                  <Text style={styles.chartSubtitle}>آخر 6 أشهر</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: C.success }]} />
                    <Text style={styles.legendText}>دخل</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#E5A4A4' }]} />
                    <Text style={styles.legendText}>مصاريف</Text>
                  </View>
                </View>
              </View>
              <View style={{ alignItems: 'center', marginTop: 6 }}>
                <BarChart
                  data={incomeExpenseBars}
                  width={chartWidth}
                  height={140}
                  barWidth={12}
                  barBorderRadius={4}
                  noOfSections={4}
                  maxValue={maxIE}
                  yAxisTextStyle={{ color: C.muted, fontSize: 10, fontFamily: F.regular }}
                  xAxisLabelTextStyle={{ color: C.onSurface2, fontSize: 10, fontFamily: F.semibold }}
                  yAxisThickness={0}
                  xAxisThickness={0}
                  rulesColor={C.border}
                  initialSpacing={10}
                  endSpacing={10}
                  disableScroll
                  yAxisLabelWidth={40}
                />
              </View>
            </View>

            {/* Net trend line */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>اتجاه الصافي</Text>
              <Text style={styles.chartSubtitle}>{stats.totals.net >= 0 ? 'رصيد موجب' : 'رصيد سالب'} • {stats.months?.length || 0} شهور</Text>
              <View style={{ alignItems: 'center', marginTop: 8 }}>
                <LineChart
                  data={netLineData}
                  width={chartWidth}
                  height={120}
                  color={C.brand}
                  thickness={2.5}
                  hideDataPoints={false}
                  dataPointsColor={C.brand}
                  yAxisTextStyle={{ color: C.muted, fontSize: 10, fontFamily: F.regular }}
                  xAxisLabelTextStyle={{ color: C.onSurface2, fontSize: 10, fontFamily: F.semibold }}
                  yAxisThickness={0}
                  xAxisThickness={0}
                  rulesColor={C.border}
                  initialSpacing={10}
                  endSpacing={10}
                  areaChart
                  startFillColor={C.brand}
                  endFillColor={C.brandSoft}
                  startOpacity={0.35}
                  endOpacity={0.05}
                  disableScroll
                  yAxisLabelWidth={44}
                />
              </View>
            </View>

            {/* Type breakdown pie */}
            {typePieData.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>توزيع أنواع العمليات</Text>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <PieChart
                    donut
                    data={typePieData}
                    radius={60}
                    innerRadius={38}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.onSurface }}>{fmt(stats.totals.income + stats.totals.expenses + stats.totals.subscriptions + stats.totals.withdrawals).replace(' ر.س', '')}</Text>
                        <Text style={{ fontFamily: F.regular, fontSize: 10, color: C.muted }}>مجموع</Text>
                      </View>
                    )}
                  />
                  <View style={{ gap: 6 }}>
                    <LegendChip color={C.success} label={`دخل ${fmt(stats.totals.income)}`} />
                    <LegendChip color={C.error} label={`مصاريف ${fmt(stats.totals.expenses)}`} />
                    <LegendChip color={'#B8860B'} label={`سحوبات ${fmt(stats.totals.withdrawals)}`} />
                    <LegendChip color={'#16808A'} label={`اشتراكات ${fmt(stats.totals.subscriptions)}`} />
                  </View>
                </View>
              </View>
            )}

            {/* Top expense categories */}
            {stats.top_categories?.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>أكبر بنود المصاريف</Text>
                {stats.top_categories.slice(0, 6).map((c: any, i: number) => {
                  const max = stats.top_categories[0]?.amount || 1;
                  const pct = Math.min(100, (c.amount / max) * 100);
                  return (
                    <View key={i} style={styles.catRow}>
                      <Text style={styles.catAmt}>{fmt(c.amount)}</Text>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.catName}>{c.category}</Text>
                        <View style={styles.catBarBg}>
                          <View style={[styles.catBarFill, { width: `${pct}%` }]} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Top clients */}
            {stats.top_clients?.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>أعلى العملاء دخلاً</Text>
                {stats.top_clients.slice(0, 5).map((c: any, i: number) => (
                  <View key={i} style={styles.catRow}>
                    <Text style={styles.catAmt}>{fmt(c.amount)}</Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.catName}>{c.client}</Text>
                    </View>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>{i + 1}</Text>
                    </View>
                  </View>
                ))}
              </View>
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

        {segment === 'operations' && (
          <>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color={C.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="دور على وصف، فئة، أو اسم عميل..."
                placeholderTextColor={C.muted}
                value={opSearch}
                onChangeText={setOpSearch}
                textAlign="right"
              />
              {!!opSearch && (
                <TouchableOpacity onPress={() => setOpSearch('')} hitSlop={6}>
                  <Ionicons name="close-circle" size={16} color={C.muted} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.opFilterRow}>
              {[
                { key: '', label: 'الكل' },
                { key: 'income', label: 'دخل' },
                { key: 'expense', label: 'مصروف' },
                { key: 'withdrawal', label: 'سحب' },
                { key: 'debt', label: 'دين' },
                { key: 'subscription', label: 'اشتراك' },
              ].map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.opFilterChip, opTypeFilter === f.key && styles.opFilterChipActive]}
                  onPress={() => setOpTypeFilter(f.key)}
                >
                  <Text style={[styles.opFilterText, opTypeFilter === f.key && styles.opFilterTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {opLoading ? (
              <ActivityIndicator color={C.brand} style={{ marginTop: 20 }} />
            ) : filteredOps.length === 0 ? (
              <Empty icon="list-outline" text="لا توجد عمليات مطابقة" />
            ) : (
              filteredOps.map((t) => renderTx(t))
            )}
          </>
        )}

        {!!invoiceError && <Text style={styles.invoiceError}>{invoiceError}</Text>}
      </ScrollView>

      {/* Bottom actions */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity style={styles.sanadFab} onPress={() => router.push('/(tabs)/sanad')} testID="finance-sanad-btn">
          <Ionicons name="sparkles" size={18} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionSm} onPress={pickBankStatement} disabled={statementAnalyzing} testID="upload-statement-btn">
          {statementAnalyzing ? (
            <ActivityIndicator color={C.brand} size="small" />
          ) : (
            <Ionicons name="reader" size={16} color={C.brand} />
          )}
          <Text style={styles.actionSmText}>{statementAnalyzing ? '...' : 'كشف حساب'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionSm} onPress={pickInvoice} disabled={analyzing} testID="upload-invoice-btn">
          {analyzing ? (
            <ActivityIndicator color={C.brand} size="small" />
          ) : (
            <Ionicons name="document-text" size={16} color={C.brand} />
          )}
          <Text style={styles.actionSmText}>{analyzing ? '...' : 'فاتورة'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionSm} onPress={scanReceipt} disabled={analyzing} testID="scan-receipt-btn">
          <Ionicons name="camera" size={16} color={C.brand} />
          <Text style={styles.actionSmText}>مسح إيصال</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            setEditingTx(null);
            setForm({ ...emptyForm });
            setPendingAttachments([]);
            setModal(true);
          }}
          testID="add-tx-btn"
        >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addText}>عملية</Text>
        </TouchableOpacity>
      </View>

      {/* Add transaction modal */}
      <AppModal
        visible={modal}
        title={editingTx ? 'تعديل العملية' : 'إضافة عملية مالية'}
        onClose={() => {
          setModal(false);
          setEditingTx(null);
        }}
        onSave={save}
        saving={saving}
      >
        <Text style={styles.fieldLabel}>نوع العملية</Text>
        <Chips options={TX_TYPES} value={form.type} onChange={(v) => setForm({ ...form, type: v })} />
        <Field label="المبلغ (ر.س) *" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} placeholder="0" keyboardType="numeric" />
        <Field label="الوصف" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="مثال: دفعة مشروع، بنزين، اشتراك Adobe..." />
        <Field label="التصنيف" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="معدات، تسويق، مواصلات..." />
        <DateField label="التاريخ" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
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

        <Text style={styles.fieldLabel}>مرفقات (اختياري)</Text>
        <TouchableOpacity style={styles.attachBtn} onPress={pickAttachments}>
          <Ionicons name="attach" size={16} color={C.brand} />
          <Text style={styles.attachBtnText}>أضف صور أو ملفات (تقدر تختار أكثر من وحد)</Text>
        </TouchableOpacity>
        {pendingAttachments.map((a, idx) => (
          <View key={idx} style={styles.pendingAttachment}>
            <Ionicons name="document-outline" size={16} color={C.onSurface2} />
            <Text style={styles.pendingAttachmentName} numberOfLines={1}>
              {a.name}
            </Text>
            <TouchableOpacity onPress={() => removePendingAttachment(idx)} hitSlop={6}>
              <Ionicons name="close-circle" size={16} color={C.error} />
            </TouchableOpacity>
          </View>
        ))}
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
        <DateField label="التاريخ" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
      </AppModal>

      {/* Bank statement extraction modal */}
      <AppModal
        visible={statementModal}
        title={`📄 ${statementTxs.length} معاملة مستخرجة`}
        onClose={() => setStatementModal(false)}
        onSave={saveStatementTxs}
        saveLabel={`حفظ المختار (${Object.values(statementSelected).filter(Boolean).length})`}
        saving={saving}
      >
        <View style={styles.privacyRow}>
          <Ionicons name="shield-checkmark" size={16} color={C.success} />
          <Text style={styles.privacyText}>الخصوصية: تم حذف ملف الكشف من الخادم فور التحليل.</Text>
        </View>
        <Text style={styles.invoiceHint}>اختر المعاملات التي تريد إضافتها لماليتك:</Text>
        {statementTxs.length === 0 && (
          <Text style={styles.emptyStmt}>لم يستخرج سند أي معاملات — قد يكون الملف غير واضح أو فارغ.</Text>
        )}
        {statementTxs.map((t, i) => {
          const meta = TX_META[t.type] || TX_META.expense;
          const selected = !!statementSelected[i];
          return (
            <TouchableOpacity
              key={i}
              style={[styles.stmtRow, selected && styles.stmtRowActive]}
              onPress={() => setStatementSelected({ ...statementSelected, [i]: !selected })}
              testID={`stmt-tx-${i}`}
            >
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={22}
                color={selected ? C.brand : C.muted}
              />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.stmtDesc} numberOfLines={1}>{t.description || meta.label}</Text>
                <Text style={styles.stmtMeta}>{meta.label} • {t.date}{t.category ? ` • ${t.category}` : ''}</Text>
              </View>
              <Text style={[styles.stmtAmt, { color: meta.color }]}>
                {meta.sign}{fmt(t.amount)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </AppModal>

      {!!statementError && <Text style={styles.invoiceError}>{statementError}</Text>}
    </View>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  const { C } = useTheme();
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ fontFamily: F.semibold, fontSize: 11, color: C.onSurface2 }}>{label}</Text>
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    ...shadow,
  },
  searchInput: { flex: 1, fontFamily: F.regular, fontSize: 14, color: C.onSurface },
  opFilterRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  opFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.divider,
  },
  opFilterChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  opFilterText: { fontFamily: F.semibold, fontSize: 12, color: C.onSurface2 },
  opFilterTextActive: { color: '#FFF' },
  attachBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.divider,
    borderStyle: 'dashed',
    borderRadius: R.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  attachBtnText: { fontFamily: F.regular, fontSize: 12, color: C.brand, flex: 1, textAlign: 'right' },
  pendingAttachment: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  pendingAttachmentName: { flex: 1, fontFamily: F.regular, fontSize: 12, color: C.onSurface, textAlign: 'right' },
  attachmentBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4 },
  attachmentBadgeText: { fontFamily: F.regular, fontSize: 10, color: C.brand },
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
    overflow: 'hidden',
    ...shadow,
  },
  txCardBracket: { position: 'absolute', top: 6, left: 6, width: 10, height: 10, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: C.brand, opacity: 0.3, borderTopLeftRadius: 4 },
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
  actionSm: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    paddingHorizontal: 10,
    paddingVertical: 12,
    minHeight: 46,
    minWidth: 78,
  },
  actionSmText: { fontFamily: F.bold, fontSize: 11, color: C.brand },
  sanadFab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.brand,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  invoiceText: { fontFamily: F.bold, fontSize: 14, color: C.brand },
  invoiceError: { fontFamily: F.regular, fontSize: 13, color: C.error, textAlign: 'center', marginTop: 8 },
  invoiceHint: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'right', marginBottom: 12 },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
  chartCard: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    marginBottom: 12,
    ...shadow,
  },
  chartHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  chartTitle: { fontFamily: F.bold, fontSize: 14, color: C.onSurface, textAlign: 'right' },
  chartSubtitle: { fontFamily: F.regular, fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 2 },
  legendRow: { flexDirection: 'row-reverse', gap: 10 },
  legendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: F.semibold, fontSize: 11, color: C.onSurface2 },
  catRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  catAmt: { fontFamily: F.bold, fontSize: 13, color: C.onSurface, minWidth: 90, textAlign: 'left' },
  catName: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface, marginBottom: 4 },
  catBarBg: { width: '100%', height: 6, backgroundColor: C.surface2, borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: 6, backgroundColor: C.brand, borderRadius: 3 },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontFamily: F.bold, fontSize: 11, color: C.brand },
  privacyRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E9F9EE',
    padding: 10,
    borderRadius: R.md,
    marginBottom: 12,
  },
  privacyText: { fontFamily: F.semibold, fontSize: 11, color: C.success, flex: 1, textAlign: 'right' },
  emptyStmt: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'center', paddingVertical: 12 },
  stmtRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderRadius: R.sm,
  },
  stmtRowActive: { backgroundColor: C.brandSoft },
  stmtDesc: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface },
  stmtMeta: { fontFamily: F.regular, fontSize: 10, color: C.muted, marginTop: 2 },
  stmtAmt: { fontFamily: F.bold, fontSize: 13 },
});
