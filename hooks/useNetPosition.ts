import { useSplitwiseBalances } from './useSplitwiseBalances';
import { useTransactions } from './useTransactions';

export interface NetPosition {
  totalIncome: number; // all-time credits (minor units)
  totalSpent: number; // all-time debits (includes imported Splitwise "paid")
  netFlow: number; // totalIncome - totalSpent
  oweMinor: number; // total you owe on Splitwise
  owedToMeMinor: number; // total owed to you on Splitwise
  netPosition: number; // netFlow - owe + owedToMe — your true standing
  loading: boolean;
}

/**
 * Cumulative financial standing: all recorded transactions PLUS the live
 * Splitwise balance, in one figure. Both source hooks refetch on focus, so
 * anything that changes a transaction or a split updates this automatically.
 *
 * "Paid" Splitwise expenses are already transactions (counted in spend);
 * "owed" amounts are a liability folded in only at the net-position line, not
 * into spend — matching the rule that owing isn't spending.
 */
export function useNetPosition(): NetPosition {
  const { transactions, loading: txLoading } = useTransactions();
  const { balances, loading: swLoading } = useSplitwiseBalances();

  let totalIncome = 0;
  let totalSpent = 0;
  for (const tx of transactions) {
    if (tx.transaction_type === 'credit') totalIncome += tx.amount;
    else totalSpent += tx.amount;
  }
  const netFlow = totalIncome - totalSpent;

  const oweMinor = balances?.totalOweMinor ?? 0;
  const owedToMeMinor = (balances?.owedToMe ?? []).reduce(
    (sum, item) => sum + item.amountMinor,
    0,
  );
  const netPosition = netFlow - oweMinor + owedToMeMinor;

  return {
    totalIncome,
    totalSpent,
    netFlow,
    oweMinor,
    owedToMeMinor,
    netPosition,
    loading: txLoading || swLoading,
  };
}
