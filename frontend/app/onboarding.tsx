import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { markOnboardingSeen } from '@/src/onboarding';
import { useTheme } from '@/src/ThemeContext';
import { F, R } from '@/src/theme';

const SLIDES = [
  {
    icon: 'airplane' as const,
    title: 'إدارة أعمالك في مكان واحد',
    body: 'عملاء، فواتير، ماليات، ومواعيد تصوير — كل شي منظم داخل AZVIO.',
  },
  {
    icon: 'sparkles' as const,
    title: 'سند معك خطوة بخطوة',
    body: 'مساعدك الذكي يضيف العملاء، يحلل الفواتير، ويجاوب على أسئلتك في أي وقت.',
  },
  {
    icon: 'trending-up' as const,
    title: 'تابع نمو مشروعك',
    body: 'تقارير ومؤشرات مالية واضحة تساعدك تاخذ قرارك بثقة.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { C } = useTheme();
  const styles = makeStyles(C);
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const isLast = step === SLIDES.length - 1;

  const finish = async () => {
    await markOnboardingSeen();
    router.replace('/login');
  };

  const slide = SLIDES[step];

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <TouchableOpacity style={styles.skip} onPress={finish}>
        <Text style={styles.skipText}>تخطي</Text>
      </TouchableOpacity>

      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <Ionicons name={slide.icon} size={56} color={C.brand} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </View>

      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity
        style={styles.nextBtn}
        onPress={() => (isLast ? finish() : setStep((s) => s + 1))}
      >
        <Text style={styles.nextText}>{isLast ? 'ابدأ الآن' : 'التالي'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: C.surface, paddingHorizontal: 24 },
    skip: { alignSelf: 'flex-start' },
    skipText: { fontFamily: F.semibold, fontSize: 14, color: C.muted },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    iconCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: C.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    },
    title: { fontFamily: F.bold, fontSize: 22, color: C.onSurface, textAlign: 'center', marginBottom: 12 },
    body: { fontFamily: F.regular, fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 24, paddingHorizontal: 12 },
    dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
    dotActive: { backgroundColor: C.brand, width: 22 },
    nextBtn: { backgroundColor: C.brand, borderRadius: R.md, paddingVertical: 16, alignItems: 'center' },
    nextText: { fontFamily: F.bold, fontSize: 16, color: '#FFF' },
  });
