import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useCurrency } from '../../hooks/useCurrency';
import { getCurrency, majorToMinor } from '../../lib/currency';
import { formatCurrency } from '../../lib/formatters';
import { supabase } from '../../lib/supabase';

interface AddIncomeCardProps {
  onSuccess: () => void;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddIncomeCard({ onSuccess }: AddIncomeCardProps) {
  const currency = useCurrency();
  const cur = getCurrency(currency);
  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  async function save() {
    const trimmedSource = source.trim();
    const amountMajor = parseInt(amount, 10);
    if (!trimmedSource) {
      setError('Source is required.');
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

    const { error: err } = await supabase.from('transactions').insert({
      user_id: user.id,
      amount: majorToMinor(amountMajor, currency),
      merchant: trimmedSource,
      category: 'Other',
      transaction_type: 'credit',
      transacted_at: parsedDate.toISOString(),
      source: 'manual',
    });

    setBusy(false);
    if (err) {
      if ((err as { code?: string }).code === '23505') {
        setError('Already added — same source/amount/date exists.');
      } else {
        setError(err.message);
      }
      return;
    }
    setHint(
      `Added ${formatCurrency(majorToMinor(amountMajor, currency), currency)} from ${trimmedSource} ✓`,
    );
    setSource('');
    setAmount('');
    setDate(todayYmd());
    onSuccess();
  }

  return (
    <View className="bg-surface border border-border rounded-2xl p-4">
      <View className="flex-row items-center gap-2 mb-2">
        <Ionicons name="trending-up-outline" size={18} color="#10B981" />
        <Text className="text-sm font-semibold text-text-primary">
          Add income manually
        </Text>
      </View>
      <Text className="text-xs text-text-secondary mb-3">
        Salary, refund, side gig, transfer in — anything that shouldn&apos;t
        come from an SMS or statement.
      </Text>

      <Text className="text-xs text-text-secondary mb-1">Source</Text>
      <TextInput
        value={source}
        onChangeText={setSource}
        placeholder="Acme Payroll, freelance, refund…"
        placeholderTextColor="#9CA3AF"
        editable={!busy}
        className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary mb-3"
      />

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
        disabled={busy || !source.trim() || !amount}
        className={`flex-row items-center justify-center gap-2 py-3 rounded-xl ${
          busy || !source.trim() || !amount
            ? 'bg-text-muted'
            : 'bg-success active:opacity-80'
        }`}
        style={{
          backgroundColor:
            busy || !source.trim() || !amount ? undefined : '#10B981',
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <>
            <Ionicons name="add-circle-outline" size={16} color="white" />
            <Text className="text-white font-semibold text-sm">Add income</Text>
          </>
        )}
      </Pressable>

      {error && <Text className="text-danger text-xs mt-3">{error}</Text>}
      {hint && <Text className="text-success text-xs mt-3">{hint}</Text>}
    </View>
  );
}
