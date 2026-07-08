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
  invoices?: Array<{
    id: string;
    display_number: string;
    is_quote: boolean;
    total: number;
    status: string;
    payment_link: string;
    created_at: string;
  }>;
  files?: Array<{
    name: string;
    download_link: string;
    type: string;
  }>;
  notes?: Array<{
    text: string;
    created_at: string;
  }>;
  project_id?: string;
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

      {/* الفواتير وعروض السعر */}
      {!!data.invoices?.length && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{data.invoices.length > 1 ? 'الفواتير' : 'الفاتورة'}</Text>
          {data.invoices.map((inv, idx) => (
            <View key={inv.id} style={idx > 0 ? styles.invoiceDivider : undefined}>
              <View style={styles.invoiceRow}>
                <View>
                  <Text style={styles.invoiceLabel}>
                    {inv.display_number} {inv.is_quote ? '(عرض سعر)' : ''}
                  </Text>
                  <Text style={styles.invoiceAmount}>{fmt(inv.total)} ر.س</Text>
                </View>
                <View>
                  <Text style={styles.invoiceLabel}>الحالة</Text>
                  <Text
                    style={[
                      styles.invoiceStatus,
                      {
                        color:
                          inv.status === 'paid' ? '#4CAF50' : inv.status === 'approved' || inv.status === 'sent' ? '#FF9800' : C.muted,
                      },
                    ]}
                  >
                    {inv.status === 'paid'
                      ? '✓ مدفوعة'
                      : inv.status === 'approved'
                        ? 'معتمدة'
                        : inv.status === 'sent'
                          ? 'أُرسلت'
                          : 'مسوّدة'}
                  </Text>
                </View>
              </View>

              <View style={styles.invoiceActions}>
                <TouchableOpacity
                  style={styles.downloadBtn}
                  onPress={() =>
                    Linking.openURL(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/portal/${token}/invoices/${inv.id}/pdf`)
                  }
                >
                  <Ionicons name="download-outline" size={16} color={C.brand} />
                  <Text style={styles.downloadBtnText}>تحميل PDF</Text>
                </TouchableOpacity>

                {!!inv.payment_link && inv.status !== 'paid' && (
                  <TouchableOpacity
                    style={[styles.payBtn, data.stage === 'delivered' && styles.payBtnUrgent]}
                    onPress={() => Linking.openURL(inv.payment_link)}
                  >
                    <Ionicons name="card-outline" size={16} color="#FFF" />
                    <Text style={styles.payBtnText}>ادفع الآن</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* الملفات */}
      {data.files && data.files.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ملفاتك</Text>
          {data.files.map((file, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.fileItem}
              onPress={() => file.download_link && Linking.openURL(file.download_link)}
            >
              <Ionicons name={file.type === 'video' ? 'play-circle-outline' : 'image-outline'} size={18} color={C.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName}>{file.name}</Text>
                <Text style={styles.fileType}>{file.type}</Text>
              </View>
              <Ionicons name="download" size={16} color={C.brand} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* آخر التحديثات */}
      {data.notes && data.notes.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>آخر التحديثات</Text>
          {data.notes.map((note, idx) => (
            <View key={idx} style={styles.noteItem}>
              <View style={styles.noteBullet} />
              <View style={{ flex: 1 }}>
                <Text style={styles.noteText}>{note.text}</Text>
                <Text style={styles.noteDate}>{new Date(note.created_at).toLocaleDateString('ar-SA')}</Text>
              </View>
            </View>
          ))}
        </View>
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

      <AppModal visible={signModal} title="التوقيع" onClose={() => setSignModal(false)} scrollEnabled={false}>
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
  invoiceRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 16 },
  invoiceLabel: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right' },
  invoiceAmount: { fontFamily: F.bold, fontSize: 18, color: C.brand, textAlign: 'right', marginTop: 4 },
  invoiceStatus: { fontFamily: F.bold, fontSize: 14, textAlign: 'right', marginTop: 4 },
  invoiceDivider: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.divider },
  invoiceActions: { flexDirection: 'row-reverse', gap: 10 },
  downloadBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.brandSoft, borderRadius: R.md, paddingVertical: 12 },
  downloadBtnText: { fontFamily: F.bold, fontSize: 13, color: C.brand },
  payBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.brand, borderRadius: R.md, paddingVertical: 12 },
  payBtnUrgent: { backgroundColor: '#E67E22' },
  payBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
  fileItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider },
  fileName: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface, textAlign: 'right' },
  fileType: { fontFamily: F.regular, fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 2 },
  noteItem: { flexDirection: 'row-reverse', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider },
  noteBullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.brand, marginTop: 8 },
  noteText: { fontFamily: F.regular, fontSize: 13, color: C.onSurface, textAlign: 'right' },
  noteDate: { fontFamily: F.regular, fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 2 },
  signedRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  signedText: { fontFamily: F.semibold, fontSize: 14, color: C.success },
  signBtn: { backgroundColor: C.brand, borderRadius: R.md, paddingVertical: 14, alignItems: 'center' },
  signBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
