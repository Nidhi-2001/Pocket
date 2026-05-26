import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Transaction } from '../types';

interface UseTransactionsOptions {
  /** Cap on rows returned. Omit for no cap. */
  limit?: number;
  /** Only return transactions in the current calendar month (IST). */
  monthOnly?: boolean;
  /** Only return debits (excludes credits like salary). */
  debitsOnly?: boolean;
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

  const { limit, monthOnly, debitsOnly } = opts;

  const fetchTxs = useCallback(async () => {
    setError(null);
    let q = supabase
      .from('transactions')
      .select('*')
      .order('transacted_at', { ascending: false });

    if (monthOnly) {
      // Month start in IST. JS Date constructed from local components, then
      // shifted: the user's device is on their local TZ but our DB stores
      // timestamptz, so a simple `getFullYear/getMonth` on the device-local
      // date is fine for "this calendar month" — Supabase compares the UTC
      // instant.
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      q = q.gte('transacted_at', monthStart.toISOString());
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
  }, [limit, monthOnly, debitsOnly]);

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
