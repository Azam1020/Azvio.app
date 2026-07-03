import React, { useCallback, useState } from 'react';
import {
  Linking,
  Platform,
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
import { api } from '@/src/api';
import { AppModal, Chips, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, fmt, shadow } from '@/src/theme';
import { SERVICE_LABELS, SERVICE_OPTIONS, openWhatsApp } from '@/src/clientHelpers';

const LOG_TYPES = [
  { key: 'note', label: 'ملاحظة' },
  { key: 'whatsapp', label: 'واتساب' },
  { key: 'form', label: 'نموذج' },
];

const LOG_ICONS: Record<string, any> = {
  note: 'document-text-outline',
  whatsapp: 'logo-whatsapp',
  form: 'clipboard-outline',
};

export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<any>(null);
  const [logText, setLogText] = useState('');
  const [logType, setLogType] = useState('note');
  const [editModal, setEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  const load = useCallback(async () => {
    try {
      setClient(await api(`/clients/${id}`));
    } catch {}
  }, [id]);

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

  const addLog = async () => {
    if (!logText.trim()) return;
    await api(`/clients/${id}/logs`, {
      method: 'POST',
      body: JSON.stringify({ text: logText.trim(), log_type: logType }),
    });
    setLogText('');
    load();
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

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title={client.name}
        subtitle={SERVICE_LABELS[client.service_type]}
        canBack
        right={
          <TouchableOpacity onPress={deleteClient} hitSlop={8} testID="delete-client-btn">
            <Ionicons name="trash-outline" size={20} color={C.error} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
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
            />
            <TouchableOpacity style={styles.logAddBtn} onPress={addLog} testID="add-log-btn">
              <Ionicons name="add" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
          {logs.length === 0 ? (
            <Text style={styles.emptyLogs}>لا توجد سجلات بعد</Text>
          ) : (
            logs.map((log: any) => (
              <View key={log.id} style={styles.logRow}>
                <Ionicons name={LOG_ICONS[log.log_type] || 'document-text-outline'} size={16} color={C.brand} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.logText}>{log.text}</Text>
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
        <Chips options={SERVICE_OPTIONS} value={form.service_type} onChange={(v) => setForm({ ...form, service_type: v })} />
        <Field label="السعر المتفق عليه (ر.س)" value={form.agreed_price} onChangeText={(v) => setForm({ ...form, agreed_price: v })} keyboardType="numeric" />
        <Field label="مصدر العميل" value={form.source} onChangeText={(v) => setForm({ ...form, source: v })} />
        <Field label="رابط Google Drive" value={form.drive_link} onChangeText={(v) => setForm({ ...form, drive_link: v })} autoCapitalize="none" />
        <Field label="ملاحظات" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline />
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
  logInputRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 12 },
  logInput: {
    flex: 1,
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
  emptyLogs: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 12 },
  logRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  logText: { fontFamily: F.regular, fontSize: 13, color: C.onSurface, textAlign: 'right' },
  logDate: { fontFamily: F.regular, fontSize: 10, color: C.muted, marginTop: 2 },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
});
