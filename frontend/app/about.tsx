import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/ThemeContext';
import { ScreenHeader } from '@/src/ui';
import { F } from '@/src/theme';

export default function AboutScreen() {
  const { C } = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader title="من نحن" canBack />
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.logoWrap}>
          <Image source={require('../assets/images/azvio-logo.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.h}>AZVIO</Text>
        <Text style={styles.p}>
          AZVIO مشروع سعودي متخصص في التصوير الجوي بالدرون والمونتاج الاحترافي، يقدّم خدماته
          للعقار والفعاليات والمشاريع التجارية بجودة سينمائية عالية.
        </Text>
        <Text style={styles.h}>هذا التطبيق</Text>
        <Text style={styles.p}>
          أداة داخلية بناها فريق AZVIO لإدارة العملاء والماليات والمشاريع بمساعدة سند، المساعد
          الذكي المخصص للفريق.
        </Text>
        <Text style={styles.h}>النسخة</Text>
        <Text style={styles.p}>الإصدار 1.0</Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    wrap: { padding: 20, paddingBottom: 40, alignItems: 'center' },
    logoWrap: { marginVertical: 20 },
    logo: { width: 90, height: 90 },
    h: { fontFamily: F.bold, fontSize: 16, color: C.onSurface, textAlign: 'center', marginTop: 16, marginBottom: 8 },
    p: { fontFamily: F.regular, fontSize: 14, color: C.onSurface2, textAlign: 'center', lineHeight: 22 },
  });
