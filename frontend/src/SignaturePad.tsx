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

  // بدل ما نعيد الرسم مع كل نقطة لمس (يحدث عشرات المرات بالثانية ويسبب تقطّع الخط
  // على الأجهزة الأبطأ)، نجمّع كل التحديثات السريعة ونعيد الرسم مرة وحدة بالفريم فقط.
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

    // نستخرج كل نقاط X,Y من مسار الرسم نفسه ونحسب صندوقها الحقيقي (bounding box) —
    // هذا مضمون 100٪ لأنه من نفس بيانات الرسم، بعكس قياس الشاشة (onLayout) اللي ممكن
    // يرجّع صفر أو رقم غلط جوه ScrollView/Modal (طلب: إصلاح التوقيع الفاضي من البوابة).
    const nums = all.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = nums[i], y = nums[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 300; maxY = height; }

    const pad = 8; // هامش بسيط حول التوقيع عشان حواف الخط ما تنقص
    const vb = `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + pad * 2).toFixed(1)} ${(maxY - minY + pad * 2).toFixed(1)}`;

    onSave(JSON.stringify({ d: all, viewBox: vb }));
  };

  const hasContent = paths.length > 0 || !!currentPath.current;

  return (
    <View>
      <View style={[styles.canvas, { height }]} {...panResponder.panHandlers}>
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
 * يدعم الصيغة الجديدة JSON {d, viewBox} — viewBox محسوب من حدود الرسم الفعلية
 * وقت التوقيع، فيعرض التوقيع كامل ومتناسب بأي مقاس صندوق عرض. وأيضاً يدعم الصيغة
 * القديمة (مسار خام بدون viewBox) للتوقيعات المحفوظة قبل هذا الإصلاح. */
export function SignatureView({ pathData, height = 100 }: { pathData: string; height?: number }) {
  let d = pathData;
  let viewBox: string | undefined;
  try {
    const parsed = JSON.parse(pathData);
    if (parsed && typeof parsed.d === 'string') {
      d = parsed.d;
      viewBox = parsed.viewBox || undefined;
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
