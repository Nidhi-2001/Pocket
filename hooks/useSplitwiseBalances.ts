import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';

/** One person and how much (in minor units) is owed, in their balance currency. */
export interface OwedItem {
  name: string;
  amountMinor: number;
  currency: string;
}

export interface SplitwiseBalances {
  owe: OwedItem[]; // people the user owes (largest first)
  owedToMe: OwedItem[]; // people who owe the user
  totalOweMinor: number;
  currency: string;
}

interface UseSplitwiseBalancesResult {
  balances: SplitwiseBalances | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches the user's Splitwise balances via the `splitwise-balances` edge
 * function (the Splitwise key stays server-side). Refetches on focus so the
 * Spends screen reflects new splits without a manual reload — same pattern as
 * usePersonality / useNudges.
 */
export function useSplitwiseBalances(): UseSplitwiseBalancesResult {
  const [balances, setBalances] = useState<SplitwiseBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    const { data, error: fnErr } = await supabase.functions.invoke(
      'splitwise-balances',
      { body: {} },
    );
    if (fnErr) {
      console.error('useSplitwiseBalances error:', fnErr);
      setError(fnErr.message ?? 'Failed to load Splitwise balances');
      setBalances(null);
    } else {
      setError(null);
      setBalances(data as SplitwiseBalances);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBalances();
    }, [fetchBalances]),
  );

  return { balances, loading, error, refetch: fetchBalances };
}
