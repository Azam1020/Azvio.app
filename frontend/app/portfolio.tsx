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
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { api } from '@/src/api';
import { AppModal, Empty, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';
import { useServiceTypeLabel } from '@/src/ServiceTypeChips';

type Media = {
  kind: 'supabase' | 'base64';
  name: string;
  mime: string;
  path?: string;
  log_id?: string;
  url?: string;
};

type Item = {
  id: string;
  client_id: string;
  client_name: string;
  service_type: string;
  sub_category: string;
  title: string;
  description: string;
  tags: string[];
  media: Media[];
  cover_url?: string;
  public?: boolean;
  auto_generated?: boolean;
  created_at: string;
};

export default function PortfolioScreen() {
  const { width } = useWindowDimensions();
  const serviceLabels = useServiceTypeLabel();
  const [items, setItems] = useState<Item[]>([]);
  const [detail, setDetail] = useState<Item | null>(null);
  const [edit, setEdit] = useState({ title: '', description: '', tags: '', public: false });
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api('/portfolio'));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openDetail = async (it: Item) => {
    try {
      const full = await api(`/portfolio/${it.id}`);
      setDetail(full);
      setEdit({
        title: full.title || '',
        description: full.description || '',
        tags: (full.tags || []).join('، '),
        public: !!full.public,
      });
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر جلب التفاصيل');
    }
  };

  const saveEdit = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const tags = edit.tags
        .split(/[،,]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8);
      await api(`/portfolio/${detail.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: edit.title.trim(),
          description: edit.description.trim(),
          tags,
          public: edit.public,
        }),
      });
      setDetail(null);
      load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر الحفظ');
    }
    setSaving(false);
  };

  const regenerate = async () => {
    if (!detail) return;
    setRegenerating(true);
    try {
      const updated = await api(`/portfolio/${detail.id}/regenerate`, { method: 'POST' });
      setEdit({
        title: updated.title || '',
        description: updated.description || '',
        tags: (updated.tags || []).join('، '),
        public: !!updated.public,
      });
      setDetail(updated);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر التوليد');
    }
    setRegenerating(false);
  };

  const removeItem = async (it: Item) => {
    if (await confirmAsync('حذف من البورتفوليو', `حذف "${it.title}"؟ (لن يُحذف العميل)`)) {
      await api(`/portfolio/${it.id}`, { method: 'DELETE' });
      setDetail(null);
      load();
    }
  };

  const syncAll = async () => {
    setSyncing(true);
    try {
      const r = await api('/portfolio/sync-all', { method: 'POST' });
      Alert.alert('تمت المزامنة', `مضاف: ${r.added} — محدث: ${r.updated}`);
      load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر المزامنة');
    }
    setSyncing(false);
  };

  const openMedia = async (m: Media) => {
    if (!detail) return;
    try {
      if (m.url) {
        if (Platform.OS === 'web') (globalThis as any).window?.open?.(m.url, '_blank');
        else await WebBrowser.openBrowserAsync(m.url);
        return;
      }
      if (m.kind === 'base64' && m.log_id) {
        const att = await api(`/clients/${detail.client_id}/logs/${m.log_id}/attachment`);
        if (att?.url) {
          if (Platform.OS === 'web') (globalThis as any).window?.open?.(att.url, '_blank');
          else await WebBrowser.openBrowserAsync(att.url);
        } else if (att?.data) {
          const dataUri = `data:${att.mime};base64,${att.data}`;
          if (Platform.OS === 'web') (globalThis as any).window?.open?.(dataUri, '_blank');
          else Linking.openURL(dataUri);
        }
      }
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر فتح الملف');
    }
  };

  const cardWidth = (width - 16 * 2 - 12) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title="البورتفوليو"
        subtitle="مشاريعك المُسلَّمة مع سند"
        canBack
        right={
          <TouchableOpacity
            style={[styles.syncBtn, syncing && { opacity: 0.6 }]}
            onPress={syncAll}
            disabled={syncing}
            testID="portfolio-sync-btn"
          >
            {syncing ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="sync" size={18} color="#FFF" />
            )}
          </TouchableOpacity>
        }
      />
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        numColumns={2}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
        ListEmptyComponent={
          <Empty
            icon="images-outline"
            text="لا توجد مشاريع في البورتفوليو بعد"
            hint={'أي مشروع تُغيّر حالته إلى "تم التسليم" يُضاف هنا تلقائياً'}
          />
        }
        renderItem={({ item }) => {
          const cover = item.cover_url || item.media?.find((m) => m.mime.startsWith('image/'))?.url;
          return (
            <TouchableOpacity
              style={[styles.card, { width: cardWidth }]}
              onPress={() => openDetail(item)}
              testID={`portfolio-item-${item.id}`}
            >
              <View style={styles.thumb}>
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.thumbImg} resizeMode="cover" />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Ionicons name="image-outline" size={30} color={C.muted} />
                    <Text style={styles.thumbHint}>لا صور</Text>
                  </View>
                )}
                {item.media?.length > 0 && (
                  <View style={styles.mediaCount}>
                    <Ionicons name="albums" size={10} color="#FFF" />
                    <Text style={styles.mediaCountText}>{item.media.length}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {serviceLabels[item.service_type] || item.service_type}
                {item.sub_category ? ` • ${item.sub_category}` : ''}
              </Text>
              {item.tags?.length > 0 && (
                <View style={styles.tagsRow}>
                  {item.tags.slice(0, 2).map((t) => (
                    <View key={t} style={styles.tagChip}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                  {item.tags.length > 2 && <Text style={styles.moreTag}>+{item.tags.length - 2}</Text>}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail modal */}
      <AppModal
        visible={!!detail}
        title="تفاصيل المشروع"
        onClose={() => setDetail(null)}
        onSave={saveEdit}
        saveLabel="حفظ"
        saving={saving}
      >
        {detail && (
          <ScrollView style={{ maxHeight: 520 }}>
            {/* Media strip */}
            {detail.media?.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mediaStrip}
              >
                {detail.media.map((m, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.mediaBox}
                    onPress={() => openMedia(m)}
                  >
                    {m.url && m.mime.startsWith('image/') ? (
                      <Image source={{ uri: m.url }} style={styles.mediaImg} resizeMode="cover" />
                    ) : (
                      <View style={styles.mediaPlaceholder}>
                        <Ionicons
                          name={m.mime.startsWith('video/') ? 'videocam' : 'image'}
                          size={26}
                          color={C.brand}
                        />
                        <Text style={styles.mediaName} numberOfLines={1}>{m.name}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.clientRow}>
              <Ionicons name="person" size={14} color={C.brand} />
              <Text style={styles.clientText}>العميل: {detail.client_name || '—'}</Text>
            </View>

            <Text style={styles.label}>العنوان</Text>
            <TextInput
              style={styles.input}
              value={edit.title}
              onChangeText={(v) => setEdit({ ...edit, title: v })}
              placeholder="عنوان جذاب للبورتفوليو"
              placeholderTextColor={C.muted}
            />

            <Text style={styles.label}>الوصف</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              value={edit.description}
              onChangeText={(v) => setEdit({ ...edit, description: v })}
              placeholder="وصف احترافي مختصر يعرض قيمة المشروع"
              placeholderTextColor={C.muted}
              multiline
            />

            <Text style={styles.label}>الوسوم (افصل بالفواصل)</Text>
            <TextInput
              style={styles.input}
              value={edit.tags}
              onChangeText={(v) => setEdit({ ...edit, tags: v })}
              placeholder="عقاري، درون، تصوير_جوي"
              placeholderTextColor={C.muted}
            />

            <View style={styles.publicRow}>
              <Switch
                value={edit.public}
                onValueChange={(v) => setEdit({ ...edit, public: v })}
                trackColor={{ true: C.brand, false: C.border }}
                thumbColor="#FFF"
              />
              <Text style={styles.publicLabel}>اعرض في البورتفوليو العام</Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.regenBtn, regenerating && { opacity: 0.6 }]}
                onPress={regenerate}
                disabled={regenerating}
                testID="regenerate-portfolio-btn"
              >
                {regenerating ? (
                  <ActivityIndicator color={C.brand} size="small" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color={C.brand} />
                    <Text style={styles.regenText}>سند يعيد التوليد</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteBtn]}
                onPress={() => removeItem(detail)}
                testID="delete-portfolio-btn"
              >
                <Ionicons name="trash" size={16} color={C.error} />
                <Text style={styles.deleteText}>حذف من البورتفوليو</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  syncBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 10, ...shadow },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: R.md,
    overflow: 'hidden',
    backgroundColor: C.surface2,
    marginBottom: 8,
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  thumbHint: { fontFamily: F.regular, fontSize: 10, color: C.muted },
  mediaCount: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: R.pill,
  },
  mediaCountText: { fontFamily: F.bold, fontSize: 10, color: '#FFF' },
  cardTitle: { fontFamily: F.bold, fontSize: 13, color: C.onSurface, textAlign: 'right', minHeight: 34 },
  cardMeta: { fontFamily: F.regular, fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 2 },
  tagsRow: { flexDirection: 'row-reverse', gap: 4, marginTop: 6, alignItems: 'center' },
  tagChip: { backgroundColor: C.brandSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: R.sm },
  tagText: { fontFamily: F.semibold, fontSize: 9, color: C.brand },
  moreTag: { fontFamily: F.bold, fontSize: 10, color: C.muted },
  mediaStrip: { flexDirection: 'row-reverse', gap: 8, marginBottom: 14, paddingBottom: 4 },
  mediaBox: {
    width: 90,
    height: 90,
    borderRadius: R.md,
    backgroundColor: C.surface2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  mediaImg: { width: '100%', height: '100%' },
  mediaPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 4, gap: 4 },
  mediaName: { fontFamily: F.regular, fontSize: 9, color: C.muted, textAlign: 'center' },
  clientRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.brandSoft,
    padding: 8,
    borderRadius: R.md,
    marginBottom: 12,
  },
  clientText: { fontFamily: F.semibold, fontSize: 12, color: C.brand },
  label: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: F.regular,
    fontSize: 14,
    color: C.onSurface,
    textAlign: 'right',
    minHeight: 44,
  },
  publicRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 10,
    backgroundColor: C.surface2,
    borderRadius: R.md,
  },
  publicLabel: { flex: 1, fontFamily: F.semibold, fontSize: 13, color: C.onSurface, textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', gap: 10, marginTop: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: R.md,
    minHeight: 44,
  },
  regenBtn: { backgroundColor: C.brandSoft, borderWidth: 1, borderColor: 'rgba(62,145,148,0.3)' },
  regenText: { fontFamily: F.bold, fontSize: 12, color: C.brand },
  deleteBtn: { backgroundColor: '#FDECEC', borderWidth: 1, borderColor: 'rgba(220,53,69,0.3)' },
  deleteText: { fontFamily: F.bold, fontSize: 12, color: C.error },
});
