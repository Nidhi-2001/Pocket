import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useCurrency } from '../../hooks/useCurrency';
import { categories, type CategoryKey } from '../../constants/theme';
import { getCurrency, majorToMinor } from '../../lib/currency';
import { formatCurrency } from '../../lib/formatters';
import { supabase } from '../../lib/supabase';

interface AddTransactionCardProps {
  onSuccess: () => void;
}

type TxType = 'expense' | 'income';

const GREEN = '#10B981';
const PRIMARY = '#4F46E5';

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Manual transaction entry — expenses AND income. Since the app can't read
 * bank SMS here, this is how spends/receipts get logged. Expenses pick a
 * category; income files under "Other". Writes a transactions row directly
 * (source: 'manual'), respecting the dedup index.
 */
export function AddTransactionCard({ onSuccess }: AddTransactionCardProps) {
  const currency = useCurrency();
  const cur = getCurrency(currency);
  const [type, setType] = useState<TxType>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategoryKey>('Food');
  const [date, setDate] = useState(todayYmd());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const isIncome = type === 'income';
  const canSave = !!name.trim() && !!amount && !busy;

  function switchType(next: TxType) {
    setType(next);
    setError(null);
    setHint(null);
  }

  async function save() {
    const trimmedName = name.trim();
    const amountMajor = parseInt(amount, 10);
    if (!trimmedName) {
      setError(isIncome ? 'Source is required.' : 'A description is required.');
      return;
    }
    if (!amountMajor || amountMajor <= 0) {
      setError(`Amount must be at least ${cur.symbol}1.`);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Date must be YYYY-MM-DD.');
      return;
    }
    const parsedDate = new Date(`${date}T12:00:00`);
    if (isNaN(parsedDate.getTime())) {
      setError('Invalid date.');
      return;
    }

    setBusy(true);
    setError(null);
    setHint(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setError('Not signed in.');
      return;
    }

    const minor = majorToMinor(amountMajor, currency);
    const { error: err } = await supabase.from('transactions').insert({
      user_id: user.id,
      amount: minor,
      merchant: trimmedName,
      category: isIncome ? 'Other' : category,
      transaction_type: isIncome ? 'credit' : 'debit',
      transacted_at: parsedDate.toISOString(),
      source: 'manual',
    });

    setBusy(false);
    if (err) {
      if ((err as { code?: string }).code === '23505') {
        setError('Already added — same description/amount/date exists.');
      } else {
        setError(err.message);
      }
      return;
    }
    setHint(
      `${isIncome ? 'Income' : 'Expense'} logged: ${formatCurrency(minor, currency)} · ${trimmedName} ✓`,
    );
    setName('');
    setAmount('');
    setDate(todayYmd());
    onSuccess();
  }

  return (
    <View className="bg-surface border border-border rounded-2xl p-4">
      <View className="flex-row items-center gap-2 mb-2">
        <Ionicons name="create-outline" size={18} color={PRIMARY} />
        <Text className="text-sm font-semibold text-text-primary">
          Add a transaction
        </Text>
      </View>
      <Text className="text-xs text-text-secondary mb-3">
        No SMS reading yet — log what you spent or received here.
      </Text>

      {/* Expense / Income toggle */}
      <View className="flex-row bg-background border border-border rounded-xl p-1 mb-3">
        {(['expense', 'income'] as const).map((t) => {
          const active = type === t;
          return (
            <Pressable
              key={t}
              onPress={() => switchType(t)}
              disabled={busy}
              className="flex-1 py-2 rounded-lg items-center"
              style={
                active
                  ? { backgroundColor: (t === 'income' ? GREEN : PRIMARY) + '22' }
                  : undefined
              }
            >
              <Text
                className={`text-sm font-semibold ${
                  active ? 'text-text-primary' : 'text-text-muted'
                }`}
              >
                {t === 'expense' ? 'Expense' : 'Income'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="text-xs text-text-secondary mb-1">
        {isIncome ? 'Source' : 'What for'}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={
          isIncome
            ? 'Acme Payroll, freelance, refund…'
            : 'Groceries, Uber, rent, dinner…'
        }
        placeholderTextColor="#9CA3AF"
        editable={!busy}
        className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary mb-3"
      />

      {/* Category picker — expenses only */}
      {!isIncome && (
        <View className="mb-3">
          <Text className="text-xs text-text-secondary mb-1">Category</Text>
          <View className="flex-row flex-wrap gap-2">
            {(Object.keys(categories) as CategoryKey[]).map((key) => {
              const selected = key === category;
              const meta = categories[key];
              return (
                <Pressable
                  key={key}
                  onPress={() => setCategory(key)}
                  disabled={busy}
                  className={`flex-row items-center gap-1 px-3 py-1.5 rounded-full border ${
                    selected ? 'border-primary' : 'border-border'
                  }`}
                  style={selected ? { backgroundColor: meta.color + '22' } : undefined}
                >
                  <Text className="text-sm">{meta.emoji}</Text>
                  <Text
                    className={`text-xs ${
                      selected ? 'text-text-primary font-semibold' : 'text-text-secondary'
                    }`}
                  >
                    {key}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View className="flex-row gap-2 mb-3">
        <View className="flex-1">
          <Text className="text-xs text-text-secondary mb-1">
            Amount ({cur.symbol})
          </Text>
          <View className="flex-row items-center bg-background border border-border rounded-xl px-3">
            <Text className="text-sm text-text-muted mr-1">{cur.symbol}</Text>
            <TextInput
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/\D/g, ''))}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              inputMode="numeric"
              editable={!busy}
              className="flex-1 py-2 text-sm text-text-primary"
            />
          </View>
        </View>
        <View className="flex-1">
          <Text className="text-xs text-text-secondary mb-1">Date</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
          />
        </View>
      </View>

      <Pressable
        onPress={save}
        disabled={!canSave}
        className="flex-row items-center justify-center gap-2 py-3 rounded-xl active:opacity-80"
        style={{ backgroundColor: !canSave ? '#9CA3AF' : isIncome ? GREEN : PRIMARY }}
      >
        {busy ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <>
            <Ionicons name="add-circle-outline" size={16} color="white" />
            <Text className="text-white font-semibold text-sm">
              {isIncome ? 'Add income' : 'Add expense'}
            </Text>
          </>
        )}
      </Pressable>

      {error && <Text className="text-danger text-xs mt-3">{error}</Text>}
      {hint && <Text className="text-success text-xs mt-3">{hint}</Text>}
    </View>
  );
}
