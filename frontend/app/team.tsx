import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api';
import { AppModal, Chips, Empty, Field, ScreenHeader } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

type TeamUser = {
  user_id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  active?: boolean;
};

export default function TeamScreen() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' as 'member' | 'admin' });

  const load = useCallback(async () => {
    try {
      setUsers(await api('/team'));
    } catch {}
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openAdd = () => {
    setForm({ name: '', email: '', password: '', role: 'member' });
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      Alert.alert('بيانات ناقصة', 'الاسم والبريد مطلوبان، وكلمة المرور 8 أحرف على الأقل');
      return;
    }
    setSaving(true);
    try {
      await api('/team', { method: 'POST', body: JSON.stringify(form) });
      setModal(false);
      load();
    } catch (e: any) {
      Alert.alert('تعذّرت الإضافة', e?.message || 'حدث خطأ');
    }
    setSaving(false);
  };

  const toggleActive = async (u: TeamUser) => {
    try {
      await api(`/team/${u.user_id}/${u.active === false ? 'enable' : 'disable'}`, { method: 'PATCH' });
      load();
    } catch (e: any) {
      Alert.alert('تعذّر', e?.message || 'حدث خطأ');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <ScreenHeader
        title="إدارة المستخدمين"
        canBack
        right={
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={22} color={C.brand} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.wrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} />}
      >
        {users.length === 0 ? (
          <Empty icon="people-outline" text="لا يوجد مستخدمون إضافيون بعد" hint="اضغط + لإضافة أول عضو فريق" />
        ) : (
          users.map((u) => (
            <View key={u.user_id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{u.name}</Text>
                <Text style={styles.email}>{u.email}</Text>
                <Text style={styles.role}>{u.role === 'admin' ? 'مدير — صلاحية كاملة' : 'عضو فريق'}</Text>
              </View>
              <Switch
                value={u.active !== false}
                onValueChange={() => toggleActive(u)}
                trackColor={{ true: C.brand, false: C.border }}
              />
            </View>
          ))
        )}
      </ScrollView>

      <AppModal visible={modal} title="إضافة مستخدم" onClose={() => setModal(false)} onSave={save} saving={saving}>
        <Field label="الاسم" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="مثال: محمد أحمد" />
        <Field
          label="البريد الإلكتروني"
          value={form.email}
          onChangeText={(v) => setForm({ ...form, email: v })}
          placeholder="example@azvio.co"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Field
          label="كلمة المرور المبدئية"
          value={form.password}
          onChangeText={(v) => setForm({ ...form, password: v })}
          placeholder="8 أحرف على الأقل"
          secureTextEntry
        />
        <Text style={styles.chipsLabel}>الصلاحية</Text>
        <Chips
          options={[
            { key: 'member', label: 'عضو فريق' },
            { key: 'admin', label: 'مدير' },
          ]}
          value={form.role}
          onChange={(v) => setForm({ ...form, role: v as 'member' | 'admin' })}
        />
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 14,
    marginBottom: 10,
    ...shadow,
  },
  name: { fontFamily: F.bold, fontSize: 15, color: C.onSurface, textAlign: 'right' },
  email: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'right', marginTop: 2 },
  role: { fontFamily: F.semibold, fontSize: 12, color: C.brand, textAlign: 'right', marginTop: 4 },
  chipsLabel: { fontFamily: F.semibold, fontSize: 13, color: C.onSurface2, textAlign: 'right', marginBottom: 6 },
});
