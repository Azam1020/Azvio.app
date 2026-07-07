import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from './theme';
import { AppModal, Field } from './ui';

/**
 * SanadSuggestModal — reusable modal that lets Sanad suggest a list of items,
 * user picks the ones to add. Callback returns clicks.
 */
export type SanadItem = Record<string, any> & { title?: string; name?: string; description?: string };

export function SanadSuggestModal({
  visible,
  onClose,
  title,
  fetcher,
  onAccept,
  showTopic,
  serviceSelector,
  primaryField = 'title',
  emptyText = 'اضغط "اقتراح" لتوليد أفكار جديدة',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** takes topic/hint/service_type, returns list of items */
  fetcher: (params: { topic?: string; service_type?: string }) => Promise<SanadItem[]>;
  onAccept: (item: SanadItem) => Promise<void> | void;
  showTopic?: boolean;
  serviceSelector?: boolean; // shows drone/editing selector
  primaryField?: 'title' | 'name';
  emptyText?: string;
}) {
  const [topic, setTopic] = useState('');
  const [serviceType, setServiceType] = useState<'drone' | 'editing'>('drone');
  const [items, setItems] = useState<SanadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const askSanad = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const r = await fetcher({ topic, service_type: serviceType });
      setItems(r || []);
      if (!r || r.length === 0) {
        setErrorMsg('سند ما رجّع أي اقتراحات هالمرة، جرّب تاني أو غيّر الموضوع.');
      }
    } catch (e: any) {
      // الخطأ كان يُبلع بصمت هنا سابقاً — سبب "الزر ما يسوي شي" بدون أي تنبيه للمستخدم.
      setErrorMsg(
        e?.message === 'Network request failed'
          ? 'تعذر الوصول للسيرفر. لو أول استخدام اليوم، قد يحتاج السيرفر حتى 50 ثانية للاستيقاظ — جرب مرة ثانية.'
          : e?.message || 'حصل خطأ غير متوقع، جرب مرة ثانية.'
      );
    }
    setLoading(false);
  };

  const accept = async (item: SanadItem) => {
    const key = String(item[primaryField] || '');
    setAccepting(key);
    try {
      await onAccept(item);
      setItems((prev) => prev.filter((x) => String(x[primaryField]) !== key));
    } catch {}
    setAccepting(null);
  };

  return (
    <AppModal visible={visible} title={title} onClose={onClose}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={12} color={C.brand} />
          <Text style={styles.badgeText}>سند</Text>
        </View>
        <Text style={styles.headerText}>سيقترح لك سند أفكاراً وتقدر تضيف ما يعجبك بضغطة واحدة.</Text>
      </View>

      {serviceSelector && (
        <View style={styles.serviceRow}>
          {(['drone', 'editing'] as const).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.serviceChip, serviceType === s && styles.serviceChipActive]}
              onPress={() => setServiceType(s)}
            >
              <Text style={[styles.serviceText, serviceType === s && { color: '#FFF' }]}>
                {s === 'drone' ? 'درون' : 'مونتاج'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showTopic && (
        <Field
          label="موضوع أو إشارة (اختياري)"
          value={topic}
          onChangeText={setTopic}
          placeholder="مثال: سياحة بجدة، أفكار رمضانية..."
        />
      )}

      <TouchableOpacity style={styles.suggestBtn} onPress={askSanad} disabled={loading} testID="sanad-suggest-btn">
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="sparkles" size={16} color="#FFF" />
            <Text style={styles.suggestText}>{items.length > 0 ? 'اقتراحات جديدة' : 'اطلب اقتراحات من سند'}</Text>
          </>
        )}
      </TouchableOpacity>

      {!!errorMsg && (
        <View style={styles.errorBox} testID="sanad-error-msg">
          <Ionicons name="alert-circle-outline" size={16} color={C.error} />
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {items.length === 0 && !loading && !errorMsg && <Text style={styles.emptyText}>{emptyText}</Text>}

      {items.map((it, idx) => {
        const name = String(it[primaryField] || '');
        const isAdding = accepting === name;
        return (
          <View key={`${name}-${idx}`} style={styles.card}>
            <TouchableOpacity
              onPress={() => accept(it)}
              disabled={isAdding}
              style={styles.acceptBtn}
              testID={`accept-${idx}`}
            >
              {isAdding ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="add" size={20} color="#FFF" />}
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.cardName}>{name}</Text>
              {!!it.description && <Text style={styles.cardDesc}>{it.description}</Text>}
              {(it.price_from || it.price_to) && (
                <Text style={styles.priceText}>
                  {(it.price_from || 0).toLocaleString('en-US')} – {(it.price_to || 0).toLocaleString('en-US')} ر.س
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  badge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.brandSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  badgeText: { fontFamily: F.bold, fontSize: 11, color: C.brand },
  headerText: { flex: 1, fontFamily: F.regular, fontSize: 12, color: C.onSurface2, textAlign: 'right', lineHeight: 18 },
  serviceRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 14 },
  serviceChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: R.md,
    backgroundColor: C.surface2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  serviceChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  serviceText: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2 },
  suggestBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.brand,
    borderRadius: R.md,
    paddingVertical: 12,
    minHeight: 46,
  },
  suggestText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
  emptyText: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 20 },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDECEA',
    borderRadius: R.md,
    padding: 12,
    marginTop: 12,
  },
  errorText: { flex: 1, fontFamily: F.regular, fontSize: 12, color: C.error, textAlign: 'right', lineHeight: 18 },
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    padding: 12,
    marginTop: 12,
  },
  acceptBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: { fontFamily: F.bold, fontSize: 13, color: C.onSurface, textAlign: 'right' },
  cardDesc: { fontFamily: F.regular, fontSize: 12, color: C.onSurface2, textAlign: 'right', marginTop: 3, lineHeight: 18 },
  priceText: { fontFamily: F.bold, fontSize: 12, color: C.brand, marginTop: 4 },
});
