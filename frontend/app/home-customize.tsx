import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { AppModal, Field, ScreenHeader } from '@/src/ui';
import { C, F, R } from '@/src/theme';

const ALL_CARDS = [
  { key: 'content', title: 'المحتوى', icon: 'film' as const },
  { key: 'calendar', title: 'التقويم', icon: 'calendar' as const },
  { key: 'services', title: 'خدماتي', icon: 'briefcase' as const },
  { key: 'pricing', title: 'تسعيرتي', icon: 'pricetags' as const },
  { key: 'invoices', title: 'الفواتير وعروض السعر', icon: 'document-text' as const },
  { key: 'portfolio', title: 'البورتفوليو', icon: 'images' as const },
  { key: 'whatsapp', title: 'تحليل واتساب', icon: 'logo-whatsapp' as const },
  { key: 'insights', title: 'رؤى الأسبوع', icon: 'analytics' as const },
  { key: 'google_accounts', title: 'حسابات Google', icon: 'logo-google' as const },
  { key: 'links', title: 'روابط سريعة', icon: 'link' as const },
  { key: 'settings', title: 'الإعدادات', icon: 'settings' as const },
  { key: 'team', title: 'إدارة المستخدمين', icon: 'people' as const },
  { key: 'tickets', title: 'ملاحظات سند', icon: 'chatbubbles' as const },
];

const SIZE_LABEL: Record<string, string> = { small: 'مصغّرة', medium: 'قياسية', large: 'موسّعة' };
const SIZE_CYCLE = ['medium', 'small', 'large'];
const ROW_H = 76; // ارتفاع ثابت لكل صف — يبسّط حساب مكان الإفلات أثناء السحب

// مجمع الإحصائيات المتاحة للرئيسية — اختيار مدقق بدل ٤ بطاقات ثابتة (طلب: اختيار
// مدقق بالإحصائيات والتحاليل). كل عنصر يشير لحقل من استجابة /dashboard.
const STATS_POOL: { key: string; title: string; icon: any; color?: string }[] = [
  { key: 'month_income', title: 'دخل هذا الشهر', icon: 'trending-up' },
  { key: 'month_expenses', title: 'مصاريف الشهر', icon: 'trending-down' },
  { key: 'net_profit', title: 'صافي الربح', icon: 'wallet' },
  { key: 'clients_in_progress', title: 'مشاريع قيد التنفيذ', icon: 'hourglass' },
  { key: 'clients_delivered', title: 'مشاريع مُسلّمة', icon: 'checkmark-circle' },
  { key: 'clients_total', title: 'إجمالي العملاء', icon: 'people' },
  { key: 'delivery_rate', title: 'معدل التسليم', icon: 'speedometer' },
  { key: 'tasks_overdue', title: 'مهام متأخرة', icon: 'alert-circle' },
  { key: 'tasks_completion_rate', title: 'معدل إنجاز المهام', icon: 'checkbox' },
  { key: 'upcoming_events_count', title: 'المواعيد القادمة', icon: 'calendar' },
];

type Card = { key: string; title: string; icon: any; isCustom: boolean; customId?: string };

