import React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R } from './theme';

// ---------- Screen header (back + title + optional right action) ----------
export function ScreenHeader({
  title,
  subtitle,
  canBack,
  right,
}: {
  title: string;
  subtitle?: string;
  canBack?: boolean;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[hs.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={hs.row}>
        <View style={hs.side}>{right}</View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={hs.title}>{title}</Text>
          {!!subtitle && <Text style={hs.subtitle}>{subtitle}</Text>}
        </View>
        <View style={hs.side}>
          {canBack && (
            <TouchableOpacity style={hs.backBtn} onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-forward" size={22} color={C.onSurface} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const hs = StyleSheet.create({
  wrap: { backgroundColor: C.surface, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  row: { flexDirection: 'row-reverse', alignItems: 'center' },
  side: { width: 44, alignItems: 'center' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.bold, fontSize: 18, color: C.onSurface },
  subtitle: { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: -2 },
});

// ---------- Form field ----------
export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={fs.label}>{label}</Text>
      <TextInput
        placeholderTextColor={C.muted}
        {...props}
        style={[fs.input, props.multiline && { height: 80, textAlignVertical: 'top' }, props.style]}
      />
    </View>
  );
}

const fs = StyleSheet.create({
  label: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, marginBottom: 6, textAlign: 'right' },
  input: {
    backgroundColor: C.surface2,
    borderRadius: R.md,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    fontFamily: F.regular,
    fontSize: 15,
    color: C.onSurface,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: 'transparent',
  },
});

// ---------- Chips selector ----------
export function Chips({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string; color?: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={cs.row}>
      {options.map((o) => {
        const active = value === o.key;
        const color = o.color || C.brand;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[cs.chip, active && { backgroundColor: color, borderColor: color }]}
          >
            <Text style={[cs.chipText, active && { color: '#FFF' }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const cs = StyleSheet.create({
  row: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: R.pill,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipText: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2 },
});

// ---------- Bottom-sheet style modal ----------
export function AppModal({
  visible,
  title,
  onClose,
  onSave,
  saveLabel = 'حفظ',
  saving,
  children,
  scrollEnabled = true,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saving?: boolean;
  children: React.ReactNode;
  scrollEnabled?: boolean; // عطّلها للمحتوى اللي فيه إيماءة سحب خاصة به (زي لوحة التوقيع) عشان لا يتنافس مع تمرير المودال
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={ms.backdrop}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={ms.handle} />
          <View style={ms.headRow}>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
            <Text style={ms.title}>{title}</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }} scrollEnabled={scrollEnabled}>
            {children}
          </ScrollView>
          {onSave && (
            <TouchableOpacity style={ms.saveBtn} onPress={onSave} disabled={saving} testID="modal-save-btn">
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={ms.saveText}>{saveLabel}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.surface3, alignSelf: 'center', marginBottom: 10 },
  headRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontFamily: F.bold, fontSize: 17, color: C.onSurface },
  saveBtn: {
    backgroundColor: C.brand,
    borderRadius: R.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  saveText: { fontFamily: F.bold, fontSize: 16, color: '#FFF' },
});

// ---------- Empty state ----------
export function Empty({ icon, text, hint }: { icon: any; text: string; hint?: string }) {
  return (
    <View style={es.wrap}>
      <View style={es.iconCircle}>
        <Ionicons name={icon} size={34} color={C.brand} />
      </View>
      <Text style={es.text}>{text}</Text>
      {!!hint && <Text style={es.hint}>{hint}</Text>}
    </View>
  );
}

const es = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  text: { fontFamily: F.semibold, fontSize: 16, color: C.onSurface, textAlign: 'center' },
  hint: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 6 },
});

// ---------- Cross-platform confirm ----------
export function confirmAsync(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
      { text: 'تأكيد', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
