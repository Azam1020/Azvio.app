import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, F, R } from './theme';

type Props = {
  onSave: (pathData: string) => void;
  onCancel?: () => void;
  height?: number;
};

export function SignaturePad({ onSave, onCancel, height = 220 }: Props) {
  const [paths, setPaths] = useState<string[]>([]);
  const currentPath = useRef('');
  const [, forceRender] = useState(0);
  const rafScheduled = useRef(false);
  // نلتقط مقاس لوحة الرسم الفعلي وقت التوقيع (يختلف حسب الجهاز/المتصفح) عشان
  // نقدر نعيد رسم التوقيع بنفس النسب لاحقاً بغض النظر عن حجم الشاشة اللي يُعرض فيها
  // (طلب: التوقيع من رابط العميل ما يطلع شكله صح بالتطبيق).
  const layout = useRef({ w: 0, h: 0 });

  const scheduleRender = () => {
    if (rafScheduled.current) return;
    rafScheduled.current = true;
    requestAnimationFrame(() => {
      rafScheduled.current = false;
      forceRender((n) => n + 1);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)} `;
        scheduleRender();
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current += `L${locationX.toFixed(1)},${locationY.toFixed(1)} `;
        scheduleRender();
      },
      onPanResponderRelease: () => {
        const finished = currentPath.current;
        currentPath.current = '';
        if (finished) setPaths((prev) => [...prev, finished]);
        scheduleRender();
      },
    })
  ).current;

  const clear = () => {
    setPaths([]);
    currentPath.current = '';
    forceRender((n) => n + 1);
  };

  const save = () => {
    const all = [...paths, currentPath.current].filter(Boolean).join(' ');
    if (!all) return;
    // نحفظ المسار مع أبعاد اللوحة وقت الرسم — عشان العرض لاحقاً (بأي مقاس شاشة)
    // يقدر يحسب viewBox صحيح ويعرض التوقيع بنفس نسبته الأصلية بدل ما يطلع مقطوع.
    const payload = JSON.stringify({ d: all, w: Math.round(layout.current.w) || 300, h: Math.round(layout.current.h) || height });
    onSave(payload);
  };

  const hasContent = paths.length > 0 || !!currentPath.current;

  return (
    <View>
      <View
        style={[styles.canvas, { height }]}
        onLayout={(e) => {
          layout.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        }}
        {...panResponder.panHandlers}
      >
        <Svg width="100%" height="100%">
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={C.onSurface} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {!!currentPath.current && (
            <Path d={currentPath.current} stroke={C.onSurface} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </Svg>
        {!hasContent && <Text style={styles.placeholder}>وقّع هنا بإصبعك</Text>}
      </View>
      <View style={styles.row}>
        <TouchableOpacity onPress={clear} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>مسح</Text>
        </TouchableOpacity>
        {!!onCancel && (
          <TouchableOpacity onPress={onCancel} style={styles.secondaryBtn}>
            <Text style={styles.secondaryText}>إلغاء</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={save} style={[styles.primaryBtn, !hasContent && { opacity: 0.4 }]} disabled={!hasContent}>
          <Text style={styles.primaryText}>حفظ التوقيع</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Renders a previously-saved signature (the path-data string from onSave).
 * يدعم الصيغة الجديدة JSON {d, w, h} مع viewBox صحيح، وأيضاً الصيغة القديمة
 * (مسار خام بدون أبعاد) للتوقيعات المحفوظة قبل هذا الإصلاح. */
export function SignatureView({ pathData, height = 100 }: { pathData: string; height?: number }) {
  let d = pathData;
  let viewBox: string | undefined;
  try {
    const parsed = JSON.parse(pathData);
    if (parsed && typeof parsed.d === 'string') {
      d = parsed.d;
      viewBox = `0 0 ${parsed.w || 300} ${parsed.h || height}`;
    }
  } catch {
    // صيغة قديمة (مسار خام) — نعرضه كما هو بدون viewBox، بنفس السلوك السابق
  }

  return (
    <View style={[styles.viewBox, { height }]}>
      <Svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        <Path d={d} stroke={C.onSurface} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: C.surface2,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: { position: 'absolute', fontFamily: F.regular, fontSize: 13, color: C.muted },
  row: { flexDirection: 'row-reverse', gap: 10, marginTop: 12 },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: R.md, backgroundColor: C.surface2 },
  secondaryText: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2 },
  primaryBtn: { flex: 1, paddingVertical: 12, borderRadius: R.md, backgroundColor: C.brand, alignItems: 'center' },
  primaryText: { fontFamily: F.bold, fontSize: 14, color: '#FFF' },
  viewBox: { backgroundColor: C.surface2, borderRadius: R.md },
});
