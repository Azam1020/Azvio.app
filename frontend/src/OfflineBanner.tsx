import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';
import { F, R } from './theme';

export function OfflineBanner({ visible }: { visible: boolean }) {
  const { C } = useTheme();
  if (!visible) return null;
  const styles = makeStyles(C);
  return (
    <View style={styles.wrap}>
      <Ionicons name="cloud-offline-outline" size={16} color={C.warning} />
      <Text style={styles.text}>لا يوجد اتصال بالإنترنت — تُعرض آخر بيانات محفوظة</Text>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.brandSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: R.md,
      marginHorizontal: 16,
      marginTop: 12,
    },
    text: { fontFamily: F.semibold, fontSize: 12, color: C.onSurface2, flexShrink: 1, textAlign: 'right' },
  });
