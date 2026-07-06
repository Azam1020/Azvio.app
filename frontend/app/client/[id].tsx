import React, { useCallback, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { api, apiUpload } from '@/src/api';
import { AppModal, Chips, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, fmt, shadow } from '@/src/theme';
import { SERVICE_LABELS, openWhatsApp } from '@/src/clientHelpers';
import { CategoryPicker } from '@/src/CategoryPicker';
import { SanadPriceOpinion } from '@/src/SanadPriceOpinion';
import { ServiceTypeChips, useServiceTypeLabel } from '@/src/ServiceTypeChips';
import { SignaturePad, SignatureView } from '@/src/SignaturePad';

const LOG_TYPES = [
  { key: 'note', label: 'ملاحظة' },
  { key: 'whatsapp', label: 'واتساب' },
  { key: 'form', label: 'نموذج' },
];

const STAGES = [
  { key: 'booked', label: 'محجوز' },
  { key: 'shooting', label: 'تصوير' },
  { key: 'editing', label: 'مونتاج' },
  { key: 'review', label: 'مراجعة' },
  { key: 'delivered', label: 'تسليم' },
];

const LOG_ICONS: Record<string, any> = {
  note: 'document-text-outline',
  whatsapp: 'logo-whatsapp',
  form: 'clipboard-outline',
  file: 'attach',
};

export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const serviceLabels = useServiceTypeLabel();
  const [client, setClient] = useState<any>(null);
  const [logText, setLogText] = useState('');
  const [logType, setLogType] = useState('note');
  const [uploading, setUploading] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  const load = useCallback(async () => {
    try {
      setClient(await api(`/clients/${id}`));
    } catch {}
  }, [id]);

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

  const setStatus = async (status: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    await api(`/clients/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    load();
  };

  const setStage = async (stage: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    await api(`/clients/${id}`, { method: 'PUT', body: JSON.stringify({ stage }) });
    load();
  };

  const [signModal, setSignModal] = useState(false);
  const saveSignature = async (pathData: string) => {
    await api(`/clients/${id}`, { method: 'PUT', body: JSON.stringify({ approval_signature: pathData }) });
    setSignModal(false);
    load();
  };

  const addLog = async () => {
    if (!logText.trim()) return;
    await api(`/clients/${id}/logs`, {
      method: 'POST',
      body: JSON.stringify({ text: logText.trim(), log_type: logType }),
    });
    setLogText('');
    load();
  };

  const uploadFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (asset.size && asset.size > 15 * 1024 * 1024) {
        Alert.alert('الملف كبير جداً', 'الحد الأقصى 15MB لكل ملف.');
        return;
      }
      setUploading(true);
      const fd = new FormData();
      if (Platform.OS === 'web' && (asset as any).file) {
        fd.append('file', (asset as any).file, asset.name);
      } else {
        fd.append('file', {
          uri: asset.uri,
          name: asset.name || 'attachment',
          type: asset.mimeType || 'application/octet-stream',
        } as any);
      }
      fd.append('text', logText.trim() || asset.name || '');
      fd.append('log_type', 'file');
      await apiUpload(`/clients/${id}/logs/upload`, fd);
      setLogText('');
      load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر رفع الملف');
    } finally {
      setUploading(false);
    }
  };

  const openAttachment = async (log: any) => {
    try {
      const att = await api(`/clients/${id}/logs/${log.id}/attachment`);
      // New: signed URL from Supabase
      if (att?.kind === 'url' && att.url) {
        if (Platform.OS === 'web') {
          const w = (globalThis as any).window;
          if (w?.open) w.open(att.url, '_blank');
        } else {
          await WebBrowser.openBrowserAsync(att.url);
        }
        return;
      }
      // Legacy: base64 in Mongo
      if (att?.data) {
        const dataUri = `data:${att.mime};base64,${att.data}`;
        if (Platform.OS === 'web') {
          const w = (globalThis as any).window;
          if (w?.open) w.open(dataUri, '_blank');
        } else {
          const FileSystem = await import('expo-file-system/legacy');
          const path = `${FileSystem.cacheDirectory}${log.id}-${att.name}`;
          await FileSystem.writeAsStringAsync(path, att.data, { encoding: FileSystem.EncodingType.Base64 });
          await WebBrowser.openBrowserAsync(path);
        }
      }
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر فتح المرفق');
    }
  };

  const deleteLog = async (logId: string) => {
    await api(`/clients/${id}/logs/${logId}`, { method: 'DELETE' });
    load();
  };

  const deleteClient = async () => {
    if (await confirmAsync('حذف العميل', `هل أنت متأكد من حذف "${client?.name}"؟`)) {
      await api(`/clients/${id}`, { method: 'DELETE' });
      router.back();
    }
  };

  const openEdit = () => {
    setForm({
      name: client.name,
      phone: client.phone,
      service_type: client.service_type,
      sub_category: client.sub_category || '',
      agreed_price: String(client.agreed_price || ''),
      source: client.source,
      drive_link: client.drive_link,
      notes: client.notes,
    });
    setEditModal(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api(`/clients/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...form, agreed_price: parseFloat(form.agreed_price) || 0 }),
      });
      setEditModal(false);
      load();
    } catch {}
    setSaving(false);
  };

  if (!client) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface2 }}>
        <ScreenHeader title="..." canBack />
      </View>
    );
  }

  const logs = [...(client.logs || [])].reverse();
  const subtitle = [serviceLabels[client.service_type] || SERVICE_LABELS[client.service_type] || client.service_type, client.sub_category].filter(Boolean).join(' • ');

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title={client.name}
        subtitle={subtitle}
        canBack
        right={
          <TouchableOpacity onPress={deleteClient} hitSlop={8} testID="delete-client-btn">
            <Ionicons name="trash-outline" size={20} color={C.error} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} />}
      >
        {/* Status */}
        <View style={styles.statusRow}>
          {[
            { key: 'in_progress', label: 'قيد التنفيذ' },
            { key: 'delivered', label: 'تم التسليم' },
          ].map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.statusBtn, client.status === s.key && styles.statusActive]}
              onPress={() => setStatus(s.key)}
              testID={`status-${s.key}`}
            >
              <Text style={[styles.statusText, client.status === s.key && { color: '#FFF' }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Timeline */}
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>مراحل المشروع</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${(STAGES.findIndex((s) => s.key === (client.stage || 'booked')) / (STAGES.length - 1)) * 100}%`,
                },
              ]}
            />
          </View>
          <View style={styles.stagesRow}>
            {STAGES.map((s, i) => {
              const currentIdx = STAGES.findIndex((x) => x.key === (client.stage || 'booked'));
              const done = i <= currentIdx;
              return (
                <TouchableOpacity key={s.key} style={styles.stageItem} onPress={() => setStage(s.key)}>
                  <View style={[styles.stageDot, done && styles.stageDotDone]}>
                    {done && <Ionicons name="checkmark" size={12} color="#FFF" />}
                  </View>
                  <Text style={[styles.stageLabel, done && styles.stageLabelDone]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Signature / approval */}
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>موافقة العميل</Text>
          {client.approval_signature ? (
            <>
              <SignatureView pathData={client.approval_signature} height={90} />
              <Text style={styles.signedHint}>تم توقيع الموافقة</Text>
            </>
          ) : (
            <TouchableOpacity style={styles.signPromptBtn} onPress={() => setSignModal(true)}>
              <Ionicons name="create-outline" size={18} color={C.brand} />
              <Text style={styles.signPromptText}>وثّق توقيع موافقة العميل</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.whatsapp }]} onPress={() => openWhatsApp(client.phone)}>
            <Ionicons name="logo-whatsapp" size={20} color="#FFF" />
            <Text style={styles.actionText}>واتساب</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: C.inverse }]}
            onPress={() => client.phone && Linking.openURL(`tel:${client.phone}`)}
          >
            <Ionicons name="call" size={18} color="#FFF" />
            <Text style={styles.actionText}>اتصال</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.brand }]} onPress={openEdit} testID="edit-client-btn">
            <Ionicons name="create-outline" size={18} color="#FFF" />
            <Text style={styles.actionText}>تعديل</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.card}>
          <InfoRow icon="cash-outline" label="السعر المتفق عليه" value={fmt(client.agreed_price)} />
          <InfoRow icon="call-outline" label="الجوال" value={client.phone || '—'} />
          {!!client.sub_category && <InfoRow icon="pricetag-outline" label="الفئة" value={client.sub_category} />}
          <InfoRow icon="megaphone-outline" label="المصدر" value={client.source || '—'} />
          {!!client.drive_link && (
            <TouchableOpacity style={styles.driveBtn} onPress={() => Linking.openURL(client.drive_link)}>
              <Ionicons name="folder-open" size={18} color={C.brand} />
              <Text style={styles.driveText}>فتح ملفات Google Drive</Text>
            </TouchableOpacity>
          )}
          {!!client.notes && <Text style={styles.notes}>{client.notes}</Text>}
        </View>

        {/* Logs */}
        <Text style={styles.sectionTitle}>سجل النشاط</Text>
        <View style={styles.card}>
          <Chips options={LOG_TYPES} value={logType} onChange={setLogType} />
          <View style={styles.logInputRow}>
            <TextInput
              style={styles.logInput}
              placeholder="أضف ملاحظة أو سجل تواصل..."
              placeholderTextColor={C.muted}
              value={logText}
              onChangeText={setLogText}
              testID="log-input"
              multiline
            />
            <TouchableOpacity style={styles.logAddBtn} onPress={addLog} testID="add-log-btn">
              <Ionicons name="add" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* File upload button */}
          <TouchableOpacity
            style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
            onPress={uploadFile}
            disabled={uploading}
            testID="upload-file-btn"
          >
            {uploading ? (
              <ActivityIndicator color={C.brand} size="small" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color={C.brand} />
                <Text style={styles.uploadText}>رفع ملف (PDF/صورة)</Text>
              </>
            )}
          </TouchableOpacity>

          {logs.length === 0 ? (
            <Text style={styles.emptyLogs}>لا توجد سجلات بعد</Text>
          ) : (
            logs.map((log: any) => (
              <View key={log.id} style={styles.logRow}>
                <Ionicons name={LOG_ICONS[log.log_type] || 'document-text-outline'} size={16} color={C.brand} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.logText}>{log.text}</Text>
                  {log.attachment && (
                    <TouchableOpacity onPress={() => openAttachment(log)} style={styles.attachRow} testID={`attach-${log.id}`}>
                      <Ionicons name="document-attach" size={13} color={C.brand} />
                      <Text style={styles.attachName}>{log.attachment.name || 'مرفق'}</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.logDate}>{(log.created_at || '').slice(0, 16).replace('T', ' ')}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteLog(log.id)} hitSlop={6}>
                  <Ionicons name="close" size={16} color={C.muted} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <AppModal visible={editModal} title="تعديل العميل" onClose={() => setEditModal(false)} onSave={saveEdit} saving={saving}>
        <Field label="اسم العميل" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <Field label="رقم الجوال" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
        <Text style={styles.fieldLabel}>نوع الخدمة</Text>
        <ServiceTypeChips
          value={form.service_type}
          onChange={(v) => setForm({ ...form, service_type: v, sub_category: '' })}
          includeBoth
        />
        <CategoryPicker
          serviceType={form.service_type}
          value={form.sub_category}
          onChange={(v) => setForm({ ...form, sub_category: v })}
        />
        <Field label="السعر المتفق عليه (ر.س)" value={form.agreed_price} onChangeText={(v) => setForm({ ...form, agreed_price: v })} keyboardType="numeric" />
        <SanadPriceOpinion
          serviceType={form.service_type}
          subCategory={form.sub_category}
          price={parseFloat(form.agreed_price) || 0}
          clientName={form.name}
        />
        <Field label="مصدر العميل" value={form.source} onChangeText={(v) => setForm({ ...form, source: v })} />
        <Field label="رابط Google Drive" value={form.drive_link} onChangeText={(v) => setForm({ ...form, drive_link: v })} autoCapitalize="none" />
        <Field label="ملاحظات" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline />
      </AppModal>

      <AppModal visible={signModal} title="توقيع موافقة العميل" onClose={() => setSignModal(false)}>
        <SignaturePad onSave={saveSignature} onCancel={() => setSignModal(false)} />
      </AppModal>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon} size={16} color={C.brand} />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row-reverse', backgroundColor: C.surface, borderRadius: R.md, padding: 4, gap: 4, marginBottom: 12, ...shadow },
  statusBtn: { flex: 1, paddingVertical: 10, borderRadius: R.sm + 2, alignItems: 'center' },
  statusActive: { backgroundColor: C.brand },
  statusText: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2 },
  timelineCard: { backgroundColor: C.surface, borderRadius: R.md, padding: 14, marginBottom: 12, ...shadow },
  timelineTitle: { fontFamily: F.bold, fontSize: 13, color: C.onSurface, textAlign: 'right', marginBottom: 12 },
  progressTrack: { height: 6, backgroundColor: C.surface2, borderRadius: 3, marginBottom: 10, overflow: 'hidden' },
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
  signedHint: { fontFamily: F.semibold, fontSize: 12, color: C.success, textAlign: 'center', marginTop: 8 },
  signPromptBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
  },
  signPromptText: { fontFamily: F.semibold, fontSize: 13, color: C.brand },
  actionsRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: R.md,
    paddingVertical: 12,
    minHeight: 46,
  },
  actionText: { fontFamily: F.bold, fontSize: 13, color: '#FFF' },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 16, marginBottom: 12, ...shadow },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 8 },
  infoIconWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontFamily: F.regular, fontSize: 13, color: C.muted, flex: 1, textAlign: 'right' },
  infoValue: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface },
  driveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    paddingVertical: 12,
    marginTop: 8,
  },
  driveText: { fontFamily: F.bold, fontSize: 13, color: C.brand },
  notes: {
    fontFamily: F.regular,
    fontSize: 13,
    color: C.onSurface2,
    textAlign: 'right',
    marginTop: 10,
    backgroundColor: C.surface2,
    borderRadius: R.sm,
    padding: 10,
    lineHeight: 22,
  },
  sectionTitle: { fontFamily: F.bold, fontSize: 16, color: C.onSurface, textAlign: 'right', marginBottom: 10 },
  logInputRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  logInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    backgroundColor: C.surface2,
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontFamily: F.regular,
    fontSize: 13,
    color: C.onSurface,
    textAlign: 'right',
  },
  logAddBtn: { width: 42, height: 42, borderRadius: R.md, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  uploadBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(62,145,148,0.25)',
    borderStyle: 'dashed',
  },
  uploadText: { fontFamily: F.bold, fontSize: 12, color: C.brand },
  emptyLogs: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 12 },
  logRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  logText: { fontFamily: F.regular, fontSize: 13, color: C.onSurface, textAlign: 'right' },
  logDate: { fontFamily: F.regular, fontSize: 10, color: C.muted, marginTop: 2 },
  attachRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: C.brandSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.sm,
  },
  attachName: { fontFamily: F.semibold, fontSize: 11, color: C.brand },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
});
