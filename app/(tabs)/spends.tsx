import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DonutChart, type DonutSegment } from '../../components/spends/DonutChart';
import { categories, type CategoryKey } from '../../constants/theme';
import { useCurrency } from '../../hooks/useCurrency';
import { useTransactions } from '../../hooks/useTransactions';
import { formatCurrency, formatDateOnly } from '../../lib/formatters';

type TimeRange = 'thisMonth' | 'last30' | 'last90' | 'allTime' | 'custom';

const RANGE_OPTIONS: { id: TimeRange; label: string }[] = [
  { id: 'thisMonth', label: 'This month' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'allTime', label: 'All time' },
  { id: 'custom', label: 'Custom' },
];

interface CategorySummary extends DonutSegment {
  count: number;
  category: CategoryKey;
}

interface MerchantSummary {
  merchant: string;
  total: number;
  count: number;
  category: CategoryKey;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function parseYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

export default function SpendsTab() {
  const currency = useCurrency();
  const [range, setRange] = useState<TimeRange>('thisMonth');
  const [customStart, setCustomStart] = useState<string>(daysAgoYmd(30));
  const [customEnd, setCustomEnd] = useState<string>(todayYmd());

  const { since, until, dateError } = useMemo(() => {
    const now = new Date();
    if (range === 'thisMonth') {
      return {
        since: new Date(now.getFullYear(), now.getMonth(), 1),
        until: null as Date | null,
        dateError: null as string | null,
      };
    }
    if (range === 'last30') {
      const d = new Date(now);
      d.setDate(now.getDate() - 30);
      return { since: d, until: null, dateError: null };
    }
    if (range === 'last90') {
      const d = new Date(now);
      d.setDate(now.getDate() - 90);
      return { since: d, until: null, dateError: null };
    }
    if (range === 'allTime') {
      return { since: null, until: null, dateError: null };
    }
    // custom
    const s = parseYmd(customStart);
    const e = parseYmd(customEnd);
    if (!s || !e) {
      return {
        since: null,
        until: null,
        dateError: 'Use YYYY-MM-DD for both dates.',
      };
    }
    if (s > e) {
      return {
        since: null,
        until: null,
        dateError: 'Start date must be before end date.',
      };
    }
    // Include the entire end day by setting time to 23:59:59
    const endOfDay = new Date(e);
    endOfDay.setHours(23, 59, 59, 999);
    return { since: s, until: endOfDay, dateError: null };
  }, [range, customStart, customEnd]);

  const { transactions, loading } = useTransactions({
    since: range === 'custom' && dateError ? new Date() : since, // skip query while invalid
    until,
    debitsOnly: true,
  });

  const txsForCalc = dateError ? [] : transactions;

  const { summary, totalSpent, txCount } = useMemo(() => {
    const acc: Partial<Record<CategoryKey, { total: number; count: number }>> = {};
    for (const tx of txsForCalc) {
      const cat = tx.category as CategoryKey;
      if (!acc[cat]) acc[cat] = { total: 0, count: 0 };
      acc[cat]!.total += tx.amount;
      acc[cat]!.count += 1;
    }
    const summary: CategorySummary[] = (Object.entries(acc) as [
      CategoryKey,
      { total: number; count: number },
    ][])
      .map(([cat, data]) => ({
        category: cat,
        label: cat,
        value: data.total,
        count: data.count,
        color: categories[cat].color,
      }))
      .sort((a, b) => b.value - a.value);

    const totalSpent = txsForCalc.reduce((s, tx) => s + tx.amount, 0);
    return { summary, totalSpent, txCount: txsForCalc.length };
  }, [txsForCalc]);

  const topMerchants = useMemo<MerchantSummary[]>(() => {
    const m: Record<string, MerchantSummary> = {};
    for (const tx of txsForCalc) {
      if (!m[tx.merchant]) {
        m[tx.merchant] = {
          merchant: tx.merchant,
          total: 0,
          count: 0,
          category: tx.category as CategoryKey,
        };
      }
      m[tx.merchant].total += tx.amount;
      m[tx.merchant].count += 1;
    }
    return Object.values(m)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [txsForCalc]);

  const stats = useMemo(() => {
    if (txsForCalc.length === 0) return null;
    const sinceForAvg = since ?? new Date(txsForCalc[txsForCalc.length - 1].transacted_at);
    const endForAvg = until ?? new Date();
    const days = Math.max(
      1,
      Math.round((endForAvg.getTime() - sinceForAvg.getTime()) / 86_400_000),
    );
    const dailyAvg = Math.round(totalSpent / days);

    const biggest = [...txsForCalc].sort((a, b) => b.amount - a.amount)[0];

    return {
      dailyAvg,
      biggest,
      topCategory: summary[0],
      daysInRange: days,
    };
  }, [txsForCalc, totalSpent, summary, since, until]);

  const periodSubtitle = useMemo(() => {
    if (range === 'thisMonth') return 'This month at a glance.';
    if (range === 'last30') return 'Last 30 days at a glance.';
    if (range === 'last90') return 'Last 90 days at a glance.';
    if (range === 'allTime') return 'Everything we know about your spending.';
    // Custom: only format once both inputs are valid YYYY-MM-DD. While the
    // user is mid-typing, fall back to a generic label so we don't crash on
    // parseISO of an incomplete date string.
    const s = parseYmd(customStart);
    const e = parseYmd(customEnd);
    if (!s || !e) return 'Custom range';
    return `${formatDateOnly(customStart)} → ${formatDateOnly(customEnd)}`;
  }, [range, customStart, customEnd]);

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-3">
        <Text className="text-3xl font-bold text-text-primary mb-1">Spends</Text>
        <Text className="text-base text-text-secondary">{periodSubtitle}</Text>
      </View>

      {/* Time range pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
        className="mb-2"
      >
        {RANGE_OPTIONS.map((opt) => {
          const selected = opt.id === range;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setRange(opt.id)}
              className={`px-4 py-2 rounded-full border ${
                selected
                  ? 'bg-primary border-primary'
                  : 'bg-surface border-border active:opacity-80'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  selected ? 'text-white' : 'text-text-secondary'
                }`}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Custom date inputs */}
      {range === 'custom' && (
        <View className="px-6 mt-3 mb-3">
          <View className="bg-surface border border-border rounded-2xl p-4">
            <Text className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2">
              Date range
            </Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="text-xs text-text-secondary mb-1">From</Text>
                <TextInput
                  value={customStart}
                  onChangeText={setCustomStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-text-secondary mb-1">To</Text>
                <TextInput
                  value={customEnd}
                  onChangeText={setCustomEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
                />
              </View>
            </View>
            {dateError && (
              <Text className="text-danger text-xs mt-2">{dateError}</Text>
            )}
            <View className="flex-row gap-2 mt-3">
              <QuickRangeButton
                label="Last 7 d"
                onPress={() => {
                  setCustomStart(daysAgoYmd(7));
                  setCustomEnd(todayYmd());
                }}
              />
              <QuickRangeButton
                label="Last 60 d"
                onPress={() => {
                  setCustomStart(daysAgoYmd(60));
                  setCustomEnd(todayYmd());
                }}
              />
              <QuickRangeButton
                label="Last 6 mo"
                onPress={() => {
                  setCustomStart(daysAgoYmd(180));
                  setCustomEnd(todayYmd());
                }}
              />
              <QuickRangeButton
                label="Last year"
                onPress={() => {
                  setCustomStart(daysAgoYmd(365));
                  setCustomEnd(todayYmd());
                }}
              />
            </View>
          </View>
        </View>
      )}

      {/* Donut chart */}
      <View className="py-6 items-center">
        {loading ? (
          <View style={{ height: 260 }} className="items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : (
          <DonutChart
            segments={summary}
            centerSubLabel="Total spent"
            centerLabel={formatCurrency(totalSpent, currency)}
            bottomLabel={
              txCount > 0
                ? `${txCount} ${txCount === 1 ? 'transaction' : 'transactions'}`
                : undefined
            }
          />
        )}
      </View>

      {/* Stats grid */}
      {stats && (
        <View className="px-6 mb-6 flex-row gap-2">
          <StatCard
            iconName="trending-up-outline"
            iconColor="#4F46E5"
            label="Daily avg"
            value={formatCurrency(stats.dailyAvg, currency)}
            sub={`over ${stats.daysInRange} day${stats.daysInRange === 1 ? '' : 's'}`}
          />
          <StatCard
            iconName="flash-outline"
            iconColor="#F43F5E"
            label="Biggest"
            value={formatCurrency(stats.biggest.amount, currency)}
            sub={stats.biggest.merchant}
          />
          <StatCard
            iconName="trophy-outline"
            iconColor={stats.topCategory.color}
            label="Top category"
            value={stats.topCategory.label}
            sub={formatCurrency(stats.topCategory.value, currency)}
          />
        </View>
      )}

      {/* Top merchants */}
      {topMerchants.length > 0 && (
        <View className="px-6 mb-6">
          <Text className="text-lg font-semibold text-text-primary mb-3">
            Top merchants
          </Text>
          <View className="bg-surface border border-border rounded-2xl overflow-hidden">
            {topMerchants.map((m, idx) => {
              const catMeta = categories[m.category];
              return (
                <View
                  key={m.merchant}
                  className={`flex-row items-center px-4 py-3 ${
                    idx < topMerchants.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <Text className="text-text-muted text-sm font-medium w-6">
                    {idx + 1}
                  </Text>
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: catMeta.color + '22' }}
                  >
                    <Text className="text-base">{catMeta.emoji}</Text>
                  </View>
                  <View className="flex-1 mr-2">
                    <Text
                      className="text-base font-medium text-text-primary"
                      numberOfLines={1}
                    >
                      {m.merchant}
                    </Text>
                    <Text className="text-xs text-text-muted">
                      {m.count} {m.count === 1 ? 'visit' : 'visits'} · {m.category}
                    </Text>
                  </View>
                  <Text className="text-base font-semibold text-text-primary">
                    {formatCurrency(m.total, currency)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* By category */}
      <View className="px-6 pb-12">
        <Text className="text-lg font-semibold text-text-primary mb-3">
          By category
        </Text>
        {summary.length === 0 ? (
          <View className="bg-surface border border-border rounded-2xl p-8 items-center">
            <Text className="text-5xl mb-3">🍃</Text>
            <Text className="text-base font-medium text-text-primary mb-1">
              No spending in this range
            </Text>
            <Text className="text-sm text-text-secondary text-center">
              Try a different time range or add a transaction from Home.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {summary.map((seg) => {
              const pct = totalSpent > 0 ? (seg.value / totalSpent) * 100 : 0;
              const meta = categories[seg.category];
              return (
                <View
                  key={seg.category}
                  className="bg-surface border border-border rounded-2xl p-4"
                >
                  <View className="flex-row items-center mb-3">
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: seg.color + '22' }}
                    >
                      <Text className="text-xl">{meta.emoji}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-text-primary">
                        {seg.label}
                      </Text>
                      <Text className="text-xs text-text-muted">
                        {seg.count}{' '}
                        {seg.count === 1 ? 'transaction' : 'transactions'} ·{' '}
                        {pct.toFixed(0)}%
                      </Text>
                    </View>
                    <Text className="text-lg font-bold text-text-primary">
                      {formatCurrency(seg.value, currency)}
                    </Text>
                  </View>
                  <View className="h-2 bg-background rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: seg.color,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

interface QuickRangeButtonProps {
  label: string;
  onPress: () => void;
}

function QuickRangeButton({ label, onPress }: QuickRangeButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className="px-3 py-1.5 rounded-lg bg-background border border-border active:opacity-80"
    >
      <Text className="text-xs text-text-secondary font-medium">{label}</Text>
    </Pressable>
  );
}

interface StatCardProps {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ iconName, iconColor, label, value, sub }: StatCardProps) {
  return (
    <View className="flex-1 bg-surface border border-border rounded-2xl p-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mb-2"
        style={{ backgroundColor: iconColor + '22' }}
      >
        <Ionicons name={iconName} size={14} color={iconColor} />
      </View>
      <Text className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">
        {label}
      </Text>
      <Text className="text-base font-bold text-text-primary mb-0.5" numberOfLines={1}>
        {value}
      </Text>
      {sub && (
        <Text className="text-[11px] text-text-muted" numberOfLines={1}>
          {sub}
        </Text>
      )}
    </View>
  );
}
