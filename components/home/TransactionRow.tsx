import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { categories } from '../../constants/theme';
import { formatCurrency, formatDateIST } from '../../lib/formatters';
import type { Transaction } from '../../types';

interface TransactionRowProps {
  tx: Transaction;
}

export function TransactionRow({ tx }: TransactionRowProps) {
  const meta = categories[tx.category];
  const isDebit = tx.transaction_type === 'debit';
  return (
    <Link href={`/transaction/${tx.id}`} asChild>
      <Pressable className="flex-row items-center bg-surface border border-border rounded-2xl p-4 active:opacity-80">
        <View
          className="w-11 h-11 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: meta.color + '22' }}
        >
          <Text className="text-xl">{meta.emoji}</Text>
        </View>
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-medium text-text-primary mb-0.5"
            numberOfLines={1}
          >
            {tx.merchant}
          </Text>
          <Text className="text-xs text-text-muted" numberOfLines={1}>
            {tx.category} · {formatDateIST(tx.transacted_at, 'd MMM, h:mm a')}
          </Text>
        </View>
        <Text
          className={`text-base font-semibold ${
            isDebit ? 'text-text-primary' : 'text-success'
          }`}
        >
          {isDebit ? '-' : '+'}
          {formatCurrency(tx.amount)}
        </Text>
      </Pressable>
    </Link>
  );
}
