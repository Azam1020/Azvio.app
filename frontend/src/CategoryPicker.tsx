import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from './theme';
import { AppModal, Field } from './ui';
import {
  Category,
  createCategory,
  listCategories,
  suggestCategories,
} from './clientHelpers';

/**
 * CategoryPicker — inline chips + "manage" button that opens a modal with:
 *  - existing categories (delete)
 *  - Sanad-suggested categories (tap to add)
 *  - manual "add new" field
 */
export function CategoryPicker({
  serviceType,
  value,
  onChange,
  label = 'الفئة الفرعية',
}: {
  serviceType: string; // drone|editing|both
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const parentType = serviceType === 'both' ? 'drone' : serviceType;
  const [cats, setCats] = useState<Category[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [suggested, setSuggested] = useState<{ name: string; description: string }[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await listCategories(parentType);
      setCats(list);
    } catch {}
  }, [parentType]);

  useEffect(() => {
    load();
  }, [load]);

  const askSanad = async () => {
    setLoadingSuggest(true);
    try {
      const r = await suggestCategories({ service_type: parentType });
      setSuggested(r.categories || []);
    } catch {}
    setLoadingSuggest(false);
  };

  const addManual = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const added = await createCategory({
        name: newName.trim(),
        service_type: parentType,
        description: newDesc.trim(),
      });
      setNewName('');
      setNewDesc('');
      await load();
      onChange(added.name);
    } catch {}
    setSaving(false);
  };

  const acceptSuggestion = async (s: { name: string; description: string }) => {
    try {
      const added = await createCategory({
        name: s.name,
        service_type: parentType,
        description: s.description,
      });
      setSuggested((prev) => prev.filter((x) => x.name !== s.name));
      await load();
      onChange(added.name);
    } catch {}
  };

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity onPress={() => setManageOpen(true)} style={styles.manageBtn} testID="manage-categories-btn">
          <Ionicons name="options-outline" size={14} color={C.brand} />
          <Text style={styles.manageText}>إدارة الفئات</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.chipsWrap}>
        {cats.length === 0 && <Text style={styles.emptyChip}>لا توجد فئات — أضف من زر «إدارة الفئات»</Text>}
        {cats.map((c) => {
          const active = value === c.name;
          return (
            <TouchableOpacity
              key={c.id}
              onPress={() => onChange(active ? '' : c.name)}
              style={[styles.chip, active && styles.chipActive]}
              testID={`cat-chip-${c.name}`}
            >
              {c.source === 'sanad' && (
                <Ionicons name="sparkles" size={11} color={active ? '#FFF' : C.brand} style={{ marginLeft: 4 }} />
              )}
              <Text style={[styles.chipText, active && { color: '#FFF' }]}>{c.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <AppModal visible={manageOpen} title="إدارة الفئات الفرعية" onClose={() => setManageOpen(false)}>
        <Text style={styles.sectionHeader}>إضافة يدوية</Text>
        <Field
          label="اسم الفئة *"
          value={newName}
          onChangeText={setNewName}
          placeholder="مثال: تصوير مطاعم"
        />
        <Field
          label="شرح مختصر (لسند فقط، لا يظهر للعميل)"
          value={newDesc}
          onChangeText={setNewDesc}
          placeholder="اذكر متى تُستخدم هذه الفئة أو تفاصيل خاصة"
          multiline
        />
        <TouchableOpacity
          style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          onPress={addManual}
          disabled={saving || !newName.trim()}
          testID="add-category-btn"
        >
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>إضافة الفئة</Text>}
        </TouchableOpacity>

        <View style={styles.divider} />

        <View style={styles.sanadHeaderRow}>
          <Text style={styles.sectionHeader}>اقتراحات سند</Text>
          <TouchableOpacity onPress={askSanad} disabled={loadingSuggest} style={styles.sanadBtn} testID="ask-sanad-btn">
            {loadingSuggest ? (
              <ActivityIndicator size="small" color={C.brand} />
            ) : (
              <>
                <Ionicons name="sparkles" size={14} color={C.brand} />
                <Text style={styles.sanadBtnText}>سند يقترح</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        {suggested.length === 0 && !loadingSuggest && (
          <Text style={styles.hintText}>اضغط «سند يقترح» لتوليد أفكار فئات جديدة</Text>
        )}
        {suggested.map((s) => (
          <View key={s.name} style={styles.suggestCard}>
            <TouchableOpacity onPress={() => acceptSuggestion(s)} style={styles.acceptBtn}>
              <Ionicons name="add" size={18} color="#FFF" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.suggestName}>{s.name}</Text>
              {!!s.description && <Text style={styles.suggestDesc}>{s.description}</Text>}
            </View>
          </View>
        ))}

        <View style={styles.divider} />
        <Text style={styles.sectionHeader}>الفئات الحالية</Text>
        {cats.length === 0 && <Text style={styles.hintText}>لا توجد فئات مضافة بعد</Text>}
        {cats.map((c) => (
          <View key={c.id} style={styles.existingRow}>
            <TouchableOpacity
              onPress={async () => {
                await import('./clientHelpers').then((m) => m.deleteCategory(c.id));
                load();
              }}
              hitSlop={6}
            >
              <Ionicons name="trash-outline" size={16} color={C.error} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                {c.source === 'sanad' && <Ionicons name="sparkles" size={11} color={C.brand} />}
                <Text style={styles.existingName}>{c.name}</Text>
              </View>
              {!!c.description && <Text style={styles.existingDesc}>{c.description}</Text>}
            </View>
          </View>
        ))}
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, textAlign: 'right' },
  manageBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  manageText: { fontFamily: F.semibold, fontSize: 11, color: C.brand },
  chipsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: R.pill,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { fontFamily: F.semibold, fontSize: 12, color: C.onSurface2 },
  emptyChip: { fontFamily: F.regular, fontSize: 12, color: C.muted, paddingVertical: 8 },
  sectionHeader: { fontFamily: F.bold, fontSize: 14, color: C.onSurface, textAlign: 'right', marginBottom: 8 },
  primaryBtn: {
    backgroundColor: C.brand,
    borderRadius: R.md,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 16 },
  sanadHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sanadBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.brandSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.pill,
  },
  sanadBtnText: { fontFamily: F.bold, fontSize: 12, color: C.brand },
  hintText: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginBottom: 8 },
  suggestCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    padding: 12,
    marginBottom: 8,
  },
  acceptBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestName: { fontFamily: F.bold, fontSize: 13, color: C.onSurface },
  suggestDesc: { fontFamily: F.regular, fontSize: 11, color: C.onSurface2, marginTop: 2, textAlign: 'right' },
  existingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  existingName: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface },
  existingDesc: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2, textAlign: 'right' },
});
