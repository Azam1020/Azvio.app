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
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { F, R } from './theme';
import { useTheme } from './ThemeContext';

/** الشريط القطري المزدوج (تيل + فحمي) — عنصر الهوية البصرية "المعتمدة نهائيًا"
 * المستوحى من تداخل طبقتي شعار AZVIO. يُستخدم أعلى الشاشات الرئيسية (الدخول،
 * الرئيسية، بطاقة العمل بالإعدادات) بدل هوية "زوايا الفوكس" السابقة. */
export function DiagonalBand({
  height = 130,
  children,
  teal,
  charcoal,
  style,
}: {
  height?: number;
  children?: React.ReactNode;
  teal?: string;
  charcoal?: string;
  style?: any;
}) {
  const { C } = useTheme();
  const tealColor = teal || C.brand;
  const charcoalColor = charcoal || C.charcoal;
  const W = 400; // مرجع فقط — الشكل يتمدد لعرض الشاشة الفعلي عبر preserveAspectRatio="none"
  const H = height;
  return (
    <View style={[{ height, overflow: 'hidden' }, style]}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="bandGrad" x1="0" y1="0" x2={W} y2={H * 0.6} gradientUnits="userSpaceOnUse">
            <Stop offset="0.55" stopColor={tealColor} />
            <Stop offset="0.55" stopColor={charcoalColor} />
          </LinearGradient>
        </Defs>
        {/* شكل مقطوع بخط مائل (يطابق clip-path: polygon(0 0,100% 0,100% 80%,0 100%)) */}
        <Path d={`M0,0 L${W},0 L${W},${H * 0.8} L0,${H} Z`} fill="url(#bandGrad)" />
      </Svg>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 20, paddingBottom: 24 }}>{children}</View>
    </View>
  );
}

/** بطاقة موحّدة بهوية "زوايا الفوكس" (مستوحاة من إطار كاميرا الدرون) — التوقيع
 * البصري الرسمي لتطبيق AZVIO. تُستخدم بدل أي View بطاقة عادية بأي شاشة، عشان
 * كل الشاشات تاخذ نفس الهوية بمكان واحد بدل تكرار كود الزوايا يدويًا في كل ملف
 * (طلب: التصميم الجديد يتطبق على جميع الصفحات، ومع دعم الوضع الداكن). */
export function BracketCard({
  children,
  style,
  accent,
  corners = 'both',
}: {
  children: React.ReactNode;
  style?: any;
  accent?: boolean;
  corners?: 'both' | 'tl' | 'none';
}) {
  const { C } = useTheme();
  const bracketStyles = React.useMemo(() => makeBracketStyles(C), [C]);
  return (
    <View style={[bracketStyles.card, accent && { backgroundColor: C.brand }, style]}>
      {corners !== 'none' && (
        <View pointerEvents="none" style={[bracketStyles.bracket, bracketStyles.tl, accent && bracketStyles.bracketOnAccent]} />
      )}
      {corners === 'both' && (
        <View pointerEvents="none" style={[bracketStyles.bracket, bracketStyles.br, accent && bracketStyles.bracketOnAccent]} />
      )}
      {children}
    </View>
  );
}

const makeBracketStyles = (C: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.surface,
      borderRadius: R.lg,
      overflow: 'hidden',
    },
    bracket: { position: 'absolute', width: 12, height: 12, borderColor: C.brand, opacity: 0.35 },
    tl: { top: 6, left: 6, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 4 },
    br: { bottom: 6, right: 6, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: 4 },
    bracketOnAccent: { borderColor: 'rgba(255,255,255,0.55)', opacity: 1 },
  });

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
  const { C } = useTheme();
  const hs = React.useMemo(() => makeHeaderStyles(C), [C]);
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

const makeHeaderStyles = (C: any) =>
  StyleSheet.create({
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
  const { C } = useTheme();
  const fs = React.useMemo(() => makeFieldStyles(C), [C]);
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

const makeFieldStyles = (C: any) =>
  StyleSheet.create({
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
  const { C } = useTheme();
  const cs = React.useMemo(() => makeChipsStyles(C), [C]);
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

const makeChipsStyles = (C: any) =>
  StyleSheet.create({
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
  const { C } = useTheme();
  const ms = React.useMemo(() => makeModalStyles(C), [C]);
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

const makeModalStyles = (C: any) =>
  StyleSheet.create({
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
  const { C } = useTheme();
  const es = React.useMemo(() => makeEmptyStyles(C), [C]);
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

const makeEmptyStyles = (C: any) =>
  StyleSheet.create({
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
