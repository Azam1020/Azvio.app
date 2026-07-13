import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { BracketCard, ScreenHeader } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

type PricingItem = {
  id: string;
  service_type: string;
  sub_category: string;
  label: string;
  price_from: number;
  price_to: number;
  notes: string;
};

const SERVICE_LABELS: Record<string, string> = {
  drone: 'تصوير جوي',
  editing: 'مونتاج',
  both: 'جوي + مونتاج',
};

export default function QuickPriceScreen() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PricingItem[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PricingItem | null>(null);

  const [clientText, setClientText] = useState('');
  const [asking, setAsking] = useState(false);
  const [aiResult, setAiResult] = useState<{
    matched: boolean;
    suggested_price: number | null;
    price_range: string;
    reasoning: string;
  } | null>(null);

  // "سند معي" — خيارات تفاعلية بدل النص الحر بس (طلب: أختار مع سند الأسئلة
  // والاختيارات والنوع والمدة)
  const [smartService, setSmartService] = useState<string | null>(null);
  const [smartSubCategory, setSmartSubCategory] = useState<string | null>(null);
  const [smartOptions, setSmartOptions] = useState<Record<string, any>>({});
  const [smartAsking, setSmartAsking] = useState(false);
  const [smartResult, setSmartResult] = useState<{
    suggested_price: number | null;
    price_range: string;
    internal_reasoning: string;
    market_range: string;
    client_message: string;
  } | null>(null);

  const DURATION_OPTIONS = ['قصير', 'متوسط', 'طويل'];
  const MODIFIER_OPTIONS: { key: string; label: string }[] = [
    { key: 'drone', label: 'يشمل درون' },
    { key: 'editing', label: 'يشمل مونتاج' },
    { key: 'travel', label: 'سفر خارج المدينة' },
    { key: 'rush', label: 'تسليم مستعجل' },
  ];

  const toggleSmartOption = (key: string) => {
    setSmartOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const smartSubCategories = useMemo(
    () => (smartService ? Array.from(new Set(items.filter((i) => i.service_type === smartService && i.sub_category).map((i) => i.sub_category))) : []),
    [items, smartService]
  );

  const askSmart = async () => {
    if (!smartService) {
      Alert.alert('اختر النوع أول', 'حدد نوع الخدمة قبل ما تكمل مع سند');
      return;
    }
    setSmartAsking(true);
    setSmartResult(null);
    try {
      const r = await api('/pricing/smart', {
        method: 'POST',
        body: JSON.stringify({ service_type: smartService, sub_category: smartSubCategory || '', options: smartOptions }),
      });
      setSmartResult(r);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر التسعير الآن');
    }
    setSmartAsking(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/my-pricing');
      setItems(r || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const services = useMemo(() => Array.from(new Set(items.map((i) => i.service_type))), [items]);
  const filteredItems = useMemo(
    () => (selectedService ? items.filter((i) => i.service_type === selectedService) : []),
    [items, selectedService]
  );

  const selectService = (s: string) => {
    setSelectedService(s);
    setSelectedItem(null);
  };

  const askSanad = async () => {
    if (!clientText.trim()) {
      Alert.alert('اكتب أول', 'اكتب أو أملي (بالميكروفون بلوحة المفاتيح) وش قاله العميل');
      return;
    }
    setAsking(true);
    setAiResult(null);
    try {
      const r = await api('/pricing/quick', { method: 'POST', body: JSON.stringify({ text: clientText.trim() }) });
      setAiResult(r);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر التسعير الآن');
    }
    setAsking(false);
  };

  const shareResult = async (text: string) => {
    try {
      await Share.share({ message: text });
    } catch {}
  };


  return (
    <View style={styles.container}>
      <ScreenHeader title="التسعير الذكي" subtitle="جاوب العميل بسعر جاهز خلال ثواني" canBack />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* الطريقة الأسرع — خيارات جاهزة بدون انتظار، مباشرة من (تسعيرتي) */}
        <Text style={styles.sectionTitle}>١) اختر من تسعيرتك (فوري)</Text>

        {loading ? (
          <ActivityIndicator color={C.brand} style={{ marginVertical: 20 }} />
        ) : items.length === 0 ? (
          <BracketCard style={styles.emptyCard}>
            <Ionicons name="pricetags-outline" size={22} color={C.muted} />
            <Text style={styles.emptyText}>ما عندك أسعار محفوظة بعد — روح شاشة "تسعيرتي" وأضفها أول مرة، بعدها تقدر تستخدم هالشاشة فورًا بدون ما تنتظر سند.</Text>
          </BracketCard>
        ) : (
          <>
            <View style={styles.chipsRow}>
              {services.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, selectedService === s && styles.chipActive]}
                  onPress={() => selectService(s)}
                >
                  <Text style={[styles.chipText, selectedService === s && styles.chipTextActive]}>{SERVICE_LABELS[s] || s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedService && (
              <View style={styles.chipsRow}>
                {filteredItems.map((it) => (
                  <TouchableOpacity
                    key={it.id}
                    style={[styles.chip, selectedItem?.id === it.id && styles.chipActive]}
                    onPress={() => setSelectedItem(it)}
                  >
                    <Text style={[styles.chipText, selectedItem?.id === it.id && styles.chipTextActive]}>
                      {it.sub_category ? `${it.sub_category} — ${it.label}` : it.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedItem && (
              <BracketCard style={styles.resultCard} accent>
                <Text style={styles.resultLabel}>{selectedItem.label}</Text>
                <Text style={styles.resultPrice}>
                  {selectedItem.price_from === selectedItem.price_to
                    ? `${selectedItem.price_from.toLocaleString('en-US')} ر.س`
                    : `${selectedItem.price_from.toLocaleString('en-US')} - ${selectedItem.price_to.toLocaleString('en-US')} ر.س`}
                </Text>
                {!!selectedItem.notes && <Text style={styles.resultNotes}>{selectedItem.notes}</Text>}
                <View style={styles.resultActions}>
                  <TouchableOpacity
                    style={styles.resultBtn}
                    onPress={() =>
                      shareResult(
                        `${selectedItem.label}: ${selectedItem.price_from === selectedItem.price_to ? selectedItem.price_from : `${selectedItem.price_from}-${selectedItem.price_to}`} ر.س`
                      )
                    }
                  >
                    <Ionicons name="share-social-outline" size={16} color="#FFF" />
                    <Text style={styles.resultBtnText}>إرسال واتساب</Text>
                  </TouchableOpacity>
                </View>
              </BracketCard>
            )}
          </>
        )}

        {/* الطريقة الثانية — "سند معي": نختار الأسئلة والاختيارات سوا */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>٢) سند معي — أختار الخيارات ويحسب لي</Text>
        <View style={styles.chipsRow}>
          {services.length > 0
            ? services.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, smartService === s && styles.chipActive]}
                  onPress={() => {
                    setSmartService(s);
                    setSmartSubCategory(null);
                  }}
                >
                  <Text style={[styles.chipText, smartService === s && styles.chipTextActive]}>{SERVICE_LABELS[s] || s}</Text>
                </TouchableOpacity>
              ))
            : Object.keys(SERVICE_LABELS).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, smartService === s && styles.chipActive]}
                  onPress={() => {
                    setSmartService(s);
                    setSmartSubCategory(null);
                  }}
                >
                  <Text style={[styles.chipText, smartService === s && styles.chipTextActive]}>{SERVICE_LABELS[s]}</Text>
                </TouchableOpacity>
              ))}
        </View>

        {smartService && smartSubCategories.length > 0 && (
          <>
            <Text style={styles.miniLabel}>الفئة الفرعية</Text>
            <View style={styles.chipsRow}>
              {smartSubCategories.map((sc) => (
                <TouchableOpacity
                  key={sc}
                  style={[styles.chip, smartSubCategory === sc && styles.chipActive]}
                  onPress={() => setSmartSubCategory((p) => (p === sc ? null : sc))}
                >
                  <Text style={[styles.chipText, smartSubCategory === sc && styles.chipTextActive]}>{sc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {smartService && (
          <>
            <Text style={styles.miniLabel}>المدة</Text>
            <View style={styles.chipsRow}>
              {DURATION_OPTIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, smartOptions.duration === d && styles.chipActive]}
                  onPress={() => setSmartOptions((p) => ({ ...p, duration: p.duration === d ? undefined : d }))}
                >
                  <Text style={[styles.chipText, smartOptions.duration === d && styles.chipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.miniLabel}>خيارات إضافية</Text>
            <View style={styles.chipsRow}>
              {MODIFIER_OPTIONS.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.chip, smartOptions[m.key] && styles.chipActive]}
                  onPress={() => toggleSmartOption(m.key)}
                >
                  <Text style={[styles.chipText, smartOptions[m.key] && styles.chipTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.miniLabel}>أي تفاصيل ثانية؟ (اختياري)</Text>
            <TextInput
              style={[styles.textBox, { minHeight: 60, marginBottom: 12 }]}
              placeholder="مثال: العميل يبي تسليم Raw كمان، أو الموقع بعيد شوي..."
              placeholderTextColor={C.muted}
              value={smartOptions.notes || ''}
              onChangeText={(v) => setSmartOptions((p) => ({ ...p, notes: v }))}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>
                النوع: <Text style={styles.summaryStrong}>{SERVICE_LABELS[smartService] || smartService}</Text>
                {smartSubCategory ? <>{'  ·  '}الفئة: <Text style={styles.summaryStrong}>{smartSubCategory}</Text></> : null}
                {smartOptions.duration ? <>{'  ·  '}المدة: <Text style={styles.summaryStrong}>{smartOptions.duration}</Text></> : null}
              </Text>
            </View>

            <TouchableOpacity style={styles.askBtn} onPress={askSmart} disabled={smartAsking}>
              {smartAsking ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#FFF" />
                  <Text style={styles.askBtnText}>احسب السعر مع سند</Text>
                </>
              )}
            </TouchableOpacity>

            {smartResult && (
              <BracketCard style={styles.resultCard} accent>
                <Text style={styles.resultLabel}>
                  {SERVICE_LABELS[smartService] || smartService}
                  {smartSubCategory ? ` — ${smartSubCategory}` : ''}
                </Text>
                <Text style={styles.resultPrice}>
                  {smartResult.suggested_price ? `${smartResult.suggested_price.toLocaleString('en-US')} ر.س` : smartResult.price_range || '—'}
                </Text>
                {!!smartResult.internal_reasoning && <Text style={styles.resultNotes}>{smartResult.internal_reasoning}</Text>}

                {!!smartResult.market_range && (
                  <View style={styles.marketRow}>
                    <Ionicons name="globe-outline" size={13} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.marketText}>تقدير سعر السوق: {smartResult.market_range} (تقديري، مو بيانات حية)</Text>
                  </View>
                )}

                {!!smartResult.client_message && (
                  <View style={styles.clientMsgBox}>
                    <Text style={styles.clientMsgLabel}>📋 جاهزة للعميل (لو استغرب السعر)</Text>
                    <Text style={styles.clientMsgText}>{smartResult.client_message}</Text>
                  </View>
                )}

                <View style={styles.resultActions}>
                  <TouchableOpacity style={styles.resultBtn} onPress={() => shareResult(smartResult.client_message || String(smartResult.suggested_price))}>
                    <Ionicons name="share-social-outline" size={16} color="#FFF" />
                    <Text style={styles.resultBtnText}>إرسال للعميل</Text>
                  </TouchableOpacity>
                </View>
              </BracketCard>
            )}
          </>
        )}

        {/* الطريقة الثالثة — اسمع كلام العميل كامل وسند يطابقه بنفسه */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>٣) أو اكتب/أملي وش قاله العميل بالضبط</Text>
        <View style={styles.textBoxWrap}>
          <TextInput
            style={styles.textBox}
            placeholder="مثال: عميل يبي يصوّر فلة بالرياض بالدرون ويسوي مونتاج قصير..."
            placeholderTextColor={C.muted}
            value={clientText}
            onChangeText={setClientText}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.micHint}>🎙️ تقدر تضغط زر الميكروفون بلوحة المفاتيح وتملي بصوتك بدل الكتابة</Text>
        </View>

        <TouchableOpacity style={styles.askBtn} onPress={askSanad} disabled={asking}>
          {asking ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color="#FFF" />
              <Text style={styles.askBtnText}>اسأل سند عن السعر</Text>
            </>
          )}
        </TouchableOpacity>

        {aiResult && (
          <BracketCard style={styles.resultCard} accent={aiResult.matched}>
            {aiResult.matched ? (
              <>
                <Text style={styles.resultLabel}>رأي سند</Text>
                <Text style={styles.resultPrice}>
                  {aiResult.suggested_price ? `${aiResult.suggested_price.toLocaleString('en-US')} ر.س` : aiResult.price_range || '—'}
                </Text>
                {!!aiResult.reasoning && <Text style={styles.resultNotes}>{aiResult.reasoning}</Text>}
                <View style={styles.resultActions}>
                  <TouchableOpacity
                    style={styles.resultBtn}
                    onPress={() => shareResult(aiResult.suggested_price ? `${aiResult.suggested_price} ر.س` : aiResult.price_range)}
                  >
                    <Ionicons name="share-social-outline" size={16} color="#FFF" />
                    <Text style={styles.resultBtnText}>إرسال واتساب</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={styles.resultNotesMuted}>{aiResult.reasoning || 'سند ما لقى تطابق واضح بقائمة تسعيرتك — يفضل تحدد السعر يدويًا لهذا الطلب.'}</Text>
            )}
          </BracketCard>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface2 },
  sectionTitle: { fontFamily: F.bold, fontSize: 14, color: C.onSurface, textAlign: 'right', marginBottom: 10 },
  chipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { fontFamily: F.semibold, fontSize: 12.5, color: C.onSurface },
  chipTextActive: { color: '#FFF' },
  emptyCard: { padding: 20, alignItems: 'center', gap: 8 },
  emptyText: { fontFamily: F.regular, fontSize: 12.5, color: C.muted, textAlign: 'center', lineHeight: 20 },
  miniLabel: { fontFamily: F.semibold, fontSize: 12, color: C.muted, textAlign: 'right', marginBottom: 6, marginTop: 2 },
  summaryBox: { backgroundColor: C.brandSoft, borderRadius: R.md, padding: 10, marginBottom: 12 },
  summaryText: { fontFamily: F.regular, fontSize: 12, color: C.brandDark, textAlign: 'right' },
  summaryStrong: { fontFamily: F.bold, fontSize: 12, color: C.brandDark },
  clientMsgBox: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: R.md, padding: 12, marginTop: 14 },
  clientMsgLabel: { fontFamily: F.semibold, fontSize: 11, color: 'rgba(255,255,255,0.85)', textAlign: 'right', marginBottom: 6 },
  clientMsgText: { fontFamily: F.regular, fontSize: 13, color: '#FFF', textAlign: 'right', lineHeight: 20 },
  marketRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 8 },
  marketText: { fontFamily: F.regular, fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'right', flex: 1 },
  resultCard: { padding: 18, marginTop: 4, marginBottom: 8 },
  resultLabel: { fontFamily: F.semibold, fontSize: 12.5, color: C.muted, textAlign: 'right' },
  resultPrice: { fontFamily: F.bold, fontSize: 26, color: C.onSurface, textAlign: 'right', marginTop: 6 },
  resultNotes: { fontFamily: F.regular, fontSize: 12.5, color: C.onSurface2, textAlign: 'right', marginTop: 8, lineHeight: 19 },
  resultNotesMuted: { fontFamily: F.regular, fontSize: 12.5, color: C.muted, textAlign: 'right', lineHeight: 19 },
  resultActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 14 },
  resultBtn: { flex: 1, flexDirection: 'row-reverse', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: R.md, paddingVertical: 10 },
  resultBtnText: { fontFamily: F.semibold, fontSize: 12.5, color: '#FFF' },
  textBoxWrap: { marginBottom: 12 },
  textBox: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    minHeight: 90,
    fontFamily: F.regular,
    fontSize: 14,
    color: C.onSurface,
    textAlign: 'right',
  },
  micHint: { fontFamily: F.regular, fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 6 },
  askBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.brand,
    borderRadius: R.lg,
    paddingVertical: 14,
    marginBottom: 4,
    ...shadow,
  },
  askBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
