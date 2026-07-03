import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from './theme';
import { priceOpinion } from './clientHelpers';

/**
 * SanadPriceOpinion — shows an inline Sanad opinion under the price field.
 * Triggers automatically (debounced) when service_type + price are set.
 */
export function SanadPriceOpinion({
  serviceType,
  subCategory,
  price,
  clientName,
}: {
  serviceType: string;
  subCategory: string;
  price: number;
  clientName?: string;
}) {
  const [state, setState] = useState<{
    opinion: string;
    verdict: string;
    market_min: number;
    market_max: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<any>(null);
  const lastKey = useRef<string>('');

  useEffect(() => {
    // Debounce: only ask Sanad after user stops changing for 900ms
    if (!price || price <= 0) {
      setState(null);
      setError('');
      return;
    }
    const key = `${serviceType}|${subCategory}|${price}`;
    if (key === lastKey.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      lastKey.current = key;
      setLoading(true);
      setError('');
      try {
        const r = await priceOpinion({
          service_type: serviceType,
          sub_category: subCategory,
          agreed_price: price,
          client_name: clientName || '',
        });
        setState(r);
      } catch (e: any) {
        setError(e?.message || 'تعذر الحصول على رأي سند');
      }
      setLoading(false);
    }, 900);
    return () => timerRef.current && clearTimeout(timerRef.current);
  }, [serviceType, subCategory, price, clientName]);

  if (!price || price <= 0) return null;

  const verdictMeta = () => {
    if (!state) return { color: C.muted, icon: 'ellipse-outline' as const, label: 'رأي سند' };
    if (state.verdict === 'fair') return { color: C.success, icon: 'checkmark-circle' as const, label: 'مناسب للسوق' };
    if (state.verdict === 'low') return { color: '#B8860B', icon: 'trending-down' as const, label: 'أقل من السوق' };
    if (state.verdict === 'high') return { color: C.error, icon: 'trending-up' as const, label: 'أعلى من السوق' };
    return { color: C.muted, icon: 'help-circle' as const, label: 'غير محدد' };
  };
  const v = verdictMeta();

  return (
    <View style={styles.wrap} testID="sanad-price-opinion">
      <View style={styles.head}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={12} color={C.brand} />
          <Text style={styles.badgeText}>سند</Text>
        </View>
        {loading ? (
          <View style={styles.headRight}>
            <ActivityIndicator size="small" color={C.brand} />
            <Text style={styles.loadingText}>يقارن السعر بالسوق...</Text>
          </View>
        ) : state ? (
          <View style={[styles.verdict, { backgroundColor: `${v.color}18` }]}>
            <Ionicons name={v.icon} size={14} color={v.color} />
            <Text style={[styles.verdictText, { color: v.color }]}>{v.label}</Text>
          </View>
        ) : null}
      </View>
      {loading && !state && null}
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {state && (
        <>
          <Text style={styles.opinion}>{state.opinion}</Text>
          {(state.market_min > 0 || state.market_max > 0) && (
            <Text style={styles.range}>
              نطاق السوق: {state.market_min.toLocaleString('en-US')} – {state.market_max.toLocaleString('en-US')} ر.س
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    padding: 12,
    marginBottom: 14,
    marginTop: -4,
    borderWidth: 1,
    borderColor: 'rgba(62,145,148,0.2)',
  },
  head: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  badge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  badgeText: { fontFamily: F.bold, fontSize: 11, color: C.brand },
  headRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  loadingText: { fontFamily: F.regular, fontSize: 11, color: C.onSurface2 },
  verdict: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill },
  verdictText: { fontFamily: F.bold, fontSize: 11 },
  opinion: { fontFamily: F.regular, fontSize: 12, color: C.onSurface, textAlign: 'right', lineHeight: 20 },
  range: { fontFamily: F.semibold, fontSize: 11, color: C.brandDark, textAlign: 'right', marginTop: 4 },
  errorText: { fontFamily: F.regular, fontSize: 11, color: C.error, textAlign: 'right' },
});
