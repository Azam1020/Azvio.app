import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { useAuth } from '@/src/AuthContext';
import { Field, ScreenHeader } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

export default function SettingsScreen() {
  const { user } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (newPassword.length < 8) {
      Alert.alert('كلمة المرور قصيرة', 'يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('لا تتطابق', 'كلمة المرور الجديدة وتأكيدها غير متطابقين');
      return;
    }
    setSaving(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('تم', 'تم تغيير كلمة المرور بنجاح');
    } catch (e: any) {
      Alert.alert('تعذّر التغيير', e?.message || 'كلمة المرور الحالية غير صحيحة');
    }
    setSaving(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader title="الإعدادات" canBack />
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={22} color={C.brand} />
            </View>
            <View>
              <Text style={styles.name}>{user?.name}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              <Text style={styles.role}>{user?.role === 'admin' ? 'مدير' : 'عضو فريق'}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>تغيير كلمة المرور</Text>
        <View style={styles.card}>
          <Field
            label="كلمة المرور الحالية"
            secureTextEntry
            value={oldPassword}
            onChangeText={setOldPassword}
            placeholder="••••••••"
          />
          <Field
            label="كلمة المرور الجديدة"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="8 أحرف على الأقل"
          />
          <Field
            label="تأكيد كلمة المرور الجديدة"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="أعد كتابتها"
          />
          <TouchableOpacity style={styles.btn} onPress={submit} disabled={saving}>
            <Text style={styles.btnText}>{saving ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 16, marginBottom: 16, ...shadow },
  profileRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: F.bold, fontSize: 16, color: C.onSurface, textAlign: 'right' },
  email: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'right', marginTop: 2 },
  role: { fontFamily: F.semibold, fontSize: 12, color: C.brand, textAlign: 'right', marginTop: 4 },
  sectionTitle: { fontFamily: F.bold, fontSize: 14, color: C.onSurface, textAlign: 'right', marginBottom: 8 },
  btn: { backgroundColor: C.brand, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnText: { fontFamily: F.bold, fontSize: 15, color: '#FFF' },
});
