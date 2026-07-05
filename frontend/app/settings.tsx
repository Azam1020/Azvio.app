import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { useAuth } from '@/src/AuthContext';
import { AppModal, Field, ScreenHeader } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';
import { clearPin, hasPin, setPin as savePin } from '@/src/pin';

export default function SettingsScreen() {
  const { user } = useAuth();
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    hasPin().then(setPinEnabled);
  }, []);

  const openPinSetup = () => {
    setPinValue('');
    setPinConfirm('');
    setPinModal(true);
  };

  const savePinCode = async () => {
    if (!/^\d{5}$/.test(pinValue)) {
      Alert.alert('رمز غير صالح', 'الرمز يجب أن يكون 5 أرقام');
      return;
    }
    if (pinValue !== pinConfirm) {
      Alert.alert('لا يتطابق', 'الرمز وتأكيده غير متطابقين');
      return;
    }
    await savePin(pinValue);
    setPinEnabled(true);
    setPinModal(false);
  };

  const disablePin = () => {
    Alert.alert('إيقاف قفل الرمز', 'هل تريد إيقاف تسجيل الدخول بالرمز السريع؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'إيقاف',
        style: 'destructive',
        onPress: async () => {
          await clearPin();
          setPinEnabled(false);
        },
      },
    ]);
  };

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

        <Text style={styles.sectionTitle}>قفل سريع برمز</Text>
        <View style={styles.card}>
          <View style={styles.pinRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pinLabel}>فتح التطبيق برمز من 5 أرقام</Text>
              <Text style={styles.pinHint}>بدل كتابة البريد وكلمة المرور كل مرة</Text>
            </View>
            <Switch
              value={pinEnabled}
              onValueChange={(v) => (v ? openPinSetup() : disablePin())}
              trackColor={{ true: C.brand, false: C.border }}
            />
          </View>
          {pinEnabled && (
            <TouchableOpacity onPress={openPinSetup} style={{ marginTop: 12 }}>
              <Text style={styles.changePin}>تغيير الرمز</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <AppModal visible={pinModal} title="تعيين رمز سريع" onClose={() => setPinModal(false)} onSave={savePinCode}>
        <Field
          label="الرمز (5 أرقام)"
          value={pinValue}
          onChangeText={(v) => setPinValue(v.replace(/\D/g, '').slice(0, 5))}
          keyboardType="number-pad"
          secureTextEntry
          placeholder="12345"
        />
        <Field
          label="تأكيد الرمز"
          value={pinConfirm}
          onChangeText={(v) => setPinConfirm(v.replace(/\D/g, '').slice(0, 5))}
          keyboardType="number-pad"
          secureTextEntry
          placeholder="12345"
        />
      </AppModal>
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
  pinRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  pinLabel: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface, textAlign: 'right' },
  pinHint: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginTop: 2 },
  changePin: { fontFamily: F.semibold, fontSize: 13, color: C.brand, textAlign: 'right' },
});