export default function HomeCustomizeScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState<string[]>(ALL_CARDS.map((c) => c.key));
  const [hidden, setHidden] = useState<string[]>([]);
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<{ id: string; title: string; icon: string; target: string }[]>([]);
  const [addCustomModal, setAddCustomModal] = useState(false);
  const [newCustom, setNewCustom] = useState({ title: '', target: '' });
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [statsSelected, setStatsSelected] = useState<string[]>(['month_income', 'month_expenses', 'clients_in_progress', 'clients_delivered']);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/home/layout');
      const c: { id: string; title: string; icon: string; target: string }[] = r?.custom ?? [];
      setCustom(c);
      const allKeys = [...ALL_CARDS.map((x) => x.key), ...c.map((x) => `custom:${x.id}`)];
      const savedOrder: string[] = r?.order ?? [];
      const missing = allKeys.filter((k) => !savedOrder.includes(k));
      setOrder(savedOrder.length ? [...savedOrder, ...missing] : allKeys);
      setHidden(r?.hidden ?? []);
      setSizes(r?.sizes ?? {});
      setStatsSelected(r?.stats_selected?.length ? r.stats_selected : ['month_income', 'month_expenses', 'clients_in_progress', 'clients_delivered']);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleHidden = (key: string) => {
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  };

  const cycleSize = (key: string) => {
    const current = sizes[key] || 'medium';
    const next = SIZE_CYCLE[(SIZE_CYCLE.indexOf(current) + 1) % SIZE_CYCLE.length];
    setSizes((s) => ({ ...s, [key]: next }));
  };

  const addCustomCard = () => {
    if (!newCustom.title.trim() || !newCustom.target.trim()) return;
    const id = Math.random().toString(36).slice(2);
    setCustom((c) => [...c, { id, title: newCustom.title.trim(), icon: 'link', target: newCustom.target.trim() }]);
    setOrder((o) => [...o, `custom:${id}`]);
    setNewCustom({ title: '', target: '' });
    setAddCustomModal(false);
  };

  const removeCustomCard = (id: string) => {
    setCustom((c) => c.filter((cc) => cc.id !== id));
    setOrder((o) => o.filter((k) => k !== `custom:${id}`));
    setHidden((h) => h.filter((k) => k !== `custom:${id}`));
  };

  const toggleStat = (key: string) => {
    setStatsSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api('/home/layout', { method: 'PUT', body: JSON.stringify({ order, hidden, sizes, custom, stats_selected: statsSelected }) });
      Alert.alert('تم الحفظ', '✅ الرئيسية صارت مرتبة على ذوقك');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر الحفظ');
    }
    setSaving(false);
  };

  const reset = () => {
    setOrder(ALL_CARDS.map((c) => c.key));
    setHidden([]);
    setSizes({});
    setCustom([]);
  };

  const customAsCards: Card[] = custom.map((c) => ({ key: `custom:${c.id}`, title: c.title, icon: 'link', isCustom: true, customId: c.id }));
  const allCards: Card[] = [...ALL_CARDS.map((c) => ({ ...c, isCustom: false })), ...customAsCards];
  const cardByKey = useMemo(() => Object.fromEntries(allCards.map((c) => [c.key, c])), [allCards, custom]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={C.brand} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="تخصيص الرئيسية" subtitle="اضغط مطوّلاً واسحب لإعادة الترتيب" canBack />

      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <View style={styles.hintRow}>
          <View style={styles.hintBracketL} />
          <Text style={styles.hint}>اضغط مطوّلاً على أي بطاقة واسحبها لأي مكان يناسبك</Text>
          <View style={styles.hintBracketR} />
        </View>

        <View style={{ height: order.length * ROW_H + 24, marginTop: 6 }}>
          {order.map((key) => {
            const card = cardByKey[key];
            if (!card) return null;
            return (
              <DraggableRow
                key={key}
                card={card}
                order={order}
                setOrder={setOrder}
                isHidden={hidden.includes(key)}
                size={sizes[key] || 'medium'}
                onToggleHidden={() => toggleHidden(key)}
                onCycleSize={() => cycleSize(key)}
                onRemoveCustom={card.isCustom ? () => removeCustomCard(card.customId!) : undefined}
                isDragging={draggingKey === key}
                setDraggingKey={setDraggingKey}
              />
            );
          })}
        </View>

        <View style={styles.statsSection}>
          <View style={styles.hintRow}>
            <View style={styles.hintBracketL} />
            <Text style={styles.hint}>اختيار مدقق — حدد بالضبط أي إحصائية تظهر أعلى الرئيسية</Text>
            <View style={styles.hintBracketR} />
          </View>
          <View style={styles.statsGrid}>
            {STATS_POOL.map((s) => {
              const selectedIdx = statsSelected.indexOf(s.key);
              const isSelected = selectedIdx !== -1;
              return (
                <TouchableOpacity key={s.key} style={[styles.statChip, isSelected && styles.statChipSelected]} onPress={() => toggleStat(s.key)}>
                  {isSelected && (
                    <View style={styles.statChipBadge}>
                      <Text style={styles.statChipBadgeText}>{selectedIdx + 1}</Text>
                    </View>
                  )}
                  <Ionicons name={s.icon} size={16} color={isSelected ? C.brand : C.muted} />
                  <Text style={[styles.statChipText, isSelected && styles.statChipTextSelected]}>{s.title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity style={styles.addCustomBtn} onPress={() => setAddCustomModal(true)}>
          <Ionicons name="add-circle-outline" size={18} color={C.brand} />
          <Text style={styles.addCustomText}>إضافة بطاقة مخصصة (رابط أو شاشة)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetBtn} onPress={reset}>
          <Text style={styles.resetText}>إرجاع الترتيب الافتراضي</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>حفظ الترتيب</Text>}
        </TouchableOpacity>
      </View>

      <AppModal
        visible={addCustomModal}
        title="بطاقة مخصصة جديدة"
        onClose={() => setAddCustomModal(false)}
        onSave={addCustomCard}
        saveLabel="إضافة"
      >
        <Field label="اسم البطاقة" value={newCustom.title} onChangeText={(v) => setNewCustom({ ...newCustom, title: v })} placeholder="مثال: مجلد العقود" />
        <Field
          label="الوجهة (رابط أو مسار شاشة داخل التطبيق)"
          value={newCustom.target}
          onChangeText={(v) => setNewCustom({ ...newCustom, target: v })}
          placeholder="https://... أو /clients"
          autoCapitalize="none"
        />
      </AppModal>
    </View>
  );
}

/** صف قابل للسحب — يستخدم موضع مطلق (top) محسوب من ترتيبه، مع أنيميشن ناعم
 * عند إعادة ترتيب باقي الصفوف بسبب سحب صف آخر. الصف نفسه أثناء سحبه يتبع
 * الإصبع مباشرة بدون أنيميشن (استجابة فورية). */
function DraggableRow({
  card,
  order,
  setOrder,
  isHidden,
  size,
  onToggleHidden,
  onCycleSize,
  onRemoveCustom,
  isDragging,
  setDraggingKey,
}: {
  card: Card;
  order: string[];
  setOrder: (o: string[]) => void;
  isHidden: boolean;
  size: string;
  onToggleHidden: () => void;
  onCycleSize: () => void;
  onRemoveCustom?: () => void;
  isDragging: boolean;
  setDraggingKey: (k: string | null) => void;
}) {
  const index = order.indexOf(card.key);
  const top = useRef(new Animated.Value(index * ROW_H)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const orderRef = useRef(order);
  orderRef.current = order;
  const startIndexRef = useRef(index);

  // تحديث الموضع بأنيميشن ناعم كل ما تغيّر ترتيب هذا الصف (بسبب سحب صف ثاني)
  React.useEffect(() => {
    if (!isDragging) {
      Animated.timing(top, {
        toValue: index * ROW_H,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [index, isDragging]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const longPressResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startIndexRef.current = orderRef.current.indexOf(card.key);
        setDraggingKey(card.key);
        Animated.spring(scale, { toValue: 1.04, useNativeDriver: false, friction: 6 }).start();
      },
      onPanResponderMove: (_evt, gesture) => {
        const baseTop = startIndexRef.current * ROW_H;
        const newTop = baseTop + gesture.dy;
        top.setValue(newTop);

        const currentOrder = orderRef.current;
        const draggedIdx = currentOrder.indexOf(card.key);
        const targetIdx = Math.max(0, Math.min(currentOrder.length - 1, Math.round(newTop / ROW_H)));
        if (targetIdx !== draggedIdx) {
          const next = [...currentOrder];
          next.splice(draggedIdx, 1);
          next.splice(targetIdx, 0, card.key);
          setOrder(next);
        }
      },
      onPanResponderRelease: () => {
        const finalIdx = orderRef.current.indexOf(card.key);
        Animated.parallel([
          Animated.timing(top, { toValue: finalIdx * ROW_H, duration: 180, useNativeDriver: false }),
          Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 6 }),
        ]).start();
        setDraggingKey(null);
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.row,
        isHidden && styles.rowHidden,
        { position: 'absolute', left: 0, right: 0, top, transform: [{ scale }], zIndex: isDragging ? 10 : 1, elevation: isDragging ? 8 : 2 },
      ]}
    >
      {/* زوايا فوكس — التوقيع البصري المستوحى من إطار كاميرا الدرون */}
      <View pointerEvents="none" style={[styles.bracket, styles.bracketTL]} />
      <View pointerEvents="none" style={[styles.bracket, styles.bracketTR]} />
      <View pointerEvents="none" style={[styles.bracket, styles.bracketBL]} />
      <View pointerEvents="none" style={[styles.bracket, styles.bracketBR]} />

      <View {...longPressResponder.panHandlers} style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 4 }}>
        <Ionicons name="reorder-three" size={20} color={C.muted} />
      </View>

      <View style={[styles.iconBadge, isHidden && styles.iconBadgeMuted]}>
        <Ionicons name={card.icon} size={19} color={isHidden ? C.muted : C.brandDark} />
      </View>

      <Text style={[styles.rowTitle, isHidden && styles.rowTitleHidden]} numberOfLines={1}>
        {card.title}
      </Text>

      <TouchableOpacity onPress={onCycleSize} style={styles.sizeBtn} hitSlop={6}>
        <Text style={styles.sizeBtnText}>{SIZE_LABEL[size]}</Text>
      </TouchableOpacity>

      {onRemoveCustom && (
        <TouchableOpacity onPress={onRemoveCustom} hitSlop={8} style={{ marginHorizontal: 2 }}>
          <Ionicons name="trash-outline" size={17} color={C.error} />
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={onToggleHidden} hitSlop={8}>
        <Ionicons name={isHidden ? 'eye-off-outline' : 'eye-outline'} size={19} color={isHidden ? C.muted : C.brand} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const BRACKET = 14;
const BRACKET_W = 2;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface2 },
  hintRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  hintBracketL: { width: 10, height: 10, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: C.brand, transform: [{ rotate: '90deg' }] },
  hintBracketR: { width: 10, height: 10, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: C.brand, transform: [{ rotate: '-90deg' }] },
  hint: { flex: 1, fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'center' },

  row: {
    height: ROW_H - 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  rowHidden: { opacity: 0.5 },

  bracket: { position: 'absolute', width: BRACKET, height: BRACKET, borderColor: C.brand, opacity: 0.55 },
  bracketTL: { top: -1, left: -1, borderTopWidth: BRACKET_W, borderLeftWidth: BRACKET_W, borderTopLeftRadius: 6 },
  bracketTR: { top: -1, right: -1, borderTopWidth: BRACKET_W, borderRightWidth: BRACKET_W, borderTopRightRadius: 6 },
  bracketBL: { bottom: -1, left: -1, borderBottomWidth: BRACKET_W, borderLeftWidth: BRACKET_W, borderBottomLeftRadius: 6 },
  bracketBR: { bottom: -1, right: -1, borderBottomWidth: BRACKET_W, borderRightWidth: BRACKET_W, borderBottomRightRadius: 6 },

  dragHandle: { paddingHorizontal: 4, paddingVertical: 10 },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  iconBadgeMuted: { backgroundColor: C.surface2 },
  rowTitle: { flex: 1, fontFamily: F.semibold, fontSize: 14, color: C.onSurface, textAlign: 'right' },
  rowTitleHidden: { color: C.muted, textDecorationLine: 'line-through' },
  sizeBtn: { backgroundColor: C.surface2, borderRadius: R.sm, paddingHorizontal: 9, paddingVertical: 5, marginHorizontal: 4 },
  sizeBtnText: { fontFamily: F.semibold, fontSize: 10.5, color: C.onSurface2 },

  addCustomBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 12, marginTop: 4 },
  addCustomText: { fontFamily: F.semibold, fontSize: 13, color: C.brand },

  statsSection: { marginTop: 8 },
  statsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  statChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: R.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.surface,
  },
  statChipSelected: { borderColor: C.brand, backgroundColor: C.brandSoft },
  statChipText: { fontFamily: F.semibold, fontSize: 12.5, color: C.muted },
  statChipTextSelected: { color: C.brandDark },
  statChipBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  statChipBadgeText: { fontFamily: F.bold, fontSize: 9.5, color: '#FFF' },
  resetBtn: { alignItems: 'center', paddingVertical: 10 },
  resetText: { fontFamily: F.semibold, fontSize: 13, color: C.muted },
  saveBtn: { backgroundColor: C.brand, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', marginTop: 4, marginBottom: 16 },
  saveBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
