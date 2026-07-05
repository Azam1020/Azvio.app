import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { api, apiUpload } from '@/src/api';
import { confirmAsync } from '@/src/ui';
import { C, F, R, shadow } from '@/src/theme';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'كم دخلي هذا الشهر؟',
  'سجل مصروف 200 ريال بنزين',
  'أضف عميل جديد',
  'أعطني نصيحة تسعير للدرون',
];

export default function SanadScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const history = await api('/sanad/history');
      setMessages(history.map((m: any) => ({ id: m.id, role: m.role, content: m.content })));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const scrollDown = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if ((!message && attachments.length === 0) || sending) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setInput('');
    const userContent =
      attachments.length > 0
        ? `📎 ${attachments.map((a) => a.name).join('، ')}\n${message}`
        : message;
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: userContent }]);
    setSending(true);
    scrollDown();
    try {
      let data;
      if (attachments.length > 0) {
        const fd = new FormData();
        attachments.forEach((att) => {
          if (Platform.OS === 'web' && att.file) {
            fd.append('files', att.file, att.name);
          } else {
            fd.append('files', {
              uri: att.uri,
              name: att.name || 'file',
              type: att.mimeType || 'application/octet-stream',
            } as any);
          }
        });
        fd.append('message', message);
        fd.append('session_id', 'default');
        setAttachments([]);
        data = await apiUpload('/sanad/chat-with-file', fd);
      } else {
        data = await api('/sanad/chat', {
          method: 'POST',
          body: JSON.stringify({ message, session_id: 'default',}),
        });
      }
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: data.reply }]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'assistant', content: `⚠️ ${e.message || 'تعذر معالجة الطلب، حاول مجدداً'}` },
      ]);
    }
    setSending(false);
    scrollDown();
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'image/*',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (res.canceled || !res.assets?.length) return;
    setAttachments((prev) => [...prev, ...res.assets]);
  };

  const clearChat = async () => {
    if (await confirmAsync('مسح المحادثة', 'هل تريد مسح كل سجل المحادثة مع سند؟')) {
      await api('/sanad/history', { method: 'DELETE' });
      setMessages([]);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.surface2 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={20} color="#FFF" />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.headerTitle}>سند</Text>
            <Text style={styles.headerSub}>مساعدك الذكي في AZVIO</Text>
          </View>
          <TouchableOpacity onPress={clearChat} hitSlop={8} testID="clear-chat-btn">
            <Ionicons name="trash-outline" size={20} color={C.muted} />
          </TouchableOpacity>
        </View>
        <View style={styles.aiBadge}>
          <Ionicons name="sparkles" size={12} color={C.brand} />
          <Text style={styles.aiBadgeText}>مدعوم بـ Claude Sonnet 4.5 + Gemini 2.5</Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={styles.welcome}>
            <View style={styles.welcomeIcon}>
              <Ionicons name="sparkles" size={30} color={C.brand} />
            </View>
            <Text style={styles.welcomeTitle}>مرحباً! أنا سند 👋</Text>
            <Text style={styles.welcomeText}>
              أقدر أساعدك في إضافة عملاء ومصاريف، قراءة فواتير PDF، تحليل ملفات Excel، والإجابة عن أسئلة عملك.
            </Text>
          </View>
        )}
        {messages.map((m) => (
          <View
            key={m.id}
            style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.aiBubble]}
          >
            <Text style={[styles.bubbleText, m.role === 'user' && { color: '#FFF' }]}>{m.content}</Text>
          </View>
        ))}
        {sending && (
          <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
            <ActivityIndicator size="small" color={C.brand} />
            <Text style={styles.typingText}>سند يفكر...</Text>
          </View>
        )}
      </ScrollView>

      {/* Suggestions */}
      {messages.length === 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={{ maxHeight: 46, flexGrow: 0 }}
        >
          {SUGGESTIONS.map((s) => (
            <TouchableOpacity key={s} style={styles.suggestChip} onPress={() => send(s)}>
              <Text style={styles.suggestText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <View style={styles.attachRow}>
          {attachments.map((att, i) => (
            <View key={`${att.name}-${i}`} style={styles.attachPill}>
              <TouchableOpacity
                onPress={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                hitSlop={6}
              >
                <Ionicons name="close-circle" size={18} color={C.muted} />
              </TouchableOpacity>
              <Text style={styles.attachName} numberOfLines={1}>
                📎 {att.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={styles.attachBtn} onPress={pickFile} testID="attach-btn">
          <Ionicons name="attach" size={22} color={C.brand} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="اكتب رسالتك لسند..."
          placeholderTextColor={C.muted}
          value={input}
          onChangeText={setInput}
          multiline
          testID="sanad-input"
        />
        <TouchableOpacity
          style={[styles.sendBtn, !(input.trim() || attachments.length > 0) && { opacity: 0.4 }]}
          onPress={() => send()}
          disabled={sending || !(input.trim() || attachments.length > 0)}
          testID="send-btn"
        >
          <Ionicons name="send" size={18} color="#FFF" style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: F.bold, fontSize: 17, color: C.onSurface },
  headerSub: { fontFamily: F.regular, fontSize: 11, color: C.muted },
  modelRow: { flexDirection: 'row-reverse', gap: 6, marginTop: 10, alignItems: 'center' },
  aiBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    alignSelf: 'flex-end',
    backgroundColor: C.brandSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
  },
  aiBadgeText: { fontFamily: F.semibold, fontSize: 10, color: C.brand },
  welcome: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 20 },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  welcomeTitle: { fontFamily: F.bold, fontSize: 18, color: C.onSurface },
  welcomeText: { fontFamily: F.regular, fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 22 },
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  userBubble: { alignSelf: 'flex-start', backgroundColor: C.brand, borderBottomLeftRadius: 4 },
  aiBubble: { alignSelf: 'flex-end', backgroundColor: C.surface, borderBottomRightRadius: 4, ...shadow },
  bubbleText: { fontFamily: F.regular, fontSize: 14, color: C.onSurface, textAlign: 'right', lineHeight: 23 },
  typingBubble: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  typingText: { fontFamily: F.regular, fontSize: 13, color: C.muted },
  chipsRow: { paddingHorizontal: 12, gap: 8, alignItems: 'center', flexDirection: 'row-reverse' },
  suggestChip: {
    backgroundColor: C.surface,
    borderRadius: R.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  suggestText: { fontFamily: F.semibold, fontSize: 12, color: C.brand },
  attachRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
  },
  attachPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 220,
  },
  attachName: { flex: 1, fontFamily: F.semibold, fontSize: 12, color: C.brand, textAlign: 'right' },
  inputBar: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  attachBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    fontFamily: F.regular,
    fontSize: 14,
    color: C.onSurface,
    textAlign: 'right',
    maxHeight: 110,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
