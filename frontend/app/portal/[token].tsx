import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/src/api';
import { AppModal } from '@/src/ui';
import { SignaturePad, SignatureView } from '@/src/SignaturePad';
import { C, F, R, fmt, shadow } from '@/src/theme';

type PortalData = {
  name: string;
  service_type: string;
  sub_category?: string;
  stage: string;
  stage_label: string;
  stage_index: number;
  stages: { key: string; label: string }[];
  agreed_price?: number;
  status: string;
  drive_link?: string | null;
  has_signature: boolean;
};

export default function ClientPortalScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signModal, setSignModal] = useState(false);
  const [signing, setSigning] = useState(false);

  const load = async () => {
    try {
      setData(await api(`/portal/${token}`));
      setError('');
    } catch (e: any) {
      setError(e?.message || 'تعذّر تحميل بيانات المشروع');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [token]);

  const submitSignature = async (pathData: string) => {
    setSigning(true);
    try {
      await api(`/portal/${token}/sign`, { method: 'POST', body: JSON.stringify({ signature: pathData }) });
      setSignModal(false);
      load();
    } catch {}
    setSigning(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.brand} size="large" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={40} color={C.muted} />
        <Text style={styles.errorText}>{error || 'رابط غير صحيح'}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.brandRow}>
        <Image source={require('../../assets/images/azvio-logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand}>AZVIO</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.clientName}>{data.name}</Text>
        <Text style={styles.serviceType}>
          {data.service_type === 'drone' ? 'تصوير جوي بالدرون' : data.service_type === 'editing' ? 'مونتاج فيديو' : 'تصوير ومونتاج'}
          {data.sub_category ? ` — ${data.sub_category}` : ''}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>حالة المشروع</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(data.stage_index / (data.stages.length - 1)) * 100}%` }]} />
        </View>
        <View style={styles.stagesRow}>
          {data.stages.map((s, i) => (
            <View key={s.key} style={styles.stageItem}>
              <View style={[styles.stageDot, i <= data.stage_index && styles.stageDotDone]}>
                {i <= data.stage_index && <Ionicons name="checkmark" size={12} color="#FFF" />}
              </View>
              <Text style={[styles.stageLabel, i <= data.stage_index && styles.stageLabelDone]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {typeof data.agreed_price === 'number' && data.agreed_price > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>السعر المتفق عليه</Text>
          <Text style={styles.price}>{fmt(data.agreed_price)} ر.س</Text>
        </View>
      )}

      {data.drive_link && (
        <TouchableOpacity style={styles.linkCard} onPress={() => Linking.openURL(data.drive_link!)}>
          <Ionicons name="cloud-download-outline" size={20} color={C.brand} />
          <Text style={styles.linkText}>الملفات النهائية جاهزة — اضغط لفتحها</Text>
        </TouchableOpacity>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>الموافقة والتوقيع</Text>
        {data.has_signature ? (
          <View style={styles.signedRow}>
            <Ionicons name="checkmark-circle" size={20} color={C.success} />
            <Text style={styles.signedText}>تمت الموافقة والتوقيع</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.signBtn} onPress={() => setSignModal(true)}>
            <Text style={styles.signBtnText}>وقّع الموافقة على المشروع</Text>
          </TouchableOpacity>
        )}
      </View>

      <AppModal visible={signModal} title="التوقيع" onClose={() => setSignModal(false)}>
        <SignaturePad onSave={submitSignature} onCancel={() => setSignModal(false)} />
        {signing && <ActivityIndicator color={C.brand} style={{ marginTop: 12 }} />}
      </AppModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, paddingTop: 60, paddingBottom: 60, backgroundColor: C.surface2, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2, gap: 12 },
  errorText: { fontFamily: F.semibold, fontSize: 14, color: C.muted },
  brandRow: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 56, height: 56, marginBottom: 8 },
  brand: { fontFamily: F.bold, fontSize: 18, color: C.onSurface, letterSpacing: 2 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 16, marginBottom: 14, ...shadow },
  clientName: { fontFamily: F.bold, fontSize: 18, color: C.onSurface, textAlign: 'right' },
  serviceType: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'right', marginTop: 4 },
  sectionTitle: { fontFamily: F.bold, fontSize: 13, color: C.onSurface, textAlign: 'right', marginBottom: 12 },
  progressTrack: { height: 6, backgroundColor: C.surface2, borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: C.brand, borderRadius: 3 },
  stagesRow: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  stageItem: { alignItems: 'center', flex: 1 },
  stageDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.surface2,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stageDotDone: { backgroundColor: C.brand, borderColor: C.brand },
  stageLabel: { fontFamily: F.regular, fontSize: 10, color: C.muted, textAlign: 'center' },
  stageLabelDone: { fontFamily: F.semibold, color: C.brand },
  price: { fontFamily: F.bold, fontSize: 22, color: C.brand, textAlign: 'right' },
  linkCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.brandSoft,
    borderRadius: R.lg,
    padding: 16,
    marginBottom: 14,
  },
  linkText: { fontFamily: F.semibold, fontSize: 14, color: C.brandDark, flex: 1, textAlign: 'right' },
  signedRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  signedText: { fontFamily: F.semibold, fontSize: 14, color: C.success },
  signBtn: { backgroundColor: C.brand, borderRadius: R.md, paddingVertical: 14, alignItems: 'center' },
  signBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
