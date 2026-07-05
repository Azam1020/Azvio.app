import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/ThemeContext';
import { ScreenHeader } from '@/src/ui';
import { F } from '@/src/theme';

export default function TermsScreen() {
  const { C } = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader title="شروط الاستخدام" canBack />
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.updated}>آخر تحديث: يوليو 2026</Text>

        <Text style={styles.h}>عن التطبيق</Text>
        <Text style={styles.p}>
          AZVIO تطبيق داخلي خاص بفريق AZVIO لإدارة أعمال التصوير الجوي بالدرون والمونتاج. الوصول
          مقيّد لحسابات ينشئها مدير التطبيق فقط.
        </Text>

        <Text style={styles.h}>مسؤوليتك</Text>
        <Text style={styles.p}>• تحافظ على سرية بيانات دخولك ورمزك السريع، وتخبر المدير فورًا لو شكّيت بأي اختراق.</Text>
        <Text style={styles.p}>• البيانات التي تُدخلها (عملاء، فواتير، مبالغ) على مسؤوليتك، وتلتزم بدقتها.</Text>

        <Text style={styles.h}>مساعد سند</Text>
        <Text style={styles.p}>
          سند مساعد ذكاء اصطناعي، وردوده قد تحتوي أخطاء. راجع أي رقم مالي أو معلومة حساسة قبل
          الاعتماد عليها في قرار مهم.
        </Text>

        <Text style={styles.h}>التوقف عن الاستخدام</Text>
        <Text style={styles.p}>
          يحق لمدير التطبيق تعطيل أو حذف أي حساب في أي وقت، خصوصًا عند مخالفة هذي الشروط أو
          انتهاء العلاقة العملية بين الطرفين.
        </Text>

        <Text style={styles.h}>التواصل</Text>
        <Text style={styles.p}>لأي استفسار حول هذي الشروط، تواصل معنا عبر azzam@azvio.co</Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    wrap: { padding: 20, paddingBottom: 40 },
    updated: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginBottom: 16 },
    h: { fontFamily: F.bold, fontSize: 15, color: C.onSurface, textAlign: 'right', marginTop: 18, marginBottom: 8 },
    p: { fontFamily: F.regular, fontSize: 14, color: C.onSurface2, textAlign: 'right', lineHeight: 22, marginBottom: 4 },
  });
