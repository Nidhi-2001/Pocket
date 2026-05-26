import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatCurrency, formatDateIST } from '../../lib/formatters';
import { supabase } from '../../lib/supabase';
import type { Transaction } from '../../types';

type ParseResult =
  | { valid: false; message?: string }
  | { valid: true; duplicate?: boolean; transaction?: Transaction; message?: string };

export default function TabsHome() {
  const [name, setName] = useState<string | null>(null);
  const [smsText, setSmsText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('name')
      .single()
      .then(({ data }) => setName(data?.name ?? null));
  }, []);

  async function parseSms() {
    if (!smsText.trim()) return;
    setParsing(true);
    setError(null);
    setResult(null);
    const { data, error: err } = await supabase.functions.invoke('parse-sms', {
      body: { smsText: smsText.trim() },
    });
    setParsing(false);
    if (err) {
      console.error('parse-sms invocation error:', err);
      // supabase-js wraps non-2xx as FunctionsHttpError and stashes the real
      // Response on err.context. Pull the body out so we see what the function
      // actually said, not the generic wrapper text.
      const ctx = (err as { context?: unknown }).context;
      if (ctx instanceof Response) {
        try {
          const body = await ctx.json();
          const detail = body.detail ? ` — ${body.detail}` : '';
          setError(`${body.error ?? `HTTP ${ctx.status}`}${detail}`);
        } catch {
          const text = await ctx.text().catch(() => '');
          setError(`HTTP ${ctx.status}${text ? ` — ${text}` : ''}`);
        }
      } else {
        setError(err.message || String(err));
      }
      return;
    }
    if (data && typeof data === 'object' && 'error' in data) {
      setError(`${data.error}${data.detail ? ` — ${data.detail}` : ''}`);
      return;
    }
    setResult(data as ParseResult);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-8">
        <Text className="text-3xl font-bold text-text-primary mb-1">
          Hey {name ?? 'there'} 👋
        </Text>
        <Text className="text-base text-text-secondary">
          Paste a bank SMS to test the parser.
        </Text>
      </View>

      <View className="px-6 pb-6">
        <Text className="text-sm font-medium text-text-secondary mb-2">
          Bank SMS text
        </Text>
        <TextInput
          value={smsText}
          onChangeText={setSmsText}
          placeholder="Dear UPI user A/C *1234 debited Rs.299 on 24-MAR-26 trf to ZOMATO LTD..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={5}
          style={{ textAlignVertical: 'top', minHeight: 120 }}
          className="bg-surface border border-border rounded-2xl px-4 py-3 text-base text-text-primary mb-4"
        />

        <Pressable
          onPress={parseSms}
          disabled={parsing || !smsText.trim()}
          className={`py-4 rounded-2xl items-center ${
            parsing || !smsText.trim()
              ? 'bg-text-muted'
              : 'bg-primary active:opacity-80'
          }`}
        >
          {parsing ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">
              Parse with AI
            </Text>
          )}
        </Pressable>

        {error && (
          <View className="border border-danger rounded-2xl p-4 mt-4">
            <Text className="text-danger text-xs font-semibold uppercase mb-1">
              Error
            </Text>
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {result && <ResultCard result={result} />}
      </View>

      <View className="px-6 pt-2 pb-12">
        <Pressable
          onPress={signOut}
          className="border border-border bg-surface py-3 rounded-2xl items-center active:opacity-80"
        >
          <Text className="text-text-secondary text-sm">Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ResultCard({ result }: { result: ParseResult }) {
  if (!result.valid) {
    return (
      <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
        <Text className="text-xs text-text-muted uppercase mb-1">Result</Text>
        <Text className="text-text-primary font-medium mb-1">
          Not a transaction SMS
        </Text>
        <Text className="text-text-secondary text-sm">
          {result.message ?? 'The AI classified this as non-transactional (OTP, marketing, balance alert, etc.). No row was created.'}
        </Text>
      </View>
    );
  }
  if (result.duplicate) {
    return (
      <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
        <Text className="text-xs text-text-muted uppercase mb-1">Result</Text>
        <Text className="text-text-primary font-medium">
          Already imported (dedup)
        </Text>
        <Text className="text-text-secondary text-sm mt-1">
          A row with this user / amount / merchant / time already exists.
        </Text>
      </View>
    );
  }
  if (!result.transaction) {
    return null;
  }
  const tx = result.transaction;
  const isDebit = tx.transaction_type === 'debit';
  return (
    <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
      <Text className="text-xs text-text-muted uppercase mb-2">
        Parsed transaction
      </Text>
      <Text className="text-3xl font-bold text-text-primary mb-1">
        {isDebit ? '-' : '+'}
        {formatCurrency(tx.amount)}
      </Text>
      <Text className="text-base text-text-primary mb-3">{tx.merchant}</Text>
      <View className="flex-row gap-3">
        <Text className="text-sm text-primary font-medium">{tx.category}</Text>
        <Text className="text-sm text-text-muted">·</Text>
        <Text
          className={`text-sm font-medium ${
            isDebit ? 'text-danger' : 'text-success'
          }`}
        >
          {tx.transaction_type}
        </Text>
        <Text className="text-sm text-text-muted">·</Text>
        <Text className="text-sm text-text-secondary">
          {formatDateIST(tx.transacted_at)}
        </Text>
      </View>
    </View>
  );
}
