import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { categories, type CategoryKey } from '../../constants/theme';
import { useCurrency } from '../../hooks/useCurrency';
import { getCurrency, majorToMinor, minorToMajor } from '../../lib/currency';
import { formatCurrency } from '../../lib/formatters';
import { supabase } from '../../lib/supabase';
import { GlassView } from '../ui/GlassView';
import { shadows } from '../../constants/theme';
import type { CategoryBudget } from '../../types';

const ALL_CATEGORIES: CategoryKey[] = [
  'Food',
  'Transport',
  'Shopping',
  'Entertainment',
  'Other',
];

/**
 * Category-budget settings card. Lives in Profile. Lets the user set a
 * monthly cap per category. The value 0 (or no row) means "no cap"; the
 * card renders the input empty.
 */
export function CategoryBudgetsCard() {
  const currency = useCurrency();
  const cur = getCurrency(currency);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data } = await supabase.from('category_budgets').select('*');
    const map: Record<string, number> = {};
    const newDrafts: Record<string, string> = {};
    for (const b of (data as CategoryBudget[]) ?? []) {
      map[b.category] = b.budget_amount;
      newDrafts[b.category] = String(
        Math.round(minorToMajor(b.budget_amount, currency)),
      );
    }
    setByCategory(map);
    setDrafts(newDrafts);
    setLoaded(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(cat: CategoryKey) {
    const raw = drafts[cat] ?? '';
    const amount = parseInt(raw, 10);
    if (raw && (isNaN(amount) || amount < 0)) return;
    setBusy(cat);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(null);
      return;
    }
    const minorAmount = raw ? majorToMinor(amount, currency) : 0;
    const { error } = await supabase
      .from('category_budgets')
      .upsert(
        {
          user_id: user.id,
          category: cat,
          budget_amount: minorAmount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,category' },
      );
    setBusy(null);
    if (!error) {
      setByCategory((prev) => ({ ...prev, [cat]: minorAmount }));
    }
  }

  return (
    <GlassView className="rounded-2xl p-5" style={shadows.sm}>
      <View className="flex-row items-center gap-2 mb-1">
        <Ionicons name="wallet-outline" size={18} color="#2563EB" />
        <Text className="text-base font-semibold text-text-primary">
          Per-category budgets
        </Text>
      </View>
      <Text className="text-xs text-text-secondary mb-4">
        Set a monthly cap per category. Spends will show progress against it.
        Leave blank for no cap.
      </Text>

      {!loaded ? (
        <ActivityIndicator />
      ) : (
        <View className="gap-2">
          {ALL_CATEGORIES.map((cat) => {
            const meta = categories[cat];
            const current = byCategory[cat] ?? 0;
            return (
              <View
                key={cat}
                className="flex-row items-center gap-2"
              >
                <View
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: meta.color + '22' }}
                >
                  <Text className="text-lg">{meta.emoji}</Text>
                </View>
                <Text className="text-sm font-medium text-text-primary w-24">
                  {cat}
                </Text>
                <View className="flex-row items-center bg-background border border-border rounded-xl px-2 flex-1">
                  <Text className="text-sm text-text-muted mr-1">
                    {cur.symbol}
                  </Text>
                  <TextInput
                    value={drafts[cat] ?? ''}
                    onChangeText={(t) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [cat]: t.replace(/\D/g, ''),
                      }))
                    }
                    onBlur={() => save(cat)}
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    inputMode="numeric"
                    className="flex-1 py-2 text-sm text-text-primary"
                  />
                  {busy === cat && (
                    <ActivityIndicator size="small" color="#2563EB" />
                  )}
                </View>
                {current > 0 && (
                  <Pressable
                    onPress={() => {
                      setDrafts((prev) => ({ ...prev, [cat]: '' }));
                      save(cat);
                    }}
                    className="p-1 active:opacity-60"
                  >
                    <Ionicons name="close" size={14} color="#9CA3AF" />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}
    </GlassView>
  );
}
