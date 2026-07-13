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
import { F, R, shadow } from '@/src/theme';
import { useTheme } from '@/src/ThemeContext';

const PRESET_COLORS = ['#3E9194', '#8E44AD', '#C0392B', '#16808A', '#B8860B', '#2C3E50'];

export default function InvoiceDesignSettingsScreen() {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    default_design: 'brand',
    default_apply_vat: false,
    default_vat_rate: '15',
    show_sub_category: true,
    show_notes: true,
    accent_color: '',
    logo_url: '',
    background_url: '',
    background_opacity: 0.15,
    show_logo: true,
    tax_number: '',
    show_tax_number: false,
    footer_text: 'AZVIO — التصوير الجوي بالدرون والمونتاج',
    terms_text: '',
    font_choice: 'cairo',
    show_document_number: true,
    show_date: true,
    show_client_name: true,
    show_footer: true,
    show_terms: true,
    logo_position: 'right',
    content_align: 'right',
  });
  const [fontOptions, setFontOptions] = useState<{ key: string; label: string }[]>([
    { key: 'cairo', label: 'Cairo (افتراضي)' },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/invoices/design-settings');
      setSettings({
        default_design: r.default_design || 'brand',
        default_apply_vat: r.default_apply_vat ?? false,
        default_vat_rate: String(r.default_vat_rate ?? 15),
        show_sub_category: r.show_sub_category ?? true,
        show_notes: r.show_notes ?? true,
        accent_color: r.accent_color || '',
        logo_url: r.logo_url || '',
        background_url: r.background_url || '',
        background_opacity: r.background_opacity ?? 0.15,
        show_logo: r.show_logo ?? true,
        tax_number: r.tax_number || '',
        show_tax_number: r.show_tax_number ?? false,
        footer_text: r.footer_text || 'AZVIO — التصوير الجوي بالدرون والمونتاج',
        terms_text: r.terms_text || '',
        font_choice: r.font_choice || 'cairo',
        show_document_number: r.show_document_number ?? true,
        show_date: r.show_date ?? true,
        show_client_name: r.show_client_name ?? true,
        show_footer: r.show_footer ?? true,
        show_terms: r.show_terms ?? true,
        logo_position: r.logo_position || 'right',
        content_align: r.content_align || 'right',
      });
      if (r.font_options?.length) setFontOptions(r.font_options);
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

  const pickAndUploadBackground = async () => {
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
      setUploadingBg(true);

      const fd = new FormData();
      fd.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'background.png',
        type: asset.mimeType || 'image/png',
      } as any);

      const r = await apiUpload('/invoices/upload-background', fd);
      setSettings((s) => ({ ...s, background_url: r.background_url }));
      Alert.alert('تم', '✅ تم رفع الخلفية بنجاح');
    } catch (e: any) {
      Alert.alert('تعذّر الرفع', e?.message || 'حدث خطأ');
    }
    setUploadingBg(false);
  };

  const removeBackground = async () => {
    if (!(await confirmAsync('حذف الخلفية', 'حذف الخلفية المرفوعة؟'))) return;
    try {
      await api('/invoices/upload-background', { method: 'DELETE' });
      setSettings((s) => ({ ...s, background_url: '' }));
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر الحذف');
    }
  };

  const updateOpacity = async (opacity: number) => {
    setSettings((s) => ({ ...s, background_opacity: opacity }));
    try {
      await api('/invoices/background-opacity', { method: 'PUT', body: JSON.stringify({ opacity }) });
    } catch {}
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
          show_logo: settings.show_logo,
          tax_number: settings.tax_number,
          show_tax_number: settings.show_tax_number,
          footer_text: settings.footer_text,
          terms_text: settings.terms_text,
          font_choice: settings.font_choice,
          show_document_number: settings.show_document_number,
          show_date: settings.show_date,
          show_client_name: settings.show_client_name,
          show_footer: settings.show_footer,
          show_terms: settings.show_terms,
          logo_position: settings.logo_position,
          content_align: settings.content_align,
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
              <View style={styles.switchRow}>
                <Switch
                  value={settings.show_logo}
                  onValueChange={(v) => setSettings((s) => ({ ...s, show_logo: v }))}
                  trackColor={{ true: C.brand, false: C.border }}
                />
                <Text style={styles.switchLabel}>إظهار الشعار بالفاتورة</Text>
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

        {/* الخلفية المخصصة (طلب: احط فيه الخلفية اللي أبيها) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الخلفية</Text>
          <Text style={styles.sectionHint}>صورة خلفية كاملة خلف محتوى الفاتورة (شعار مائي، تصميم مخصص...)</Text>

          {settings.background_url ? (
            <View style={styles.logoPreviewBox}>
              <Image source={{ uri: settings.background_url }} style={styles.bgPreview} resizeMode="cover" />
              <View style={styles.logoActions}>
                <TouchableOpacity style={styles.changeLogoBtn} onPress={pickAndUploadBackground} disabled={uploadingBg}>
                  <Text style={styles.changeLogoText}>تغيير</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeLogoBtn} onPress={removeBackground}>
                  <Ionicons name="trash-outline" size={16} color={C.error} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.chipsLabel, { marginTop: 14 }]}>درجة الوضوح</Text>
              <View style={styles.colorRow}>
                {[0.08, 0.15, 0.25, 0.4].map((op) => (
                  <TouchableOpacity
                    key={op}
                    style={[styles.opacityChip, settings.background_opacity === op && styles.opacityChipActive]}
                    onPress={() => updateOpacity(op)}
                  >
                    <Text style={[styles.opacityChipText, settings.background_opacity === op && styles.opacityChipTextActive]}>
                      {Math.round(op * 100)}٪
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.uploadBox} onPress={pickAndUploadBackground} disabled={uploadingBg}>
              {uploadingBg ? (
                <ActivityIndicator color={C.brand} />
              ) : (
                <>
                  <Ionicons name="image-outline" size={28} color={C.brand} />
                  <Text style={styles.uploadText}>ارفع خلفية مخصصة</Text>
                  <Text style={styles.uploadHint}>PNG أو JPEG — حتى 5 ميجابايت</Text>
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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>بيانات إضافية بالفاتورة</Text>

          <View style={styles.switchRow}>
            <Switch
              value={settings.show_tax_number}
              onValueChange={(v) => setSettings((s) => ({ ...s, show_tax_number: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>إظهار الرقم الضريبي / السجل التجاري</Text>
          </View>

          {settings.show_tax_number && (
            <Field
              label="الرقم الضريبي / السجل التجاري"
              value={settings.tax_number}
              onChangeText={(v) => setSettings((s) => ({ ...s, tax_number: v }))}
              placeholder="مثال: 3XXXXXXXXXXXXXX"
            />
          )}

          <Field
            label="نص تذييل الفاتورة"
            value={settings.footer_text}
            onChangeText={(v) => setSettings((s) => ({ ...s, footer_text: v }))}
            placeholder="AZVIO — التصوير الجوي بالدرون والمونتاج"
          />

          <Field
            label="شروط أو ملاحظات ثابتة (اختياري)"
            value={settings.terms_text}
            onChangeText={(v) => setSettings((s) => ({ ...s, terms_text: v }))}
            placeholder="مثال: يسري السعر لمدة 7 أيام — الدفع مقدماً 50٪"
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>خيارات متقدمة</Text>

          <Text style={styles.fieldLabel}>الخط</Text>
          <View style={styles.fontRow}>
            {fontOptions.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.fontChip, settings.font_choice === f.key && styles.fontChipActive]}
                onPress={() => setSettings((s) => ({ ...s, font_choice: f.key }))}
              >
                <Text style={[styles.fontChipText, settings.font_choice === f.key && styles.fontChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>موضع الشعار (فوق)</Text>
          <View style={styles.fontRow}>
            {[
              { key: 'right', label: 'يمين' },
              { key: 'left', label: 'يسار' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.fontChip, settings.logo_position === opt.key && styles.fontChipActive]}
                onPress={() => setSettings((s) => ({ ...s, logo_position: opt.key }))}
              >
                <Text style={[styles.fontChipText, settings.logo_position === opt.key && styles.fontChipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>محاذاة النص العلوي (العنوان وبيانات المستند)</Text>
          <View style={styles.fontRow}>
            {[
              { key: 'right', label: 'يمين' },
              { key: 'center', label: 'وسط' },
              { key: 'left', label: 'يسار' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.fontChip, settings.content_align === opt.key && styles.fontChipActive]}
                onPress={() => setSettings((s) => ({ ...s, content_align: opt.key }))}
              >
                <Text style={[styles.fontChipText, settings.content_align === opt.key && styles.fontChipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>إظهار الحقول</Text>
          <View style={styles.switchRow}>
            <Switch
              value={settings.show_document_number}
              onValueChange={(v) => setSettings((s) => ({ ...s, show_document_number: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>رقم المستند</Text>
          </View>
          <View style={styles.switchRow}>
            <Switch
              value={settings.show_date}
              onValueChange={(v) => setSettings((s) => ({ ...s, show_date: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>التاريخ</Text>
          </View>
          <View style={styles.switchRow}>
            <Switch
              value={settings.show_client_name}
              onValueChange={(v) => setSettings((s) => ({ ...s, show_client_name: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>اسم العميل</Text>
          </View>
          <View style={styles.switchRow}>
            <Switch
              value={settings.show_sub_category}
              onValueChange={(v) => setSettings((s) => ({ ...s, show_sub_category: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>الفئة الفرعية</Text>
          </View>
          <View style={styles.switchRow}>
            <Switch
              value={settings.show_notes}
              onValueChange={(v) => setSettings((s) => ({ ...s, show_notes: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>الملاحظات</Text>
          </View>
          <View style={styles.switchRow}>
            <Switch
              value={settings.show_terms}
              onValueChange={(v) => setSettings((s) => ({ ...s, show_terms: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>الشروط الثابتة (اللي كتبتها فوق)</Text>
          </View>
          <View style={styles.switchRow}>
            <Switch
              value={settings.show_footer}
              onValueChange={(v) => setSettings((s) => ({ ...s, show_footer: v }))}
              trackColor={{ true: C.brand, false: C.border }}
            />
            <Text style={styles.switchLabel}>نص التذييل (اللي كتبته فوق)</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>حفظ التصميم</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface2 },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 16, marginBottom: 14, ...shadow },
  sectionTitle: { fontFamily: F.bold, fontSize: 14, color: C.onSurface, textAlign: 'right', marginBottom: 6 },
  sectionHint: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginBottom: 14 },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginBottom: 8 },
  fontRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  fontChip: { backgroundColor: C.surface2, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.surface2 },
  fontChipActive: { backgroundColor: C.brandSoft, borderColor: C.brand },
  fontChipText: { fontFamily: F.semibold, fontSize: 12.5, color: C.onSurface2 },
  fontChipTextActive: { color: C.brandDark },
  uploadBox: {
    borderWidth: 1.5,
    borderColor: C.border,
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
  colorSwatchDefault: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  bgPreview: { width: '100%', height: 120, borderRadius: R.sm, backgroundColor: C.surface2 },
  opacityChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: R.md,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  opacityChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  opacityChipText: { fontFamily: F.semibold, fontSize: 12, color: C.onSurface },
  opacityChipTextActive: { color: '#FFF' },
  defaultColorText: { fontFamily: F.regular, fontSize: 9, color: C.muted },
  chipsLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginBottom: 6, marginTop: 4 },
  switchRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 14 },
  switchLabel: { fontFamily: F.regular, fontSize: 13, color: C.onSurface },
  saveBtn: { backgroundColor: C.brand, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
});
