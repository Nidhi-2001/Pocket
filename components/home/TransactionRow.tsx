import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useCurrency } from '../../hooks/useCurrency';
import { categories, shadows } from '../../constants/theme';
import { formatCurrency, formatDate } from '../../lib/formatters';
import type { Transaction } from '../../types';

interface TransactionRowProps {
  tx: Transaction;
}

export function TransactionRow({ tx }: TransactionRowProps) {
  const currency = useCurrency();
  const meta = categories[tx.category];
  const isDebit = tx.transaction_type === 'debit';
  return (
    <Link href={`/transaction/${tx.id}`} asChild>
      <Pressable
        className="flex-row items-center bg-surface rounded-2xl p-4 active:opacity-70"
        style={shadows.sm}
      >
        <View
          className="w-12 h-12 rounded-2xl items-center justify-center mr-3"
          style={{ backgroundColor: meta.color + '1F' }}
        >
          <Text className="text-xl">{meta.emoji}</Text>
        </View>
        <View className="flex-1 mr-3">
          <Text
            className="text-[15px] font-semibold text-text-primary mb-0.5"
            numberOfLines={1}
          >
            {tx.merchant}
          </Text>
          <Text className="text-xs text-text-muted" numberOfLines={1}>
            {tx.category} · {formatDate(tx.transacted_at)}
          </Text>
        </View>
        <Text
          className={`text-[15px] font-bold ${
            isDebit ? 'text-text-primary' : 'text-success'
          }`}
        >
          {isDebit ? '-' : '+'}
          {formatCurrency(tx.amount, currency)}
        </Text>
      </Pressable>
    </Link>
  );
}
