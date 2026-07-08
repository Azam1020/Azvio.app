import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { api } from '@/src/api';
import { apiCached } from '@/src/offlineCache';
import { OfflineBanner } from '@/src/OfflineBanner';
import { useAuth } from '@/src/AuthContext';
import { AppModal, confirmAsync } from '@/src/ui';
import { storage } from '@/src/utils/storage';
import { C, F, R, fmt, shadow } from '@/src/theme';

type Dash = {
  clients_total: number;
  clients_in_progress: number;
  clients_delivered: number;
  month_income: number;
  month_expenses: number;
  upcoming_events: any[];
  content_stages: Record<string, number>;
};

type Series = {
  months: string[];
  income: number[];
  expense: number[];
  new_clients: number[];
};

const EVENT_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  shooting: { label: 'تصوير', icon: 'videocam', color: C.brand },
  delivery: { label: 'تسليم', icon: 'checkmark-done', color: C.success },
  other: { label: 'موعد', icon: 'calendar', color: C.muted },
};

const STAGE_COLORS: Record<string, string> = {
  idea: '#B8860B',
  filming: C.brand,
  editing: '#16808A',
  published: C.success,
};

const STAGE_LABELS: Record<string, string> = {
  idea: 'أفكار',
  filming: 'تصوير',
  editing: 'مونتاج',
  published: 'منشور',
};

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const shortMonth = (ym: string) => {
  const [, m] = ym.split('-').map(Number);
  return AR_MONTHS[(m - 1) % 12].slice(0, 4);
};

type WidgetKey = 'stats' | 'incomeChart' | 'contentChart' | 'nav' | 'events';

const DEFAULT_ORDER: WidgetKey[] = ['stats', 'incomeChart', 'contentChart', 'nav', 'events'];

const DEFAULT_VISIBLE: Record<WidgetKey, boolean> = {
  stats: true,
  incomeChart: true,
  contentChart: true,
  nav: true,
  events: true,
};

const WIDGET_META: Record<WidgetKey, { label: string; icon: any }> = {
  stats: { label: 'إحصائيات سريعة', icon: 'stats-chart' },
  incomeChart: { label: 'رسم الدخل والمصاريف', icon: 'bar-chart' },
  contentChart: { label: 'توزيع المحتوى', icon: 'pie-chart' },
  nav: { label: 'أزرار الأقسام', icon: 'apps' },
  events: { label: 'المواعيد القادمة', icon: 'calendar' },
};

const PREFS_CACHE_KEY = 'azvio_dashboard_prefs_v2';

