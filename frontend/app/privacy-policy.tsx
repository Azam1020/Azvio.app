import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/ThemeContext';
import { ScreenHeader } from '@/src/ui';
import { F } from '@/src/theme';

export default function PrivacyPolicyScreen() {
  const { C } = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader title="سياسة الخصوصية" canBack />
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.updated}>آخر تحديث: يوليو 2026</Text>

        <Text style={styles.h}>مقدمة</Text>
        <Text style={styles.p}>
          تطبيق AZVIO تطبيق داخلي لإدارة أعمال التصوير الجوي والمونتاج، مخصص لاستخدام فريق AZVIO
          فقط. هذي السياسة توضح كيف نجمع بياناتك ونستخدمها ونحميها.
        </Text>

        <Text style={styles.h}>البيانات التي نجمعها</Text>
        <Text style={styles.p}>• بيانات حسابك: الاسم والبريد الإلكتروني وصورة الحساب (عند تسجيل الدخول بجوجل).</Text>
        <Text style={styles.p}>• بيانات العمل: العملاء والفواتير والمعاملات المالية ومواعيد التقويم التي تُدخلها بنفسك.</Text>
        <Text style={styles.p}>• الملفات المرفوعة: الصور والمستندات التي تحمّلها لتحليلها أو حفظها.</Text>
        <Text style={styles.p}>• رمز الإشعارات على جهازك، لإرسال التذكيرات اليومية إن فعّلتها.</Text>

        <Text style={styles.h}>كيف نستخدم بياناتك</Text>
        <Text style={styles.p}>
          نستخدم بياناتك فقط لتشغيل ميزات التطبيق: عرض بياناتك، مساعدك الذكي سند، والإشعارات
          التي تفعّلها بنفسك. لا نبيع بياناتك ولا نشاركها مع أي طرف ثالث لأغراض تسويقية.
        </Text>

        <Text style={styles.h}>مكان تخزين البيانات</Text>
        <Text style={styles.p}>
          تُخزَّن بياناتك في قواعد بيانات وخدمات تخزين سحابية مؤمّنة (MongoDB Atlas و Supabase)،
          ويُعالج نص محادثاتك مع سند عبر مزوّدي ذكاء اصطناعي (Anthropic و Google) لغرض توليد الردود
          فقط.
        </Text>

        <Text style={styles.h}>أمان بياناتك</Text>
        <Text style={styles.p}>
          كلمات المرور مشفّرة ولا نخزّنها كنص صريح. تسجيل الدخول يتم عبر رمز جلسة آمن، ويمكنك
          تفعيل رمز دخول سريع أو بصمة الوجه/الإصبع لحماية إضافية على جهازك.
        </Text>

        <Text style={styles.h}>حقوقك</Text>
        <Text style={styles.p}>
          يمكنك طلب حذف بياناتك أو حسابك في أي وقت بالتواصل مع مدير التطبيق. المدير يملك صلاحية
          إضافة أو تعطيل أو حذف حسابات المستخدمين.
        </Text>

        <Text style={styles.h}>التواصل</Text>
        <Text style={styles.p}>لأي استفسار حول هذي السياسة، تواصل معنا عبر azzam@azvio.co</Text>
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
