import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Transaction } from '../types';

interface UseTransactionsOptions {
  /** Cap on rows returned. Omit for no cap. */
  limit?: number;
  /** Only return transactions in the current calendar month. */
  monthOnly?: boolean;
  /** Only return debits (excludes credits like salary). */
  debitsOnly?: boolean;
  /** Explicit lower bound on transacted_at. Overrides monthOnly. */
  since?: Date | null;
  /** Explicit upper bound on transacted_at. */
  until?: Date | null;
}

interface UseTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTransactions(
  opts: UseTransactionsOptions = {},
): UseTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { limit, monthOnly, debitsOnly, since, until } = opts;
  // useFocusEffect needs stable deps — serialize Dates to ms timestamps.
  const sinceMs = since ? since.getTime() : null;
  const untilMs = until ? until.getTime() : null;

  const fetchTxs = useCallback(async () => {
    setError(null);
    let q = supabase
      .from('transactions')
      .select('*')
      .order('transacted_at', { ascending: false });

    if (sinceMs !== null) {
      q = q.gte('transacted_at', new Date(sinceMs).toISOString());
    } else if (monthOnly) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      q = q.gte('transacted_at', monthStart.toISOString());
    }
    if (untilMs !== null) {
      q = q.lte('transacted_at', new Date(untilMs).toISOString());
    }
    if (debitsOnly) {
      q = q.eq('transaction_type', 'debit');
    }
    if (limit) {
      q = q.limit(limit);
    }

    const { data, error: err } = await q;
    if (err) {
      console.error('useTransactions fetch error:', err);
      setError(err.message);
      setLoading(false);
      return;
    }
    setTransactions((data as Transaction[]) ?? []);
    setLoading(false);
  }, [limit, monthOnly, debitsOnly, sinceMs, untilMs]);

  // Re-fetch whenever the host screen gains focus. Fires on initial mount
  // and again every time the user navigates back from a detail screen, so
  // edits made in /transaction/[id] surface immediately on Home / Spends.
  useFocusEffect(
    useCallback(() => {
      fetchTxs();
    }, [fetchTxs]),
  );

  return { transactions, loading, error, refetch: fetchTxs };
}
