import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from './api';
import { C, F, R, shadow } from './theme';

export type ServiceType = {
  id: string;
  key: string;
  label: string;
  description?: string;
  icon?: string;
  is_default?: boolean;
};

const AR_KEY_RE = /[\u0621-\u064A]/;
function slugifyLabel(label: string): string {
  const trimmed = (label || '').trim().toLowerCase();
  if (!trimmed) return `type_${Date.now().toString(36)}`;
  // Latin/digits only path
  if (!AR_KEY_RE.test(trimmed)) {
    const s = trimmed.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return s || `type_${Date.now().toString(36)}`;
  }
  // Arabic labels → generate short random key
  return `type_${Math.random().toString(36).slice(2, 8)}`;
}

const CHANGE_EVENT = 'azvio_service_types_changed';

/**
 * ServiceTypeChips — horizontally scrollable, dynamic dropdown-like chips
 * pulling from GET /service-types. Supports "+ إضافة نوع" and (optionally) a "both" special value.
 */
export function ServiceTypeChips({
  value,
  onChange,
  includeBoth = false,
  disabled = false,
  onTypesLoaded,
}: {
  value: string;
  onChange: (v: string) => void;
  includeBoth?: boolean;
  disabled?: boolean;
  onTypesLoaded?: (types: ServiceType[]) => void;
}) {
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list: ServiceType[] = await api('/service-types');
      setTypes(list || []);
      onTypesLoaded?.(list || []);
    } catch {
      setTypes([]);
    }
    setLoading(false);
  }, [onTypesLoaded]);

  useEffect(() => {
    load();
    // Listen for global change events (web)
    const g: any = globalThis;
    const h = () => load();
    g.addEventListener?.(CHANGE_EVENT, h);
    return () => g.removeEventListener?.(CHANGE_EVENT, h);
  }, [load]);

  const createNew = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setCreating(true);
    try {
      const key = slugifyLabel(label);
      const created = await api('/service-types', {
        method: 'POST',
        body: JSON.stringify({
          key,
          label,
          description: newDesc.trim(),
          icon: 'briefcase-outline',
        }),
      });
      // Refresh, select the new one
      await load();
      onChange(created.key);
      setNewLabel('');
      setNewDesc('');
      setModalOpen(false);
      // Notify others
      (globalThis as any).dispatchEvent?.(new Event(CHANGE_EVENT));
    } catch (e: any) {
      // Ignore, keep modal open with the input
      console.warn('Failed to create service type', e);
    }
    setCreating(false);
  };

  const options: { key: string; label: string; icon?: string }[] = [
    ...types.map((t) => ({ key: t.key, label: t.label, icon: t.icon })),
    ...(includeBoth ? [{ key: 'both', label: 'الاثنين معاً', icon: 'infinite' }] : []),
  ];

  return (
    <View>
      {loading && types.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={C.brand} />
          <Text style={styles.loadingText}>يحمّل الأنواع...</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {/* Add new chip (leftmost visually since row-reverse) */}
          <TouchableOpacity
            style={[styles.chip, styles.addChip, disabled && { opacity: 0.5 }]}
            onPress={() => !disabled && setModalOpen(true)}
            disabled={disabled}
            testID="add-service-type-chip"
          >
            <Ionicons name="add-circle" size={14} color={C.brand} />
            <Text style={styles.addChipText}>نوع جديد</Text>
          </TouchableOpacity>
          {options.map((opt) => {
            const active = value === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => !disabled && onChange(opt.key)}
                disabled={disabled}
                testID={`service-type-${opt.key}`}
              >
                {!!opt.icon && (
                  <Ionicons
                    name={opt.icon as any}
                    size={13}
                    color={active ? '#FFF' : C.brand}
                    style={{ marginLeft: 4 }}
                  />
                )}
                <Text style={[styles.chipText, active && { color: '#FFF' }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setModalOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Ionicons name="briefcase" size={20} color={C.brand} />
              <Text style={styles.sheetTitle}>إضافة نوع خدمة جديد</Text>
            </View>
            <Text style={styles.hint}>
              أضف نوع خدمة جديد لظهوره في العملاء والخدمات والتسعير.
            </Text>
            <Text style={styles.label}>الاسم *</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: تصوير فوتوغرافي، صوت"
              placeholderTextColor={C.muted}
              value={newLabel}
              onChangeText={setNewLabel}
              testID="new-service-type-name"
            />
            <Text style={styles.label}>وصف مختصر (اختياري)</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              placeholder="ما الذي يشمله هذا النوع؟"
              placeholderTextColor={C.muted}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setModalOpen(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={createNew}
                disabled={creating || !newLabel.trim()}
                style={[styles.saveBtn, (creating || !newLabel.trim()) && { opacity: 0.5 }]}
                testID="save-new-service-type"
              >
                {creating ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.saveText}>إضافة</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Small helper to convert a service_type key into its Arabic label using loaded types + fallbacks. */
export function useServiceTypeLabel() {
  const [labels, setLabels] = useState<Record<string, string>>({ drone: 'درون', editing: 'مونتاج', both: 'درون + مونتاج' });
  useEffect(() => {
    (async () => {
      try {
        const list: ServiceType[] = await api('/service-types');
        const map: Record<string, string> = { both: 'درون + مونتاج' };
        (list || []).forEach((t) => (map[t.key] = t.label));
        setLabels(map);
      } catch {}
    })();
  }, []);
  return labels;
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 8 },
  loadingText: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  chipsRow: { flexDirection: 'row-reverse', gap: 6, paddingVertical: 2 },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: R.pill,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 36,
  },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { fontFamily: F.semibold, fontSize: 12, color: C.onSurface2 },
  addChip: {
    backgroundColor: C.brandSoft,
    borderColor: 'rgba(62,145,148,0.35)',
    borderStyle: 'dashed',
  },
  addChipText: { fontFamily: F.bold, fontSize: 12, color: C.brand, marginRight: 4 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 18,
    ...shadow,
  },
  sheetHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 },
  sheetTitle: { fontFamily: F.bold, fontSize: 16, color: C.onSurface },
  hint: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginBottom: 14, lineHeight: 20 },
  label: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginBottom: 6 },
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
    marginBottom: 12,
    minHeight: 44,
  },
  actions: { flexDirection: 'row-reverse', gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: R.md, backgroundColor: C.surface2 },
  cancelText: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface2 },
  saveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: R.md, backgroundColor: C.brand },
  saveText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
