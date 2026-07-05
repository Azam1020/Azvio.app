import React, { useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R, shadow } from './theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Only import native picker when needed
let NativePicker: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NativePicker = require('@react-native-community/datetimepicker').default;
} catch (e) {
  // Keep NativePicker null but surface the reason in dev/native logs so an
  // empty modal is never a silent failure.
  console.warn('[DateTimePicker] Failed to load native datetimepicker module:', e);
}

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function formatDateArabic(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return `${AR_DAYS[d.getDay()]}، ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

export function formatTime12h(hhmm: string): string {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return hhmm || '';
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const suffix = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const parseDate = (s: string) => {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1);
};

const parseTime = (s: string) => {
  const d = new Date();
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) {
    d.setHours(9, 0, 0, 0);
    return d;
  }
  const [h, m] = s.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const toTimeStr = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// ============ DateField ============

export function DateField({
  label,
  value,
  onChange,
  placeholder = 'اختر التاريخ',
  minDate,
  maxDate,
  required,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  required?: boolean;
}) {
  const [modal, setModal] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(parseDate(value));
  const webInputRef = useRef<any>(null);

  const openPicker = () => {
    if (Platform.OS === 'web' && webInputRef.current) {
      try {
        // Modern browsers: use showPicker()
        if (typeof webInputRef.current.showPicker === 'function') {
          webInputRef.current.showPicker();
        } else {
          webInputRef.current.focus();
          webInputRef.current.click();
        }
      } catch {
        webInputRef.current.click();
      }
      return;
    }
    setTempDate(parseDate(value));
    setModal(true);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TouchableOpacity style={styles.trigger} onPress={openPicker} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={18} color={C.brand} />
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]}>
          {value ? formatDateArabic(value) : placeholder}
        </Text>
      </TouchableOpacity>

      {/* Web: native HTML input hidden overlay */}
      {Platform.OS === 'web' && (
        // @ts-expect-error — using native HTML input in RN web
        <input
          ref={webInputRef}
          type="date"
          value={value}
          min={minDate}
          max={maxDate}
          onChange={(e: any) => onChange(e.target.value)}
          style={{
            position: 'absolute',
            opacity: 0,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Native modal picker */}
      {Platform.OS !== 'web' && modal && (
        <Modal transparent animationType="fade" onRequestClose={() => setModal(false)}>
          <Pressable style={styles.backdrop} onPress={() => setModal(false)}>
            <View style={styles.sheet}>
              {NativePicker ? (
                <NativePicker
                  value={tempDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  style={Platform.OS === 'ios' ? styles.nativePickerIOS : undefined}
                  themeVariant="light"
                  textColor="#000000"
                  accentColor={C.brand}
                  onChange={(_: any, d?: Date) => {
                    if (Platform.OS === 'android') {
                      setModal(false);
                      if (d) onChange(toDateStr(d));
                    } else if (d) {
                      setTempDate(d);
                    }
                  }}
                />
              ) : (
                <View style={styles.pickerFallback}>
                  <Text style={styles.pickerFallbackText}>
                    تعذر تحميل أداة اختيار التاريخ. يرجى إعادة تشغيل التطبيق.
                  </Text>
                </View>
              )}
              {Platform.OS === 'ios' && (
                <View style={styles.sheetActions}>
                  <TouchableOpacity onPress={() => setModal(false)} style={styles.sheetCancel}>
                    <Text style={styles.sheetCancelText}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      onChange(toDateStr(tempDate));
                      setModal(false);
                    }}
                    style={styles.sheetOk}
                  >
                    <Text style={styles.sheetOkText}>تأكيد</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

// ============ TimeField ============

export function TimeField({
  label,
  value,
  onChange,
  placeholder = 'اختر الوقت',
  required,
  allowClear,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  allowClear?: boolean;
}) {
  const [modal, setModal] = useState(false);
  const [tempTime, setTempTime] = useState<Date>(parseTime(value));
  const webInputRef = useRef<any>(null);

  const openPicker = () => {
    if (Platform.OS === 'web' && webInputRef.current) {
      try {
        if (typeof webInputRef.current.showPicker === 'function') {
          webInputRef.current.showPicker();
        } else {
          webInputRef.current.focus();
          webInputRef.current.click();
        }
      } catch {
        webInputRef.current.click();
      }
      return;
    }
    setTempTime(parseTime(value));
    setModal(true);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
        <TouchableOpacity style={[styles.trigger, { flex: 1 }]} onPress={openPicker} activeOpacity={0.7}>
          <Ionicons name="time-outline" size={18} color={C.brand} />
          <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]}>
            {value ? formatTime12h(value) : placeholder}
          </Text>
        </TouchableOpacity>
        {allowClear && !!value && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => onChange('')} hitSlop={6}>
            <Ionicons name="close" size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      {Platform.OS === 'web' && (
        // @ts-expect-error — native HTML input on RN web
        <input
          ref={webInputRef}
          type="time"
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          style={{
            position: 'absolute',
            opacity: 0,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />
      )}

      {Platform.OS !== 'web' && modal && (
        <Modal transparent animationType="fade" onRequestClose={() => setModal(false)}>
          <Pressable style={styles.backdrop} onPress={() => setModal(false)}>
            <View style={styles.sheet}>
              {NativePicker ? (
                <NativePicker
                  value={tempTime}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  style={Platform.OS === 'ios' ? styles.nativeTimePickerIOS : undefined}
                  themeVariant="light"
                  textColor="#000000"
                  accentColor={C.brand}
                  onChange={(_: any, d?: Date) => {
                    if (Platform.OS === 'android') {
                      setModal(false);
                      if (d) onChange(toTimeStr(d));
                    } else if (d) {
                      setTempTime(d);
                    }
                  }}
                />
              ) : (
                <View style={styles.pickerFallback}>
                  <Text style={styles.pickerFallbackText}>
                    تعذر تحميل أداة اختيار التاريخ. يرجى إعادة تشغيل التطبيق.
                  </Text>
                </View>
              )}
              {Platform.OS === 'ios' && (
                <View style={styles.sheetActions}>
                  <TouchableOpacity onPress={() => setModal(false)} style={styles.sheetCancel}>
                    <Text style={styles.sheetCancelText}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      onChange(toTimeStr(tempTime));
                      setModal(false);
                    }}
                    style={styles.sheetOk}
                  >
                    <Text style={styles.sheetOkText}>تأكيد</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

// ============ SelectField — dropdown with search/free-text option ============

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'اختر أو اكتب',
  allowCustom = true,
  required,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  allowCustom?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Ionicons name="chevron-down" size={16} color={C.muted} />
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>

      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={[styles.sheet, { padding: 16, maxHeight: '70%' }]} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{label}</Text>
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.optionRow, value === opt && styles.optionActive]}
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  {value === opt && <Ionicons name="checkmark" size={16} color={C.brand} />}
                  <Text style={[styles.optionText, value === opt && { color: C.brand, fontFamily: F.bold }]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
              {allowCustom && (
                <View style={styles.customRow}>
                  <TextInput
                    style={styles.customInput}
                    placeholder="أو اكتب قيمة جديدة..."
                    placeholderTextColor={C.muted}
                    value={custom}
                    onChangeText={setCustom}
                  />
                  <TouchableOpacity
                    style={styles.customBtn}
                    onPress={() => {
                      if (custom.trim()) {
                        onChange(custom.trim());
                        setCustom('');
                        setOpen(false);
                      }
                    }}
                  >
                    <Ionicons name="add" size={18} color="#FFF" />
                  </TouchableOpacity>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  nativePickerIOS: { height: 380, width: SCREEN_WIDTH - 32 },
  nativeTimePickerIOS: { height: 200, width: SCREEN_WIDTH - 32 },
  pickerFallback: { paddingVertical: 32, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  pickerFallbackText: { fontFamily: F.regular, fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 22 },
  wrap: { marginBottom: 14 },
  label: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
  trigger: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  triggerText: { flex: 1, fontFamily: F.regular, fontSize: 14, color: C.onSurface, textAlign: 'right' },
  triggerPlaceholder: { color: C.muted },
  clearBtn: {
    width: 44,
    height: 44,
    borderRadius: R.md,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    ...shadow,
  },
  sheetActions: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  sheetCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  sheetCancelText: { fontFamily: F.semibold, fontSize: 14, color: C.muted },
  sheetOk: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: C.brand, borderRadius: R.md },
  sheetOkText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
  sheetTitle: { fontFamily: F.bold, fontSize: 16, color: C.onSurface, textAlign: 'right', marginBottom: 12 },
  optionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  optionActive: { backgroundColor: C.brandSoft, borderRadius: R.sm },
  optionText: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface },
  customRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 12 },
  customInput: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    minHeight: 44,
    fontFamily: F.regular,
    fontSize: 14,
    color: C.onSurface,
    textAlign: 'right',
  },
  customBtn: {
    width: 44,
    height: 44,
    borderRadius: R.md,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
