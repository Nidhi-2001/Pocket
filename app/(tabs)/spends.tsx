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
import { CashFlowChart, type FlowSegment } from '../../components/spends/CashFlowChart';
import { DonutChart, type DonutSegment } from '../../components/spends/DonutChart';
import { OwedBarChart } from '../../components/spends/OwedBarChart';
import { SplitwiseImportButton } from '../../components/spends/SplitwiseImportButton';
import { categories, type CategoryKey } from '../../constants/theme';
import { useCategoryBudgets } from '../../hooks/useCategoryBudgets';
import { useCurrency } from '../../hooks/useCurrency';
import { useSplitwiseBalances } from '../../hooks/useSplitwiseBalances';
import { useTransactions } from '../../hooks/useTransactions';
import { getCurrency } from '../../lib/currency';
import { formatCurrency, formatDateOnly } from '../../lib/formatters';
import type { Transaction } from '../../types';

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

interface SourceSummary {
  source: string; // merchant
  total: number;
  count: number;
  color: string;
}

// Color palette for income source donut. 12 distinct colors recycled if more
// sources exist.
const INCOME_COLORS = [
  '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4',
  '#84CC16', '#F97316', '#A78BFA', '#14B8A6', '#FB7185', '#0EA5E9',
];

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
  const cur = getCurrency(currency);
  const [range, setRange] = useState<TimeRange>('thisMonth');
  const [customStart, setCustomStart] = useState<string>(daysAgoYmd(30));
  const [customEnd, setCustomEnd] = useState<string>(todayYmd());
  const { byCategory: budgetByCategory } = useCategoryBudgets();
  const {
    balances: swBalances,
    loading: swLoading,
    error: swError,
  } = useSplitwiseBalances();

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
    const s = parseYmd(customStart);
    const e = parseYmd(customEnd);
    if (!s || !e) {
      return { since: null, until: null, dateError: 'Use YYYY-MM-DD for both dates.' };
    }
    if (s > e) {
      return { since: null, until: null, dateError: 'Start date must be before end date.' };
    }
    const endOfDay = new Date(e);
    endOfDay.setHours(23, 59, 59, 999);
    return { since: s, until: endOfDay, dateError: null };
  }, [range, customStart, customEnd]);

  const { transactions, loading, refetch: refetchTxs } = useTransactions({
    since: range === 'custom' && dateError ? new Date() : since,
    until,
  });

  const txs = dateError ? [] : transactions;
  const debits = useMemo(
    () => txs.filter((t) => t.transaction_type === 'debit'),
    [txs],
  );
  const credits = useMemo(
    () => txs.filter((t) => t.transaction_type === 'credit'),
    [txs],
  );

  const totalIncome = credits.reduce((s, t) => s + t.amount, 0);
  const totalExpenses = debits.reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpenses;

  // Segments for the combined cash-flow chart at the top.
  const debitsForChart = useMemo<FlowSegment[]>(() => {
    const acc: Partial<Record<CategoryKey, number>> = {};
    for (const tx of debits) {
      acc[tx.category as CategoryKey] = (acc[tx.category as CategoryKey] ?? 0) + tx.amount;
    }
    return (Object.entries(acc) as [CategoryKey, number][])
      .map(([cat, val]) => ({ label: cat, value: val, color: categories[cat].color }))
      .sort((a, b) => b.value - a.value);
  }, [debits]);

  const creditsForChart = useMemo<FlowSegment[]>(() => {
    const acc: Record<string, number> = {};
    for (const tx of credits) {
      acc[tx.merchant] = (acc[tx.merchant] ?? 0) + tx.amount;
    }
    return Object.entries(acc)
      .map(([source, val], i) => ({
        label: source,
        value: val,
        color: INCOME_COLORS[i % INCOME_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [credits]);

  const periodSubtitle = useMemo(() => {
    if (range === 'thisMonth') return 'This month at a glance.';
    if (range === 'last30') return 'Last 30 days at a glance.';
    if (range === 'last90') return 'Last 90 days at a glance.';
    if (range === 'allTime') return 'Everything we know about your money.';
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

      {/* Date range pills */}
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
          </View>
        </View>
      )}

      {/* Single chart that visualizes both income and expenses */}
      <View className="px-6 mt-4 mb-6">
        <CashFlowChart
          income={creditsForChart}
          expenses={debitsForChart}
          currency={currency}
        />
      </View>

      {/* === SPLITWISE: WHO YOU OWE === */}
      <View className="px-6 mt-2 mb-3 flex-row items-center gap-2">
        <View
          className="w-7 h-7 rounded-full items-center justify-center"
          style={{ backgroundColor: '#F43F5E22' }}
        >
          <Ionicons name="people-outline" size={14} color="#F43F5E" />
        </View>
        <Text className="text-xl font-bold text-text-primary">Splits</Text>
      </View>
      <View className="px-6 mb-6">
        {swLoading ? (
          <View className="bg-surface border border-border rounded-2xl p-6 items-center">
            <ActivityIndicator />
          </View>
        ) : swError ? (
          <View className="bg-surface border border-border rounded-2xl p-6 items-center">
            <Text className="text-3xl mb-2">🔌</Text>
            <Text className="text-sm text-text-secondary text-center">
              Couldn&apos;t load Splitwise balances.
            </Text>
          </View>
        ) : swBalances && swBalances.owe.length > 0 ? (
          <OwedBarChart
            items={swBalances.owe}
            totalMinor={swBalances.totalOweMinor}
            currency={swBalances.currency}
          />
        ) : (
          <View className="bg-surface border border-border rounded-2xl p-6 items-center">
            <Text className="text-3xl mb-2">🤝</Text>
            <Text className="text-sm text-text-secondary text-center">
              You&apos;re all settled up on Splitwise.
            </Text>
          </View>
        )}
        <SplitwiseImportButton onImported={refetchTxs} />
      </View>

      {loading ? (
        <View className="py-12 items-center">
          <ActivityIndicator />
        </View>
      ) : (
        <>
          {/* === EXPENSES SECTION === */}
          <SectionHeader icon="trending-down" iconColor="#F43F5E" title="Expenses" />
          <ExpenseSection
            debits={debits}
            totalExpenses={totalExpenses}
            currency={currency}
            since={since}
            until={until}
            budgetByCategory={budgetByCategory}
          />

          {/* === INCOME SECTION === */}
          <SectionHeader icon="trending-up" iconColor="#10B981" title="Income" />
          <IncomeSection
            credits={credits}
            totalIncome={totalIncome}
            currency={currency}
          />
        </>
      )}
    </ScrollView>
  );
}

interface SectionHeaderProps {
  icon: 'trending-down' | 'trending-up';
  iconColor: string;
  title: string;
}
function SectionHeader({ icon, iconColor, title }: SectionHeaderProps) {
  return (
    <View className="px-6 mt-2 mb-3 flex-row items-center gap-2">
      <View
        className="w-7 h-7 rounded-full items-center justify-center"
        style={{ backgroundColor: iconColor + '22' }}
      >
        <Ionicons name={`${icon}-outline`} size={14} color={iconColor} />
      </View>
      <Text className="text-xl font-bold text-text-primary">{title}</Text>
    </View>
  );
}

interface ExpenseSectionProps {
  debits: Transaction[];
  totalExpenses: number;
  currency: string;
  since: Date | null;
  until: Date | null;
  budgetByCategory: Record<string, number>;
}

function ExpenseSection({
  debits,
  totalExpenses,
  currency,
  since,
  until,
  budgetByCategory,
}: ExpenseSectionProps) {
  const summary = useMemo<CategorySummary[]>(() => {
    const acc: Partial<Record<CategoryKey, { total: number; count: number }>> = {};
    for (const tx of debits) {
      const cat = tx.category as CategoryKey;
      if (!acc[cat]) acc[cat] = { total: 0, count: 0 };
      acc[cat]!.total += tx.amount;
      acc[cat]!.count += 1;
    }
    return (Object.entries(acc) as [CategoryKey, { total: number; count: number }][])
      .map(([cat, data]) => ({
        category: cat,
        label: cat,
        value: data.total,
        count: data.count,
        color: categories[cat].color,
      }))
      .sort((a, b) => b.value - a.value);
  }, [debits]);

  const topMerchants = useMemo(() => {
    const m: Record<string, { merchant: string; total: number; count: number; category: CategoryKey }> = {};
    for (const tx of debits) {
      if (!m[tx.merchant]) {
        m[tx.merchant] = { merchant: tx.merchant, total: 0, count: 0, category: tx.category as CategoryKey };
      }
      m[tx.merchant].total += tx.amount;
      m[tx.merchant].count += 1;
    }
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [debits]);

  const stats = useMemo(() => {
    if (debits.length === 0) return null;
    const startDate = since ?? new Date(debits[debits.length - 1].transacted_at);
    const endDate = until ?? new Date();
    const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
    const dailyAvg = Math.round(totalExpenses / days);
    const biggest = [...debits].sort((a, b) => b.amount - a.amount)[0];
    return { dailyAvg, biggest, topCategory: summary[0], days };
  }, [debits, totalExpenses, summary, since, until]);

  if (debits.length === 0) {
    return (
      <View className="px-6 mb-8">
        <View className="bg-surface border border-border rounded-2xl p-6 items-center">
          <Text className="text-3xl mb-2">🍃</Text>
          <Text className="text-sm text-text-secondary text-center">
            No expenses in this range.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      {stats && (
        <View className="px-6 mb-5 flex-row gap-2">
          <StatCard
            iconName="trending-up-outline"
            iconColor="#4F46E5"
            label="Daily avg"
            value={formatCurrency(stats.dailyAvg, currency)}
            sub={`${stats.days} day${stats.days === 1 ? '' : 's'}`}
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

      {topMerchants.length > 0 && (
        <View className="px-6 mb-5">
          <Text className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
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
                  <Text className="text-text-muted text-sm font-medium w-6">{idx + 1}</Text>
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: catMeta.color + '22' }}
                  >
                    <Text className="text-base">{catMeta.emoji}</Text>
                  </View>
                  <View className="flex-1 mr-2">
                    <Text className="text-base font-medium text-text-primary" numberOfLines={1}>
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

      <View className="px-6 mb-8">
        <Text className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
          By category
        </Text>
        <View className="gap-3">
          {summary.map((seg) => {
            const pct = totalExpenses > 0 ? (seg.value / totalExpenses) * 100 : 0;
            const meta = categories[seg.category];
            const budget = budgetByCategory[seg.category] ?? 0;
            const budgetPct = budget > 0 ? Math.min(100, (seg.value / budget) * 100) : 0;
            const overBudget = budget > 0 && seg.value > budget;
            return (
              <View key={seg.category} className="bg-surface border border-border rounded-2xl p-4">
                <View className="flex-row items-center mb-3">
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: seg.color + '22' }}
                  >
                    <Text className="text-xl">{meta.emoji}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-text-primary">{seg.label}</Text>
                    <Text className="text-xs text-text-muted">
                      {seg.count} {seg.count === 1 ? 'transaction' : 'transactions'} · {pct.toFixed(0)}% of total
                    </Text>
                  </View>
                  <Text className="text-lg font-bold text-text-primary">
                    {formatCurrency(seg.value, currency)}
                  </Text>
                </View>
                <View className="h-2 bg-background rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: seg.color }}
                  />
                </View>
                {budget > 0 && (
                  <View className="mt-3">
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-xs text-text-secondary">
                        Budget: {formatCurrency(budget, currency)}
                      </Text>
                      <Text
                        className={`text-xs font-medium ${overBudget ? 'text-danger' : 'text-text-secondary'}`}
                      >
                        {overBudget
                          ? `Over by ${formatCurrency(seg.value - budget, currency)}`
                          : `${formatCurrency(budget - seg.value, currency)} left`}
                      </Text>
                    </View>
                    <View className="h-1.5 bg-background border border-border rounded-full overflow-hidden">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${budgetPct}%`,
                          backgroundColor: overBudget ? '#F43F5E' : seg.color,
                        }}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </>
  );
}

interface IncomeSectionProps {
  credits: Transaction[];
  totalIncome: number;
  currency: string;
}

function IncomeSection({ credits, totalIncome, currency }: IncomeSectionProps) {
  const sources = useMemo<SourceSummary[]>(() => {
    const m: Record<string, { total: number; count: number }> = {};
    for (const tx of credits) {
      if (!m[tx.merchant]) m[tx.merchant] = { total: 0, count: 0 };
      m[tx.merchant].total += tx.amount;
      m[tx.merchant].count += 1;
    }
    return Object.entries(m)
      .map(([source, data], i) => ({
        source,
        total: data.total,
        count: data.count,
        color: INCOME_COLORS[i % INCOME_COLORS.length],
      }))
      .sort((a, b) => b.total - a.total);
  }, [credits]);

  if (credits.length === 0) {
    return (
      <View className="px-6 pb-12">
        <View className="bg-surface border border-border rounded-2xl p-6 items-center">
          <Text className="text-3xl mb-2">💼</Text>
          <Text className="text-sm text-text-secondary text-center">
            No income in this range yet. Use &quot;Add a transaction&quot; on
            Home to log salary, freelance, or transfers in.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View className="px-6 pb-12">
        <Text className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
          By source
        </Text>
        <View className="gap-3">
          {sources.map((s) => {
            const pct = totalIncome > 0 ? (s.total / totalIncome) * 100 : 0;
            return (
              <View key={s.source} className="bg-surface border border-border rounded-2xl p-4">
                <View className="flex-row items-center mb-2">
                  <View
                    className="w-3 h-3 rounded-full mr-3"
                    style={{ backgroundColor: s.color }}
                  />
                  <View className="flex-1">
                    <Text
                      className="text-base font-semibold text-text-primary"
                      numberOfLines={1}
                    >
                      {s.source}
                    </Text>
                    <Text className="text-xs text-text-muted">
                      {s.count} {s.count === 1 ? 'deposit' : 'deposits'} · {pct.toFixed(0)}% of total
                    </Text>
                  </View>
                  <Text className="text-lg font-bold text-success">
                    +{formatCurrency(s.total, currency)}
                  </Text>
                </View>
                <View className="h-2 bg-background rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: s.color }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </>
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