function sanitizeOrder(order: any[]): WidgetKey[] {
  const clean: WidgetKey[] = [];
  const seen = new Set<string>();
  for (const k of order || []) {
    if (DEFAULT_ORDER.includes(k) && !seen.has(k)) {
      clean.push(k);
      seen.add(k);
    }
  }
  for (const k of DEFAULT_ORDER) {
    if (!seen.has(k)) clean.push(k);
  }
  return clean;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<Dash | null>(null);
  const [allowedSections, setAllowedSections] = useState<string[]>([]);
  const [offline, setOffline] = useState(false);
  const [series, setSeries] = useState<Series | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [widgetsOrder, setWidgetsOrder] = useState<WidgetKey[]>(DEFAULT_ORDER);
  const [widgetsVisible, setWidgetsVisible] = useState<Record<WidgetKey, boolean>>(DEFAULT_VISIBLE);
  const [installAvailable, setInstallAvailable] = useState(false);

  // Listen for PWA install prompt (web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const g = globalThis as any;
    if (g.__azvioInstallPrompt) setInstallAvailable(true);
    const onAvail = () => setInstallAvailable(true);
    g.addEventListener?.('azvio-install-available', onAvail);
    return () => g.removeEventListener?.('azvio-install-available', onAvail);
  }, []);

  const doInstall = async () => {
    const g = globalThis as any;
    const p = g.__azvioInstallPrompt;
    if (!p) return;
    p.prompt();
    try {
      await p.userChoice;
    } catch {}
    g.__azvioInstallPrompt = null;
    setInstallAvailable(false);
  };

  // Load widget prefs (backend first, cache fallback)
  useEffect(() => {
    (async () => {
      const cached = await storage.getItem<any>(PREFS_CACHE_KEY, null);
      if (cached?.order && cached?.visible) {
        setWidgetsOrder(sanitizeOrder(cached.order));
        setWidgetsVisible({ ...DEFAULT_VISIBLE, ...cached.visible });
      }
      try {
        const r = await api('/user/settings');
        const dash = r?.dashboard;
        if (dash?.order?.length) {
          const order = sanitizeOrder(dash.order);
          const visible = { ...DEFAULT_VISIBLE, ...(dash.visible || {}) };
          setWidgetsOrder(order);
          setWidgetsVisible(visible);
          await storage.setItem(PREFS_CACHE_KEY, { order, visible });
        }
      } catch {}
    })();
  }, []);

  const savePrefs = async (nextOrder: WidgetKey[], nextVisible: Record<WidgetKey, boolean>) => {
    const order = sanitizeOrder(nextOrder);
    setWidgetsOrder(order);
    setWidgetsVisible(nextVisible);
    await storage.setItem(PREFS_CACHE_KEY, { order, visible: nextVisible });
    try {
      await api('/user/settings/dashboard', {
        method: 'PUT',
        body: JSON.stringify({ order, visible: nextVisible }),
      });
    } catch {}
  };

  const toggleVisible = (k: WidgetKey, v: boolean) => {
    savePrefs(widgetsOrder, { ...widgetsVisible, [k]: v });
  };

  const moveWidget = (k: WidgetKey, dir: -1 | 1) => {
    const idx = widgetsOrder.indexOf(k);
    if (idx < 0) return;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= widgetsOrder.length) return;
    const next = [...widgetsOrder];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    savePrefs(next, widgetsVisible);
  };

  const resetPrefs = () => savePrefs(DEFAULT_ORDER, DEFAULT_VISIBLE);

  const load = useCallback(async () => {
    try {
      const [dash, ts] = await Promise.all([
        apiCached('/dashboard', 'dashboard'),
        apiCached('/dashboard/timeseries?months=6', 'dashboard_timeseries'),
      ]);
      setData(dash.data);
      setSeries(ts.data);
      setOffline(dash.fromCache || ts.fromCache);
    } catch {}
    try {
      const perms = await api('/team/permissions/mine');
      setAllowedSections(perms?.sections ?? []);
    } catch {
      // لو فشل الطلب لأي سبب، نخلي كل الأقسام ظاهرة بدل ما نخفي كل شي بالغلط
      setAllowedSections(['content', 'calendar', 'services', 'pricing', 'invoices', 'portfolio', 'whatsapp', 'insights', 'google_accounts', 'links', 'settings', 'finance', 'clients']);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    if (await confirmAsync('تسجيل الخروج', 'هل تريد تسجيل الخروج من AZVIO؟')) {
      await logout();
      router.replace('/login');
    }
  };

  const contentTotal = data ? Object.values(data.content_stages).reduce((a, b) => a + b, 0) : 0;

  const allCards = [
    { key: 'content', title: 'المحتوى', sub: `${contentTotal} عنصر`, icon: 'film' as const, href: '/content' },
    { key: 'calendar', title: 'التقويم', sub: 'مواعيد التصوير والتسليم', icon: 'calendar' as const, href: '/calendar' },
    { key: 'services', title: 'خدماتي', sub: 'درون ومونتاج', icon: 'briefcase' as const, href: '/services' },
    { key: 'pricing', title: 'تسعيرتي', sub: 'أسعارك مقابل السوق', icon: 'pricetags' as const, href: '/pricing' },
    { key: 'invoices', title: 'الفواتير وعروض السعر', sub: 'أنشئ فاتورة أو عرض سعر بضغطة', icon: 'document-text' as const, href: '/invoices' },
    { key: 'portfolio', title: 'البورتفوليو', sub: 'مشاريعك المُسلَّمة', icon: 'images' as const, href: '/portfolio' },
    { key: 'whatsapp', title: 'تحليل واتساب', sub: 'استخرج العملاء من المحادثات', icon: 'logo-whatsapp' as const, href: '/whatsapp' },
    { key: 'insights', title: 'رؤى الأسبوع', sub: 'تقرير سند الأسبوعي', icon: 'analytics' as const, href: '/insights' },
    { key: 'google_accounts', title: 'حسابات Google', sub: 'ربط تقويم Google', icon: 'logo-google' as const, href: '/google-accounts' },
    { key: 'links', title: 'روابط سريعة', sub: 'روابطك اليومية', icon: 'link' as const, href: '/links' },
    { key: 'settings', title: 'الإعدادات', sub: 'حسابك وكلمة المرور', icon: 'settings' as const, href: '/settings' },
    { key: 'team', title: 'إدارة المستخدمين', sub: 'إضافة وصلاحيات الفريق', icon: 'people' as const, href: '/team' },
    { key: 'tickets', title: 'ملاحظات سند', sub: 'الأخطاء والمزايا المُقترحة', icon: 'chatbubbles' as const, href: '/tickets' },
  ];

  // الأقسام المسموح لدور المستخدم يشوفها — تُجلب من الباك اند (طلب #17)
  const navCards = allCards.filter((c) => allowedSections.includes(c.key));

  // Chart data prep
  const chartWidth = Math.min(width - 32 - 16, 520); // container padding + card padding
  const barChartData = useMemo(() => {
    if (!series) return [] as any[];
    const rows: any[] = [];
    series.months.forEach((ym, i) => {
      // gifted-charts renders LTR internally but we can leverage stacking
      rows.push({ value: series.income[i], label: shortMonth(ym), frontColor: C.brand, spacing: 2 });
      rows.push({ value: series.expense[i], frontColor: '#E5A4A4', spacing: 14 });
    });
    return rows;
  }, [series]);

  const maxY = useMemo(() => {
    if (!series) return 100;
    const arr = [...series.income, ...series.expense];
    const m = Math.max(...arr, 100);
    return Math.ceil(m / 100) * 100;
  }, [series]);

  const pieData = useMemo(() => {
    if (!data) return [];
    const stages: (keyof typeof STAGE_COLORS)[] = ['idea', 'filming', 'editing', 'published'];
    return stages
      .filter((s) => (data.content_stages[s] || 0) > 0)
      .map((s) => ({
        value: data.content_stages[s] || 0,
        color: STAGE_COLORS[s],
        text: String(data.content_stages[s] || 0),
        stage: s,
      }));
  }, [data]);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface2 }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <Image
            source={require('../../assets/images/azvio-logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.greeting}>أهلاً، {user?.name?.split(' ')[0] || 'عزّام'} 👋</Text>
            <Text style={styles.brandSmall}>
              AZV<Text style={{ color: C.brand }}>IO</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setCustomizeOpen(true)}
            testID="customize-dashboard-btn"
          >
            <Ionicons name="options-outline" size={20} color={C.onSurface2} />
          </TouchableOpacity>
          {installAvailable && (
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: C.brandSoft }]}
              onPress={doInstall}
              testID="install-pwa-btn"
            >
              <Ionicons name="download-outline" size={20} color={C.brand} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/settings')}
            testID="header-settings-btn"
          >
            <Ionicons name="settings-outline" size={20} color={C.onSurface2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handleLogout} testID="logout-btn">
            <Ionicons name="log-out-outline" size={20} color={C.onSurface2} />
          </TouchableOpacity>
        </View>
      </View>

      <OfflineBanner visible={offline} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
      >
        {widgetsOrder.filter((k) => widgetsVisible[k]).map((key) => {
          if (key === 'stats') {
            return (
              <React.Fragment key={key}>
                <View style={styles.statsRow}>
                  <View style={[styles.statCard, { backgroundColor: C.brand }]}>
                    <Ionicons name="trending-up" size={20} color="rgba(255,255,255,0.85)" />
                    <Text style={[styles.statValue, { color: '#FFF' }]}>{fmt(data?.month_income || 0)}</Text>
                    <Text style={[styles.statLabel, { color: 'rgba(255,255,255,0.85)' }]}>دخل هذا الشهر</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Ionicons name="trending-down" size={20} color={C.error} />
                    <Text style={styles.statValue}>{fmt(data?.month_expenses || 0)}</Text>
                    <Text style={styles.statLabel}>مصاريف الشهر</Text>
                  </View>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <Ionicons name="hourglass" size={20} color={C.warning} />
                    <Text style={styles.statValue}>{data?.clients_in_progress ?? 0}</Text>
                    <Text style={styles.statLabel}>مشاريع قيد التنفيذ</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Ionicons name="checkmark-circle" size={20} color={C.success} />
                    <Text style={styles.statValue}>{data?.clients_delivered ?? 0}</Text>
                    <Text style={styles.statLabel}>مشاريع مُسلّمة</Text>
                  </View>
                </View>
              </React.Fragment>
            );
          }

          if (key === 'incomeChart' && series && series.months.length > 0) {
            return (
              <View key={key} style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={styles.chartTitle}>الدخل والمصاريف</Text>
                    <Text style={styles.chartSubtitle}>آخر 6 أشهر</Text>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: C.brand }]} />
                      <Text style={styles.legendText}>دخل</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#E5A4A4' }]} />
                      <Text style={styles.legendText}>مصاريف</Text>
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'center', marginTop: 6 }}>
                  <BarChart
                    data={barChartData}
                    width={chartWidth}
                    height={160}
                    barWidth={12}
                    barBorderRadius={4}
                    noOfSections={4}
                    maxValue={maxY}
                    yAxisTextStyle={{ color: C.muted, fontSize: 10, fontFamily: F.regular }}
                    xAxisLabelTextStyle={{ color: C.onSurface2, fontSize: 10, fontFamily: F.semibold }}
                    yAxisThickness={0}
                    xAxisThickness={0}
                    rulesColor={C.border}
                    rulesType="solid"
                    initialSpacing={10}
                    endSpacing={10}
                    disableScroll
                    hideRules={false}
                    yAxisLabelWidth={40}
                  />
                </View>
              </View>
            );
          }

          if (key === 'contentChart' && contentTotal > 0) {
            return (
              <View key={key} style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={styles.chartTitle}>توزيع المحتوى</Text>
                    <Text style={styles.chartSubtitle}>{contentTotal} عنصر إجمالاً</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <PieChart
                    donut
                    data={pieData}
                    radius={70}
                    innerRadius={45}
                    textColor="#FFF"
                    textSize={11}
                    showText
                    centerLabelComponent={() => (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 20, color: C.onSurface }}>{contentTotal}</Text>
                        <Text style={{ fontFamily: F.regular, fontSize: 11, color: C.muted }}>عنصر</Text>
                      </View>
                    )}
                  />
                  <View style={{ gap: 8 }}>
                    {(['idea', 'filming', 'editing', 'published'] as const).map((s) => (
                      <View key={s} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: STAGE_COLORS[s] }]} />
                        <Text style={styles.legendText}>
                          {STAGE_LABELS[s]} ({data?.content_stages[s] || 0})
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            );
          }

          if (key === 'nav') {
            return (
              <React.Fragment key={key}>
                <Text style={styles.sectionTitle}>الأقسام</Text>
                <View style={styles.navGrid}>
                  {navCards.map((c) => (
                    <TouchableOpacity
                      key={c.title}
                      style={styles.navCard}
                      onPress={() => router.push(c.href as any)}
                      testID={`nav-${c.href.slice(1)}`}
                    >
                      <View style={styles.navIcon}>
                        <Ionicons name={c.icon} size={22} color={C.brand} />
                      </View>
                      <Text style={styles.navTitle}>{c.title}</Text>
                      <Text style={styles.navSub}>{c.sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </React.Fragment>
            );
          }

          if (key === 'events') {
            return (
              <React.Fragment key={key}>
                <Text style={styles.sectionTitle}>المواعيد القادمة</Text>
                {(data?.upcoming_events?.length ?? 0) === 0 ? (
                  <View style={styles.emptyEvents}>
                    <Ionicons name="calendar-outline" size={22} color={C.muted} />
                    <Text style={styles.emptyText}>لا توجد مواعيد قادمة — أضفها من التقويم</Text>
                  </View>
                ) : (
                  data!.upcoming_events.map((e) => {
                    const meta = EVENT_LABELS[e.event_type] || EVENT_LABELS.other;
                    return (
                      <View key={e.id} style={styles.eventCard}>
                        <View style={[styles.eventIcon, { backgroundColor: `${meta.color}18` }]}>
                          <Ionicons name={meta.icon} size={18} color={meta.color} />
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={styles.eventTitle}>{e.title}</Text>
                          <Text style={styles.eventSub}>
                            {meta.label} • {e.date}
                            {e.time ? ` • ${e.time}` : ''}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </React.Fragment>
            );
          }

          return null;
        })}
      </ScrollView>

      {/* Customize dashboard modal */}
      <AppModal visible={customizeOpen} title="تخصيص الرئيسية" onClose={() => setCustomizeOpen(false)}>
        <Text style={styles.customHint}>
          رتّب الأقسام بالأسهم واختر ما تريد إظهاره. تُحفظ التفضيلات على حسابك.
        </Text>
        {widgetsOrder.map((k, idx) => {
          const meta = WIDGET_META[k];
          const isFirst = idx === 0;
          const isLast = idx === widgetsOrder.length - 1;
          return (
            <View key={k} style={styles.widgetRow}>
              <View style={styles.orderBtns}>
                <TouchableOpacity
                  onPress={() => moveWidget(k, -1)}
                  disabled={isFirst}
                  style={[styles.orderBtn, isFirst && styles.orderBtnDisabled]}
                  testID={`move-up-${k}`}
                  hitSlop={4}
                >
                  <Ionicons name="chevron-up" size={16} color={isFirst ? C.muted : C.brand} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveWidget(k, 1)}
                  disabled={isLast}
                  style={[styles.orderBtn, isLast && styles.orderBtnDisabled]}
                  testID={`move-down-${k}`}
                  hitSlop={4}
                >
                  <Ionicons name="chevron-down" size={16} color={isLast ? C.muted : C.brand} />
                </TouchableOpacity>
              </View>
              <Switch
                value={widgetsVisible[k]}
                onValueChange={(v) => toggleVisible(k, v)}
                trackColor={{ true: C.brand, false: C.border }}
                thumbColor="#FFF"
                testID={`toggle-${k}`}
              />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.widgetLabel}>{meta.label}</Text>
                <Text style={styles.widgetOrderText}>الترتيب: {idx + 1}</Text>
              </View>
              <View style={styles.widgetIcon}>
                <Ionicons name={meta.icon} size={18} color={C.brand} />
              </View>
            </View>
          );
        })}
        <TouchableOpacity
          style={styles.resetBtn}
          onPress={resetPrefs}
          testID="reset-widgets-btn"
        >
          <Text style={styles.resetText}>استعادة الإعدادات الافتراضية</Text>
        </TouchableOpacity>
      </AppModal>
    </View>
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
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  logoImg: { width: 40, height: 38 },
  greeting: { fontFamily: F.bold, fontSize: 20, color: C.onSurface },
  brandSmall: { fontFamily: F.bold, fontSize: 12, letterSpacing: 2, color: C.muted },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row-reverse', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    alignItems: 'flex-end',
    gap: 4,
    ...shadow,
  },
  statValue: { fontFamily: F.bold, fontSize: 18, color: C.onSurface },
  statLabel: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  sectionTitle: {
    fontFamily: F.bold,
    fontSize: 16,
    color: C.onSurface,
    textAlign: 'right',
    marginTop: 12,
    marginBottom: 10,
  },
  navGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  navCard: {
    width: '47.8%',
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    alignItems: 'flex-end',
    ...shadow,
  },
  navIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  navTitle: { fontFamily: F.bold, fontSize: 15, color: C.onSurface },
  navSub: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 2 },
  emptyEvents: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { fontFamily: F.regular, fontSize: 13, color: C.muted },
  eventCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 14,
    marginBottom: 8,
    ...shadow,
  },
  eventIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface },
  eventSub: { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: 1 },
  chartCard: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    marginTop: 4,
    marginBottom: 12,
    ...shadow,
  },
  chartHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  chartTitle: { fontFamily: F.bold, fontSize: 15, color: C.onSurface, textAlign: 'right' },
  chartSubtitle: { fontFamily: F.regular, fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 2 },
  legendRow: { flexDirection: 'row-reverse', gap: 10 },
  legendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: F.semibold, fontSize: 11, color: C.onSurface2 },
  customHint: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'right', marginBottom: 12, lineHeight: 20 },
  widgetRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  widgetIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  widgetLabel: { fontFamily: F.semibold, fontSize: 14, color: C.onSurface },
  widgetOrderText: { fontFamily: F.regular, fontSize: 10, color: C.muted, marginTop: 2 },
  orderBtns: { flexDirection: 'column', gap: 2 },
  orderBtn: {
    width: 28,
    height: 22,
    borderRadius: 6,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(62,145,148,0.25)',
  },
  orderBtnDisabled: { backgroundColor: C.surface2, borderColor: C.border, opacity: 0.5 },
  resetBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  resetText: { fontFamily: F.semibold, fontSize: 12, color: C.brand },
});
