import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { api } from '@/src/api';
import { apiCached } from '@/src/offlineCache';
import { OfflineBanner } from '@/src/OfflineBanner';
import { AppModal, Empty, Field } from '@/src/ui';
import { F, R, fmt, shadow } from '@/src/theme';
import { useTheme } from '@/src/ThemeContext';
import { SERVICE_LABELS, openWhatsApp } from '@/src/clientHelpers';
import { CategoryPicker } from '@/src/CategoryPicker';
import { SanadPriceOpinion } from '@/src/SanadPriceOpinion';
import { ServiceTypeChips, useServiceTypeLabel } from '@/src/ServiceTypeChips';

export default function ClientsScreen() {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const serviceLabels = useServiceTypeLabel();
  const [clients, setClients] = useState<any[]>([]);
  const [offline, setOffline] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    service_type: 'drone',
    sub_category: '',
    agreed_price: '',
    source: '',
    drive_link: '',
    notes: '',
  });

  const load = useCallback(async () => {
    try {
      const { data, fromCache } = await apiCached('/clients', 'clients');
      setClients(data);
      setOffline(fromCache);
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

  const [sortOldestFirst, setSortOldestFirst] = useState(false);

  const filtered = clients
    .filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const da = a.created_at || '';
      const db = b.created_at || '';
      return sortOldestFirst ? da.localeCompare(db) : db.localeCompare(da);
    });

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api('/clients', {
        method: 'POST',
        body: JSON.stringify({ ...form, agreed_price: parseFloat(form.agreed_price) || 0 }),
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModal(false);
      setForm({ name: '', phone: '', service_type: 'drone', sub_category: '', agreed_price: '', source: '', drive_link: '', notes: '' });
      load();
    } catch {}
    setSaving(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>العملاء</Text>
        <Text style={styles.count}>{clients.length} عميل</Text>
        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
          <View style={[styles.searchBox, { flex: 1 }]}>
            <Ionicons name="search" size={18} color={C.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث عن عميل..."
              placeholderTextColor={C.muted}
              value={search}
              onChangeText={setSearch}
              testID="client-search"
            />
          </View>
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setSortOldestFirst((v) => !v)}
            testID="sort-clients-btn"
          >
            <Ionicons name={sortOldestFirst ? 'arrow-up' : 'arrow-down'} size={18} color={C.brand} />
          </TouchableOpacity>
        </View>
      </View>

      <OfflineBanner visible={offline} />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <Empty
            icon="people-outline"
            text="لا يوجد عملاء بعد"
            hint="أضف أول عميل بالزر بالأسفل"
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/client/${item.id}`)}
            testID={`client-card-${item.id}`}
          >
            <View pointerEvents="none" style={[styles.cardBracket, styles.cardBracketTL]} />
            <View style={styles.cardRow}>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.name}>{item.name}</Text>
                <View style={styles.metaRow}>
                  <View style={styles.serviceChip}>
                    <Text style={styles.serviceText}>{serviceLabels[item.service_type] || SERVICE_LABELS[item.service_type] || item.service_type}</Text>
                  </View>
                  {!!item.sub_category && (
                    <View style={styles.subChip}>
                      <Text style={styles.subChipText}>{item.sub_category}</Text>
                    </View>
                  )}
                  {!!item.source && !item.sub_category && <Text style={styles.source}>{item.source}</Text>}
                </View>
              </View>
              <TouchableOpacity
                style={styles.waBtn}
                onPress={() => openWhatsApp(item.phone)}
                hitSlop={6}
                testID={`wa-btn-${item.id}`}
              >
                <Ionicons name="logo-whatsapp" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.bottomRow}>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: item.status === 'delivered' ? '#E9F9EE' : '#FFF8E0' },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    { color: item.status === 'delivered' ? C.success : '#B8860B' },
                  ]}
                >
                  {item.status === 'delivered' ? 'تم التسليم' : 'قيد التنفيذ'}
                </Text>
              </View>
              <Text style={styles.price}>{fmt(item.agreed_price)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModal(true)} testID="add-client-fab">
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      <AppModal visible={modal} title="إضافة عميل جديد" onClose={() => setModal(false)} onSave={save} saving={saving}>
        <Field label="اسم العميل *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="مثال: شركة الأفق العقارية" />
        <Field label="رقم الجوال" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} placeholder="05xxxxxxxx" keyboardType="phone-pad" />
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
        <Field label="السعر المتفق عليه (ر.س)" value={form.agreed_price} onChangeText={(v) => setForm({ ...form, agreed_price: v })} placeholder="0" keyboardType="numeric" />
        <SanadPriceOpinion
          serviceType={form.service_type}
          subCategory={form.sub_category}
          price={parseFloat(form.agreed_price) || 0}
          clientName={form.name}
        />
        <Field label="مصدر العميل (اختياري)" value={form.source} onChangeText={(v) => setForm({ ...form, source: v })} placeholder="انستقرام، توصية، موقع..." />
        <Field label="رابط Google Drive" value={form.drive_link} onChangeText={(v) => setForm({ ...form, drive_link: v })} placeholder="https://drive.google.com/..." autoCapitalize="none" />
        <Field label="ملاحظات" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline placeholder="تفاصيل إضافية..." />
      </AppModal>
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  title: { fontFamily: F.bold, fontSize: 22, color: C.onSurface, textAlign: 'right' },
  count: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginBottom: 10 },
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface2,
    borderRadius: R.md,
    paddingHorizontal: 12,
  },
  sortBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
    borderRadius: R.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontFamily: F.regular,
    fontSize: 14,
    color: C.onSurface,
    textAlign: 'right',
  },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 16, marginBottom: 12, overflow: 'hidden', ...shadow },
  cardBracket: { position: 'absolute', width: 12, height: 12, borderColor: C.brand, opacity: 0.3 },
  cardBracketTL: { top: 6, left: 6, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 4 },
  cardRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  name: { fontFamily: F.bold, fontSize: 16, color: C.onSurface },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 4 },
  serviceChip: { backgroundColor: C.brandSoft, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 2 },
  serviceText: { fontFamily: F.semibold, fontSize: 11, color: C.brand },
  subChip: { backgroundColor: C.surface2, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 2 },
  subChipText: { fontFamily: F.semibold, fontSize: 11, color: C.onSurface2 },
  source: { fontFamily: F.regular, fontSize: 11, color: C.muted },
  waBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.whatsapp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  statusPill: { borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 4 },
  statusText: { fontFamily: F.semibold, fontSize: 12 },
  price: { fontFamily: F.bold, fontSize: 15, color: C.onSurface },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
});
