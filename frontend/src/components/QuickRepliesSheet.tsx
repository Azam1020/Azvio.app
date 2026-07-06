import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/src/api';
import { C, F, R, shadow } from '@/src/theme';

interface ReplyTemplate {
  id?: string;
  title: string;
  template: string;
  category?: string;
  usage_count?: number;
}

interface QuickRepliesSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectReply: (text: string) => void;
}

export function QuickRepliesSheet({ visible, onClose, onSelectReply }: QuickRepliesSheetProps) {
  const insets = useSafeAreaInsets();
  const [defaultTemplates, setDefaultTemplates] = useState<Record<string, ReplyTemplate>>({});
  const [savedReplies, setSavedReplies] = useState<ReplyTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newReply, setNewReply] = useState({ title: '', template: '' });
  const [saving, setSaving] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/communication/templates');
      setDefaultTemplates(data.default || {});
      setSavedReplies(data.saved || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      loadTemplates();
    }
  }, [visible, loadTemplates]);

  const handleSelectReply = async (text: string, templateId?: string) => {
    // تحديث counter
    if (templateId) {
      try {
        await api('/communication/templates/use', {
          method: 'POST',
          body: JSON.stringify({ template_id: templateId }),
        });
      } catch {}
    }
    onSelectReply(text);
    onClose();
  };

  const handleSaveReply = async () => {
    if (!newReply.title.trim() || !newReply.template.trim()) {
      Alert.alert('خطأ', 'يرجى ملء جميع الحقول');
      return;
    }

    setSaving(true);
    try {
      const result = await api('/communication/templates/save', {
        method: 'POST',
        body: JSON.stringify({
          title: newReply.title,
          template: newReply.template,
          category: 'custom',
        }),
      });

      if (result.success) {
        Alert.alert('نجح', 'تم حفظ الرد بنجاح ✅');
        setNewReply({ title: '', template: '' });
        setShowAddModal(false);
        await loadTemplates();
      }
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل حفظ الرد');
    }
    setSaving(false);
  };

  const handleDeleteReply = async (templateId: string) => {
    Alert.alert('حذف', 'هل أنت متأكد من حذف هذا الرد؟', [
      { text: 'إلغاء', onPress: () => {} },
      {
        text: 'حذف',
        onPress: async () => {
          try {
            await api(`/communication/templates/${templateId}`, { method: 'DELETE' });
            setSavedReplies(savedReplies.filter((r) => r.id !== templateId));
          } catch {}
        },
      },
    ]);
  };

  const renderTemplate = (template: ReplyTemplate, isDefault: boolean) => (
    <TouchableOpacity
      key={template.id || template.title}
      style={styles.templateCard}
      onPress={() => handleSelectReply(template.template, template.id)}
    >
      <View style={styles.templateHeader}>
        <View style={styles.templateTitleRow}>
          <Ionicons name="chatbubble-outline" size={16} color={C.brand} />
          <Text style={styles.templateTitle}>{template.title}</Text>
        </View>
        {template.usage_count ? (
          <Text style={styles.usageCount}>استُخدمت {template.usage_count} مرات</Text>
        ) : null}
      </View>

      <Text style={styles.templateText} numberOfLines={2}>
        {template.template}
      </Text>

      <View style={styles.templateActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleSelectReply(template.template, template.id)}
        >
          <Ionicons name="arrow-redo" size={14} color={C.brand} />
          <Text style={styles.actionText}>استخدم</Text>
        </TouchableOpacity>

        {!isDefault && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDeleteReply(template.id!)}
          >
            <Ionicons name="trash-outline" size={14} color={C.error} />
            <Text style={[styles.actionText, { color: C.error }]}>احذف</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-down" size={28} color={C.onSurface} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>الردود الجاهزة</Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            hitSlop={8}
          >
            <Ionicons name="add-circle-outline" size={24} color={C.brand} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={C.brand} style={styles.loader} />
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
            {/* Default Templates */}
            {Object.values(defaultTemplates).length > 0 && (
              <>
                <Text style={styles.sectionTitle}>الردود الافتراضية</Text>
                {Object.values(defaultTemplates).map((t) => renderTemplate(t, true))}
              </>
            )}

            {/* Saved Templates */}
            {savedReplies.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 20 }]}>ردودي المخزّنة</Text>
                {savedReplies.map((t) => renderTemplate(t, false))}
              </>
            )}

            {Object.values(defaultTemplates).length === 0 && savedReplies.length === 0 && (
              <Text style={styles.emptyText}>لا توجد ردود حالياً</Text>
            )}
          </ScrollView>
        )}

        {/* Add Reply Modal */}
        <Modal visible={showAddModal} animationType="slide" transparent={false}>
          <View style={[styles.modal, { paddingTop: insets.top }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowAddModal(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={C.onSurface} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>رد جديد</Text>
              <TouchableOpacity
                onPress={handleSaveReply}
                disabled={saving}
                hitSlop={8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={C.brand} />
                ) : (
                  <Ionicons name="checkmark" size={24} color={C.brand} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="عنوان الرد (مثال: استفسار الأسعار)"
                placeholderTextColor={C.muted}
                value={newReply.title}
                onChangeText={(text) => setNewReply({ ...newReply, title: text })}
                editable={!saving}
              />

              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="نص الرد..."
                placeholderTextColor={C.muted}
                value={newReply.template}
                onChangeText={(text) => setNewReply({ ...newReply, template: text })}
                multiline
                textAlignVertical="top"
                editable={!saving}
              />
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surface2,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  headerTitle: {
    fontFamily: 'F.bold',
    fontSize: 18,
    color: C.onSurface,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
  },
  sectionTitle: {
    fontFamily: 'F.bold',
    fontSize: 14,
    color: C.onSurface,
    marginBottom: 12,
  },
  templateCard: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 14,
    marginBottom: 12,
    ...shadow,
  },
  templateHeader: {
    marginBottom: 10,
  },
  templateTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  templateTitle: {
    fontFamily: 'F.bold',
    fontSize: 13,
    color: C.onSurface,
  },
  usageCount: {
    fontFamily: 'F.regular',
    fontSize: 11,
    color: C.muted,
  },
  templateText: {
    fontFamily: 'F.regular',
    fontSize: 12,
    color: C.muted,
    textAlign: 'right',
    lineHeight: 18,
    marginBottom: 10,
  },
  templateActions: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.brandSoft,
    borderRadius: R.sm,
  },
  deleteBtn: {
    backgroundColor: C.errorSoft,
  },
  actionText: {
    fontFamily: 'F.semibold',
    fontSize: 11,
    color: C.brand,
  },
  emptyText: {
    fontFamily: 'F.regular',
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    marginTop: 40,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  modal: {
    flex: 1,
    backgroundColor: C.surface2,
  },
  modalHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  modalTitle: {
    fontFamily: 'F.bold',
    fontSize: 16,
    color: C.onSurface,
  },
  form: {
    padding: 16,
    gap: 14,
  },
  input: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'F.regular',
    fontSize: 14,
    color: C.onSurface,
    textAlign: 'right',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 12,
  },
});
