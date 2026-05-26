import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Goal } from '../types';

interface UseGoalsResult {
  goals: Goal[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useGoals(): UseGoalsResult {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('goals')
      .select('*')
      .order('status', { ascending: true }) // 'active' before 'completed'
      .order('created_at', { ascending: false });
    if (err) {
      console.error('useGoals fetch error:', err);
      setError(err.message);
      setLoading(false);
      return;
    }
    setGoals((data as Goal[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchGoals();
    }, [fetchGoals]),
  );

  return { goals, loading, error, refetch: fetchGoals };
}
