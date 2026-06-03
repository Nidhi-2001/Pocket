import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { categories, type CategoryKey } from '../../constants/theme';
import { useCurrency } from '../../hooks/useCurrency';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { supabase } from '../../lib/supabase';
import type { Transaction } from '../../types';

const CATEGORY_KEYS = Object.keys(categories) as CategoryKey[];

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currency = useCurrency();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [editingCategory, setEditingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setTx(data as Transaction);
        setLoading(false);
      });
  }, [id]);

  async function changeCategory(newCat: CategoryKey) {
    if (!tx || newCat === tx.category) {
      setEditingCategory(false);
      return;
    }
    setUpdating(true);
    const { data, error: err } = await supabase
      .from('transactions')
      .update({ category: newCat })
      .eq('id', tx.id)
      .select()
      .single();
    setUpdating(false);
    setEditingCategory(false);
    if (err) {
      setError(err.message);
      return;
    }
    setTx(data as Transaction);
  }

  async function performDelete() {
    if (!tx) return;
    const { error: err } = await supabase
      .from('transactions')
      .delete()
      .eq('id', tx.id);
    if (err) {
      setError(err.message);
      return;
    }
    router.back();
  }

  function confirmDelete() {
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this transaction permanently?')) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Delete transaction',
        'This will permanently remove the transaction. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: performDelete,
          },
        ],
      );
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (!tx) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-lg font-semibold text-text-primary mb-2">
          Transaction not found
        </Text>
        <Text className="text-sm text-text-secondary text-center mb-6">
          {error ?? 'It may have been deleted, or you don’t have access.'}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="bg-primary px-6 py-3 rounded-2xl active:opacity-80"
        >
          <Text className="text-white font-medium">Back</Text>
        </Pressable>
      </View>
    );
  }

  const meta = categories[tx.category as CategoryKey];
  const isDebit = tx.transaction_type === 'debit';

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-14 pb-4 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center -ml-2 active:opacity-80"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <Text className="text-base text-text-secondary ml-1">
          Transaction
        </Text>
      </View>

      <View className="px-6 pt-2 pb-8 items-center">
        <View
          className="w-16 h-16 rounded-full items-center justify-center mb-4"
          style={{ backgroundColor: meta.color + '22' }}
        >
          <Text className="text-3xl">{meta.emoji}</Text>
        </View>
        <Text
          className={`text-4xl font-bold mb-2 ${
            isDebit ? 'text-text-primary' : 'text-success'
          }`}
        >
          {isDebit ? '-' : '+'}
          {formatCurrency(tx.amount, currency)}
        </Text>
        <Text className="text-lg text-text-secondary">{tx.merchant}</Text>
      </View>

      <View className="px-6 mb-3">
        <View className="bg-surface border border-border rounded-2xl">
          <Field label="Category" value={tx.category}>
            {editingCategory ? (
              <View className="flex-row flex-wrap gap-2 mt-3">
                {CATEGORY_KEYS.map((cat) => {
                  const m = categories[cat];
                  const selected = cat === tx.category;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => changeCategory(cat)}
                      disabled={updating}
                      className="flex-row items-center gap-1 px-3 py-2 rounded-xl border"
                      style={{
                        backgroundColor: selected ? m.color + '22' : 'transparent',
                        borderColor: selected ? m.color : '#E5E7EB',
                      }}
                    >
                      <Text>{m.emoji}</Text>
                      <Text
                        className="text-sm font-medium"
                        style={{ color: selected ? m.color : '#374151' }}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Pressable
                onPress={() => setEditingCategory(true)}
                className="mt-1 active:opacity-80"
              >
                <Text className="text-sm text-primary font-medium">Change</Text>
              </Pressable>
            )}
          </Field>
          <View className="h-px bg-border mx-4" />
          <Field
            label="Type"
            value={tx.transaction_type === 'debit' ? 'Debit (money out)' : 'Credit (money in)'}
          />
          <View className="h-px bg-border mx-4" />
          <Field label="When" value={formatDate(tx.transacted_at)} />
        </View>
      </View>

      {tx.raw_sms && (
        <View className="px-6 mb-3">
          <Text className="text-xs text-text-muted uppercase mb-2 font-semibold tracking-wider">
            Original SMS
          </Text>
          <View className="bg-surface border border-border rounded-2xl p-4">
            <Text className="text-sm text-text-secondary leading-relaxed">
              {tx.raw_sms}
            </Text>
          </View>
        </View>
      )}

      {error && (
        <View className="px-6 mb-3">
          <Text className="text-danger text-sm">{error}</Text>
        </View>
      )}

      <View className="px-6 pt-6 pb-12">
        <Pressable
          onPress={confirmDelete}
          className="flex-row items-center justify-center gap-2 border border-danger py-4 rounded-2xl active:opacity-80"
        >
          <Ionicons name="trash-outline" size={18} color="#F43F5E" />
          <Text className="text-danger font-medium">Delete transaction</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

interface FieldProps {
  label: string;
  value: string;
  children?: React.ReactNode;
}

function Field({ label, value, children }: FieldProps) {
  return (
    <View className="p-4">
      <Text className="text-xs text-text-muted uppercase mb-1 font-semibold tracking-wider">
        {label}
      </Text>
      <Text className="text-base text-text-primary font-medium">{value}</Text>
      {children}
    </View>
  );
}
