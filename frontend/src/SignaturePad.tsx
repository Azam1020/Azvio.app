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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)} `;
        forceRender((n) => n + 1);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current += `L${locationX.toFixed(1)},${locationY.toFixed(1)} `;
        forceRender((n) => n + 1);
      },
      onPanResponderRelease: () => {
        setPaths((prev) => [...prev, currentPath.current]);
        currentPath.current = '';
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
    onSave(all);
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

/** Renders a previously-saved signature (the path-data string from onSave). */
export function SignatureView({ pathData, height = 100 }: { pathData: string; height?: number }) {
  return (
    <View style={[styles.viewBox, { height }]}>
      <Svg width="100%" height="100%">
        <Path d={pathData} stroke={C.onSurface} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
