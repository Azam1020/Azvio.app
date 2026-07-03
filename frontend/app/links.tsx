import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

// روابط سريعة ثابتة — رابطان فقط بحسب متطلبات AZVIO
const LINKS = [
  {
    id: 'raed',
    title: 'منصة رائد',
    subtitle: 'لوحة رواد الأعمال',
    url: 'https://raed.gov.sa/',
    icon: 'rocket-outline' as const,
  },
  {
    id: 'azvio',
    title: 'موقع AZVIO',
    subtitle: 'الموقع الرسمي',
    url: 'https://azvio.co/',
    icon: 'globe-outline' as const,
  },
];

export default function LinksScreen() {
  const open = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader title="روابط سريعة" subtitle="روابطك الأساسية" canBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {LINKS.map((l) => (
          <TouchableOpacity key={l.id} style={styles.card} onPress={() => open(l.url)} testID={`link-${l.id}`}>
            <View style={styles.iconWrap}>
              <Ionicons name={l.icon} size={22} color={C.brand} />
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.title}>{l.title}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {l.subtitle}
              </Text>
              <Text style={styles.url} numberOfLines={1}>
                {l.url}
              </Text>
            </View>
            <Ionicons name="open-outline" size={18} color={C.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 16,
    marginBottom: 12,
    ...shadow,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: F.bold, fontSize: 15, color: C.onSurface },
  subtitle: { fontFamily: F.regular, fontSize: 12, color: C.onSurface2, marginTop: 2 },
  url: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
});
