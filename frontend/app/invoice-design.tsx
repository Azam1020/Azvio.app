import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api, apiUpload } from '@/src/api';
import { Chips, Field, ScreenHeader, confirmAsync } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

const PRESET_COLORS = ['#3E9194', '#8E44AD', '#C0392B', '#16808A', '#B8860B', '#2C3E50'];

export default function InvoiceDesignSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    default_design: 'brand',
    default_apply_vat: true,
    default_vat_rate: '15',
    show_sub_category: true,
    show_notes: true,
    accent_color: '',
    logo_url: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/invoices/design-settings');
      setSettings({
        default_design: r.default_design || 'brand',
        default_apply_vat: r.default_apply_vat ?? true,
        default_vat_rate: String(r.default_vat_rate ?? 15),
        show_sub_category: r.show_sub_category ?? true,
        show_notes: r.show_notes ?? true,
        accent_color: r.accent_color || '',
        logo_url: r.logo_url || '',
      });
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pickAndUploadLogo = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('صلاحية مطلوبة', 'نحتاج صلاحية الوصول للصور');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploading(true);

      const fd = new FormData();
      fd.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'logo.png',
        type: asset.mimeType || 'image/png',
      } as any);

      const r = await apiUpload('/invoices/upload-logo', fd);
      setSettings((s) => ({ ...s, logo_url: r.logo_url }));
      Alert.alert('تم', '✅ تم رفع الشعار بنجاح');
    } catch (e: any) {
      Alert.alert('تعذّر الرفع', e?.message || 'حدث خطأ');
    }
    setUploading(false);
  };

  const removeLogo = async () => {
    if (!(await confirmAsync('حذف الشعار', 'حذف الشعار المرفوع؟'))) return;
    try {
      await api('/invoices/upload-logo', { method: 'DELETE' });
      setSettings((s) => ({ ...s, logo_url: '' }));
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر الحذف');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api('/invoices/design-settings', {
        method: 'PUT',
        body: JSON.stringify({
          default_design: settings.default_design,
          default_apply_vat: settings.default_apply_vat,
          default_vat_rate: parseFloat(settings.default_vat_rate) || 15,
          show_sub_category: settings.show_sub_category,
          show_notes: settings.show_notes,
          accent_color: settings.accent_color,
        }),
      });
      Alert.alert('تم الحفظ', '✅ صار هذا التصميم افتراضي لكل الفواتير الجديدة');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر الحفظ (هذي الإعدادات لصاحب التطبيق فقط)');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={C.brand} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="تصميم الفاتورة" subtitle="هويتك الموحّدة لكل الفواتير وعروض السعر" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الشعار</Text>
          <Text style={styles.sectionHint}>يظهر أعلى يسار كل فاتورة وعرض سعر تصدره</Text>

          {settings.logo_url ? (
            <View style={styles.logoPreviewBox}>
              <Image source={{ uri: settings.logo_url }} style={styles.logoPreview} resizeMode="contain" />
              <View style={styles.logoActions}>
                <TouchableOpacity style={styles.changeLogoBtn} onPress={pickAndUploadLogo} disabled={uploading}>
                  <Text style={styles.changeLogoText}>تغيير</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeLogoBtn} onPress={removeLogo}>
                  <Ionicons name="trash-outline" size={16} color={C.error} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.uploadBox} onPress={pickAndUploadLogo} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator color={C.brand} />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={28} color={C.brand} />
                  <Text style={styles.uploadText}>ارفع شعار مخصص</Text>
                  <Text style={styles.uploadHint}>PNG أو JPEG — حتى 3 ميجابايت</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>لون الهوية</Text>
          <View style={styles.colorRow}>
            {PRESET_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  settings.accent_color === color && styles.colorSwatchActive,
                ]}
                onPress={() => setSettings((s) => ({ ...s, accent_color: color }))}
              >
                {settings.accent_color === color && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.colorSwatch, styles.colorSwatchDefault, !settings.accent_color && styles.colorSwatchActive]}
              onPress={() => setSettings((s) => ({ ...s, accent_color: '' }))}
            >
              <Text style={styles.defaultColorText}>افتراضي</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الإعدادات الافتراضية للفواتير الجديدة</Text>

          <Text style={styles.chipsLabel}>التصميم</Text>
          <Chips
            options={[
              { key: 'brand', label: 'هوية AZVIO' },
              { key: 'minimal', label: 'بسيط' },
            ]}
            value={settings.default_design}
            onChange={(v) => setSettings((s) => ({ ...s, default_design: v }))}
          />

          <View style={styles.switchRow}>
            <Switch
              value={settings.default_apply_vat}
              onValueChange={(v) => setSettings((s) => ({ ...s, default_apply_vat: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>تطبيق ضريبة القيمة المضافة افتراضياً</Text>
          </View>

          {settings.default_apply_vat && (
            <Field
              label="نسبة الضريبة الافتراضية (%)"
              value={settings.default_vat_rate}
              onChangeText={(v) => setSettings((s) => ({ ...s, default_vat_rate: v }))}
              keyboardType="numeric"
            />
          )}

          <View style={styles.switchRow}>
            <Switch
              value={settings.show_sub_category}
              onValueChange={(v) => setSettings((s) => ({ ...s, show_sub_category: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>إظهار الفئة الفرعية بالفاتورة</Text>
          </View>

          <View style={styles.switchRow}>
            <Switch
              value={settings.show_notes}
              onValueChange={(v) => setSettings((s) => ({ ...s, show_notes: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>إظهار الملاحظات بالفاتورة</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>حفظ التصميم</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface2 },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 16, marginBottom: 14, ...shadow },
  sectionTitle: { fontFamily: F.bold, fontSize: 14, color: C.onSurface, textAlign: 'right', marginBottom: 6 },
  sectionHint: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginBottom: 14 },
  uploadBox: {
    borderWidth: 1.5,
    borderColor: C.divider,
    borderStyle: 'dashed',
    borderRadius: R.md,
    paddingVertical: 30,
    alignItems: 'center',
    gap: 6,
  },
  uploadText: { fontFamily: F.semibold, fontSize: 13, color: C.brand, marginTop: 4 },
  uploadHint: { fontFamily: F.regular, fontSize: 11, color: C.muted },
  logoPreviewBox: { alignItems: 'center', gap: 12 },
  logoPreview: { width: 160, height: 70, backgroundColor: C.surface2, borderRadius: R.sm },
  logoActions: { flexDirection: 'row-reverse', gap: 10 },
  changeLogoBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.brandSoft, borderRadius: R.sm },
  changeLogoText: { fontFamily: F.semibold, fontSize: 12, color: C.brand },
  removeLogoBtn: { padding: 8 },
  colorRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  colorSwatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive: { borderColor: C.onSurface },
  colorSwatchDefault: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.divider },
  defaultColorText: { fontFamily: F.regular, fontSize: 9, color: C.muted },
  chipsLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginBottom: 6, marginTop: 4 },
  switchRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 14 },
  switchLabel: { fontFamily: F.regular, fontSize: 13, color: C.onSurface },
  saveBtn: { backgroundColor: C.brand, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
