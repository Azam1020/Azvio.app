import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { api, apiUpload } from '@/src/api';
import { AppModal, Empty, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, fmt, shadow } from '@/src/theme';
import { formatDateArabic, formatTime12h } from '@/src/DateTimePicker';

type Analysis = {
  id: string;
  label: string;
  file_name?: string;
  applied: boolean;
  applied_to_client?: string;
  created_at: string;
  analysis: {
    client: { name: string; phone: string; service_type: string; sub_category: string; source?: string };
    agreed_price: number;
    payments: { amount: number; date: string; note?: string }[];
    events: { title: string; event_type: string; date: string; time?: string; notes?: string }[];
    notes: string[];
    alerts: string[];
    summary: string;
    media?: { name: string; url: string; type: 'image' | 'video' }[];
  };
};

const EVENT_ICONS: Record<string, any> = {
  shooting: 'videocam',
  delivery: 'checkmark-done',
  other: 'calendar',
};

export default function WhatsAppScreen() {
  const [items, setItems] = useState<Analysis[]>([]);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<Analysis | null>(null);
  const [applying, setApplying] = useState(false);
  const [opts, setOpts] = useState({
    create_client: true,
    create_events: true,
    add_transactions: true,
    notes_as_log: true,
  });

  const load = useCallback(async () => {
    try {
      setItems(await api('/whatsapp-analyses'));
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

  const pickAndAnalyze = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'application/zip', '*/*'],
        copyToCacheDirectory: true,
        multiple: true, // طلب: رفع أكثر من ملف دفعة وحدة (مثلاً محادثتين مع وسائطهم)
      });
      if (res.canceled || !res.assets?.length) return;
      const assets = res.assets;
      const tooBig = assets.find((a) => a.size && a.size > 25 * 1024 * 1024);
      if (tooBig) {
        Alert.alert('ملف كبير', `الحد الأقصى 25MB للملف الواحد (${tooBig.name} أكبر من كذا).`);
        return;
      }
      setUploading(true);
      const fd = new FormData();
      for (const asset of assets) {
        if (Platform.OS === 'web' && (asset as any).file) {
          fd.append('files', (asset as any).file, asset.name);
        } else {
          fd.append('files', {
            uri: asset.uri,
            name: asset.name || 'chat.txt',
            type: asset.mimeType || 'text/plain',
          } as any);
        }
      }
      const r = await apiUpload('/whatsapp/analyze', fd);
      const mediaCount = r?.analysis?.media?.length || 0;
      Alert.alert(
        'تم التحليل ✅',
        mediaCount > 0 ? `اضغط على البطاقة لعرض النتيجة (${mediaCount} صورة/فيديو مرفقة)` : 'اضغط على البطاقة لعرض النتيجة وتطبيقها'
      );
      load();
      // Auto-open the newly created analysis
      setDetail(r);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر تحليل المحادثة');
    } finally {
      setUploading(false);
    }
  };

  const applyAnalysis = async () => {
    if (!detail) return;
    setApplying(true);
    try {
      const r = await api(`/whatsapp-analyses/${detail.id}/apply`, {
        method: 'POST',
        body: JSON.stringify(opts),
      });
      const created = r.created || {};
      const parts: string[] = [];
      if (created.client) parts.push('عميل جديد');
      if (created.events) parts.push(`${created.events} موعد`);
      if (created.transactions) parts.push(`${created.transactions} دفعة`);
      if (created.logs) parts.push(`${created.logs} سجل`);
      Alert.alert('تم التطبيق ✨', parts.length ? `تمت الإضافة: ${parts.join('، ')}` : 'لم يُضف شيء');
      setDetail(null);
      load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر تطبيق التحليل');
    } finally {
      setApplying(false);
    }
  };

  const removeAnalysis = async (a: Analysis) => {
    if (await confirmAsync('حذف التحليل', `حذف "${a.label}"؟`)) {
      await api(`/whatsapp-analyses/${a.id}`, { method: 'DELETE' });
      load();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title="تحليل واتساب"
        subtitle="سند يستخرج العملاء والمواعيد والدفعات"
        canBack
        right={
          <TouchableOpacity
            style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
            onPress={pickAndAnalyze}
            disabled={uploading}
            testID="wa-upload-btn"
          >
            {uploading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="cloud-upload" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        }
      />

      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <Empty
            icon="logo-whatsapp"
            text="لم تُحلَّل محادثات بعد"
            hint={'صدّر محادثة واتساب كملف .txt (بدون وسائط) ثم ارفعها هنا ليحللها سند'}
          />
        }
        ListHeaderComponent={
          <View style={styles.hintCard}>
            <Ionicons name="information-circle" size={18} color={C.brand} />
            <Text style={styles.hintText}>
              في واتساب: افتح المحادثة → المزيد → تصدير المحادثة → <Text style={{ fontFamily: F.bold }}>بدون وسائط</Text> → احفظ الملف ثم ارفعه هنا.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setDetail(item)}
            testID={`wa-item-${item.id}`}
          >
            <View style={styles.cardHead}>
              <View style={styles.waIcon}>
                <Ionicons name="logo-whatsapp" size={20} color={C.whatsapp} />
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.cardTitle}>{item.label}</Text>
                <Text style={styles.cardDate}>
                  {formatDateArabic(item.created_at.slice(0, 10))}
                </Text>
              </View>
              {item.applied ? (
                <View style={styles.appliedTag}>
                  <Ionicons name="checkmark-circle" size={12} color={C.success} />
                  <Text style={styles.appliedText}>مطبّق</Text>
                </View>
              ) : (
                <View style={styles.pendingTag}>
                  <Ionicons name="time-outline" size={12} color="#B8860B" />
                  <Text style={styles.pendingText}>جديد</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => removeAnalysis(item)} hitSlop={6}>
                <Ionicons name="trash-outline" size={16} color={C.muted} />
              </TouchableOpacity>
            </View>
            {!!item.analysis?.summary && (
              <Text style={styles.summary} numberOfLines={2}>
                {item.analysis.summary}
              </Text>
            )}
            <View style={styles.statsRow}>
              {item.analysis?.client?.name && (
                <View style={styles.stat}>
                  <Ionicons name="person" size={12} color={C.brand} />
                  <Text style={styles.statText}>{item.analysis.client.name}</Text>
                </View>
              )}
              {item.analysis?.agreed_price > 0 && (
                <View style={styles.stat}>
                  <Ionicons name="cash" size={12} color={C.success} />
                  <Text style={styles.statText}>{fmt(item.analysis.agreed_price)}</Text>
                </View>
              )}
              {(item.analysis?.events?.length || 0) > 0 && (
                <View style={styles.stat}>
                  <Ionicons name="calendar" size={12} color={C.brand} />
                  <Text style={styles.statText}>{item.analysis.events.length} موعد</Text>
                </View>
              )}
              {(item.analysis?.alerts?.length || 0) > 0 && (
                <View style={styles.stat}>
                  <Ionicons name="alert-circle" size={12} color={C.error} />
                  <Text style={styles.statText}>{item.analysis.alerts.length} تنبيه</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Detail modal */}
      <AppModal
        visible={!!detail}
        title={detail?.label || 'تحليل المحادثة'}
        onClose={() => setDetail(null)}
        onSave={applyAnalysis}
        saveLabel={detail?.applied ? 'تطبيق مرة أخرى' : 'تطبيق على العملاء والمالية'}
        saving={applying}
      >
        {detail && (
          <ScrollView style={{ maxHeight: 500 }}>
            {!!detail.analysis.media?.length && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🖼️ الصور والفيديوهات ({detail.analysis.media.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {detail.analysis.media.map((m) => (
                    <TouchableOpacity key={m.url} onPress={() => Linking.openURL(m.url)}>
                      {m.type === 'image' ? (
                        <Image source={{ uri: m.url }} style={styles.mediaThumb} />
                      ) : (
                        <View style={[styles.mediaThumb, styles.mediaVideoThumb]}>
                          <Ionicons name="play-circle" size={28} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {!!detail.analysis.summary && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📝 ملخص</Text>
                <Text style={styles.sectionText}>{detail.analysis.summary}</Text>
              </View>
            )}

            {detail.analysis.client?.name && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>👤 العميل</Text>
                <View style={styles.infoBox}>
                  <Row label="الاسم" value={detail.analysis.client.name} />
                  {!!detail.analysis.client.phone && <Row label="الجوال" value={detail.analysis.client.phone} />}
                  {!!detail.analysis.client.service_type && (
                    <Row
                      label="الخدمة"
                      value={
                        detail.analysis.client.service_type === 'drone'
                          ? 'درون'
                          : detail.analysis.client.service_type === 'editing'
                            ? 'مونتاج'
                            : 'درون + مونتاج'
                      }
                    />
                  )}
                  {!!detail.analysis.client.sub_category && (
                    <Row label="الفئة" value={detail.analysis.client.sub_category} />
                  )}
                  {detail.analysis.agreed_price > 0 && (
                    <Row label="السعر المتفق" value={fmt(detail.analysis.agreed_price)} />
                  )}
                </View>
              </View>
            )}

            {detail.analysis.payments?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💰 دفعات</Text>
                {detail.analysis.payments.map((p, i) => (
                  <View key={i} style={styles.listRow}>
                    <Text style={styles.pAmount}>{fmt(p.amount)}</Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.pNote}>{p.note || 'دفعة'}</Text>
                      {!!p.date && <Text style={styles.pDate}>{formatDateArabic(p.date)}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {detail.analysis.events?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📅 مواعيد</Text>
                {detail.analysis.events.map((e, i) => (
                  <View key={i} style={styles.listRow}>
                    <Ionicons name={EVENT_ICONS[e.event_type] || 'calendar'} size={18} color={C.brand} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.pNote}>{e.title}</Text>
                      <Text style={styles.pDate}>
                        {e.date ? formatDateArabic(e.date) : ''}
                        {e.time ? ` • ${formatTime12h(e.time)}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {detail.analysis.notes?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🔖 ملاحظات</Text>
                {detail.analysis.notes.map((n, i) => (
                  <Text key={i} style={styles.bullet}>• {n}</Text>
                ))}
              </View>
            )}

            {detail.analysis.alerts?.length > 0 && (
              <View style={[styles.section, styles.alertBox]}>
                <Text style={styles.sectionTitle}>⚠️ متابعات مطلوبة</Text>
                {detail.analysis.alerts.map((a, i) => (
                  <Text key={i} style={styles.bullet}>• {a}</Text>
                ))}
              </View>
            )}

            {/* Apply options */}
            <View style={styles.optsBox}>
              <Text style={styles.optsTitle}>ما تريد تطبيقه؟</Text>
              <OptRow label="إنشاء/تحديث العميل" value={opts.create_client} onChange={(v) => setOpts({ ...opts, create_client: v })} />
              <OptRow label="إضافة المواعيد للتقويم" value={opts.create_events} onChange={(v) => setOpts({ ...opts, create_events: v })} />
              <OptRow label="إضافة الدفعات للمالية" value={opts.add_transactions} onChange={(v) => setOpts({ ...opts, add_transactions: v })} />
              <OptRow label="حفظ الملخص كسجل نشاط للعميل" value={opts.notes_as_log} onChange={(v) => setOpts({ ...opts, notes_as_log: v })} />
            </View>
          </ScrollView>
        )}
      </AppModal>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

function OptRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.optRow}>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: C.brand, false: C.border }}
        thumbColor="#FFF"
      />
      <Text style={styles.optLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mediaThumb: { width: 84, height: 84, borderRadius: R.md, backgroundColor: C.surface2 },
  mediaVideoThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000055' },
  uploadBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.whatsapp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintCard: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: C.brandSoft,
    padding: 12,
    borderRadius: R.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(62,145,148,0.2)',
  },
  hintText: { flex: 1, fontFamily: F.regular, fontSize: 12, color: C.onSurface, textAlign: 'right', lineHeight: 20 },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 14,
    marginBottom: 10,
    ...shadow,
  },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  waIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F8EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontFamily: F.bold, fontSize: 14, color: C.onSurface },
  cardDate: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
  appliedTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E9F9EE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  appliedText: { fontFamily: F.bold, fontSize: 10, color: C.success },
  pendingTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF8E0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  pendingText: { fontFamily: F.bold, fontSize: 10, color: '#B8860B' },
  summary: { fontFamily: F.regular, fontSize: 12, color: C.onSurface2, textAlign: 'right', marginTop: 10, lineHeight: 20 },
  statsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  stat: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.surface2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  statText: { fontFamily: F.semibold, fontSize: 11, color: C.onSurface2 },
  section: { marginBottom: 14 },
  sectionTitle: { fontFamily: F.bold, fontSize: 13, color: C.onSurface, textAlign: 'right', marginBottom: 6 },
  sectionText: { fontFamily: F.regular, fontSize: 13, color: C.onSurface2, textAlign: 'right', lineHeight: 22 },
  infoBox: { backgroundColor: C.surface2, borderRadius: R.md, padding: 12 },
  infoRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  infoValue: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface },
  listRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface2,
    padding: 10,
    borderRadius: R.md,
    marginBottom: 6,
  },
  pAmount: { fontFamily: F.bold, fontSize: 13, color: C.success },
  pNote: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface, textAlign: 'right' },
  pDate: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
  bullet: { fontFamily: F.regular, fontSize: 12, color: C.onSurface2, textAlign: 'right', lineHeight: 22, marginBottom: 3 },
  alertBox: { backgroundColor: '#FDECEC', padding: 10, borderRadius: R.md, borderRightWidth: 3, borderRightColor: C.error },
  optsBox: { marginTop: 6, backgroundColor: C.brandSoft, borderRadius: R.md, padding: 12 },
  optsTitle: { fontFamily: F.bold, fontSize: 13, color: C.brand, textAlign: 'right', marginBottom: 8 },
  optRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 6 },
  optLabel: { flex: 1, fontFamily: F.semibold, fontSize: 13, color: C.onSurface, textAlign: 'right' },
});
