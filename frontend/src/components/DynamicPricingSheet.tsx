import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { C, F, R, shadow } from '@/src/theme';
import { Chips, Field } from '@/src/ui';

interface PricingData {
  base_cost: number;
  total_cost: number;
  recommended_price: number;
  modifiers_breakdown: Record<string, string>;
  savings_if_bulk: number;
  comparison_industry: string;
  service_type: string;
}

interface DynamicPricingScreenProps {
  visible: boolean;
  onClose: () => void;
  onSelectPrice?: (price: number) => void;
}

export function DynamicPricingSheet({ visible, onClose, onSelectPrice }: DynamicPricingScreenProps) {
  const [serviceType, setServiceType] = useState<'photography' | 'editing' | 'drone'>('photography');
  const [durationHours, setDurationHours] = useState('2');
  const [durationMinutes, setDurationMinutes] = useState('0');
  const [complexity, setComplexity] = useState<'simple' | 'medium' | 'complex'>('medium');
  const [modifications, setModifications] = useState<string[]>([]);
  const [distanceKm, setDistanceKm] = useState('0');
  const [isRush, setIsRush] = useState(false);
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(false);

  const modOptions = {
    photography: ['drone', 'editing', 'color_grade'],
    editing: ['color_grade', 'sound_design', 'effects', 'subtitles'],
    drone: ['post_production', 'raw_delivery'],
  };

  const calculate = async () => {
    setLoading(true);
    try {
      const result = await api('/pricing/calculate', {
        method: 'POST',
        body: JSON.stringify({
          service_type: serviceType,
          duration_hours: parseFloat(durationHours) || 1,
          duration_minutes: parseFloat(durationMinutes) || 0,
          complexity,
          modifications,
          location_distance_km: parseFloat(distanceKm) || 0,
          is_rush: isRush,
        }),
      });
      setPricing(result);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل حساب السعر');
    }
    setLoading(false);
  };

  const toggleModification = (mod: string) => {
    setModifications((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };

  const modLabels: Record<string, string> = {
    drone: '+ درون',
    editing: '+ مونتاج',
    color_grade: '+ ألوان',
    sound_design: '+ صوت',
    effects: '+ مؤثرات',
    subtitles: '+ ترجمة',
    post_production: '+ معالجة',
    raw_delivery: '+ ملفات خام',
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={C.onSurface} />
          </TouchableOpacity>
          <Text style={styles.title}>حاسب الأسعار</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Service Type */}
        <Text style={styles.label}>نوع الخدمة</Text>
        <Chips
          options={[
            { key: 'photography', label: '📸 تصوير' },
            { key: 'editing', label: '🎬 مونتاج' },
            { key: 'drone', label: '🛸 درون' },
          ]}
          value={serviceType}
          onChange={(v) => {
            setServiceType(v as any);
            setModifications([]);
            setPricing(null);
          }}
        />

        {/* Duration */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Field
              label="ساعات"
              value={durationHours}
              onChangeText={setDurationHours}
              keyboardType="decimal-pad"
              placeholder="2"
            />
          </View>
          <View style={styles.halfField}>
            <Field
              label="دقائق"
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </View>
        </View>

        {/* Complexity */}
        <Text style={styles.label}>مستوى التعقيد</Text>
        <Chips
          options={[
            { key: 'simple', label: 'بسيط' },
            { key: 'medium', label: 'متوسط' },
            { key: 'complex', label: 'متقدم' },
          ]}
          value={complexity}
          onChange={(v) => setComplexity(v as any)}
        />

        {/* Modifications */}
        <Text style={styles.label}>إضافات اختيارية</Text>
        <View style={styles.modsGrid}>
          {modOptions[serviceType].map((mod) => (
            <TouchableOpacity
              key={mod}
              style={[
                styles.modChip,
                modifications.includes(mod) && styles.modChipActive,
              ]}
              onPress={() => toggleModification(mod)}
            >
              <Text
                style={[
                  styles.modChipText,
                  modifications.includes(mod) && styles.modChipTextActive,
                ]}
              >
                {modLabels[mod] || mod}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Distance */}
        <Field
          label="مسافة التنقل (كم)"
          value={distanceKm}
          onChangeText={setDistanceKm}
          keyboardType="decimal-pad"
          placeholder="0"
        />

        {/* Rush */}
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setIsRush(!isRush)}
        >
          <Ionicons
            name={isRush ? 'checkbox' : 'square-outline'}
            size={20}
            color={C.brand}
          />
          <Text style={styles.checkboxLabel}>طلب عاجل (+ 30%)</Text>
        </TouchableOpacity>

        {/* Calculate Button */}
        <TouchableOpacity
          style={styles.calculateBtn}
          onPress={calculate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="calculator-outline" size={18} color="#FFF" />
              <Text style={styles.calculateBtnText}>احسب السعر</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Results */}
        {pricing && (
          <View style={styles.resultsCard}>
            <Text style={styles.resultsTitle}>🎯 النتيجة</Text>

            {/* Price Summary */}
            <View style={styles.priceSummary}>
              <View>
                <Text style={styles.priceLabel}>السعر الأساسي</Text>
                <Text style={styles.priceValue}>{pricing.base_cost} ر.س</Text>
              </View>
              <View>
                <Text style={styles.priceLabel}>السعر المقترح</Text>
                <Text style={[styles.priceValue, { color: C.success }]}>
                  {pricing.recommended_price} ر.س
                </Text>
              </View>
            </View>

            {/* Breakdown */}
            <View style={styles.breakdown}>
              <Text style={styles.breakdownTitle}>التفاصيل:</Text>
              {Object.entries(pricing.modifiers_breakdown).map(([key, value]) => (
                <View key={key} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{key}</Text>
                  <Text style={styles.breakdownValue}>{value}</Text>
                </View>
              ))}
            </View>

            {/* Industry Comparison */}
            <View style={styles.comparisonBox}>
              <Ionicons name="trending-up-outline" size={18} color={C.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.comparisonLabel}>مقارنة السوق</Text>
                <Text style={styles.comparisonValue}>
                  السعر {pricing.comparison_industry}
                </Text>
              </View>
            </View>

            {/* Use Price Button */}
            <TouchableOpacity
              style={styles.useBtn}
              onPress={() => {
                if (onSelectPrice) {
                  onSelectPrice(pricing.recommended_price);
                }
                onClose();
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
              <Text style={styles.useBtnText}>استخدم هذا السعر</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surface2,
  },
  content: {
    padding: 16,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: F.bold,
    fontSize: 18,
    color: C.onSurface,
  },
  label: {
    fontFamily: F.bold,
    fontSize: 13,
    color: C.onSurface,
    marginBottom: 10,
    marginTop: 16,
  },
  row: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  modsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  modChip: {
    borderWidth: 1,
    borderColor: C.divider,
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modChipActive: {
    backgroundColor: C.brand,
    borderColor: C.brand,
  },
  modChipText: {
    fontFamily: F.semibold,
    fontSize: 12,
    color: C.onSurface,
  },
  modChipTextActive: {
    color: '#FFF',
  },
  checkboxRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    marginVertical: 8,
  },
  checkboxLabel: {
    fontFamily: F.regular,
    fontSize: 14,
    color: C.onSurface,
  },
  calculateBtn: {
    backgroundColor: C.brand,
    borderRadius: R.lg,
    paddingVertical: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 20,
  },
  calculateBtnText: {
    fontFamily: F.bold,
    fontSize: 14,
    color: '#FFF',
  },
  resultsCard: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    ...shadow,
  },
  resultsTitle: {
    fontFamily: F.bold,
    fontSize: 14,
    color: C.onSurface,
    marginBottom: 16,
  },
  priceSummary: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    marginBottom: 16,
  },
  priceLabel: {
    fontFamily: F.regular,
    fontSize: 12,
    color: C.muted,
  },
  priceValue: {
    fontFamily: F.bold,
    fontSize: 18,
    color: C.brand,
    marginTop: 4,
  },
  breakdown: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  breakdownTitle: {
    fontFamily: F.bold,
    fontSize: 12,
    color: C.muted,
    marginBottom: 8,
  },
  breakdownRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  breakdownLabel: {
    fontFamily: F.regular,
    fontSize: 12,
    color: C.onSurface,
  },
  breakdownValue: {
    fontFamily: F.semibold,
    fontSize: 12,
    color: C.brand,
  },
  comparisonBox: {
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    padding: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  comparisonLabel: {
    fontFamily: F.regular,
    fontSize: 11,
    color: C.muted,
  },
  comparisonValue: {
    fontFamily: F.bold,
    fontSize: 13,
    color: C.brand,
    marginTop: 2,
  },
  useBtn: {
    backgroundColor: C.success,
    borderRadius: R.md,
    paddingVertical: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  useBtnText: {
    fontFamily: F.bold,
    fontSize: 14,
    color: '#FFF',
  },
});
