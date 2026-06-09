import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { CategoryBudget } from '../types';

interface UseCategoryBudgetsResult {
  budgets: CategoryBudget[];
  byCategory: Record<string, number>; // category → budget_amount
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useCategoryBudgets(): UseCategoryBudgetsResult {
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBudgets = useCallback(async () => {
    const { data, error } = await supabase
      .from('category_budgets')
      .select('*');
    if (error) {
      console.error('useCategoryBudgets fetch error:', error);
      setLoading(false);
      return;
    }
    setBudgets((data as CategoryBudget[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBudgets();
    }, [fetchBudgets]),
  );

  const byCategory: Record<string, number> = {};
  for (const b of budgets) {
    byCategory[b.category] = b.budget_amount;
  }

  return { budgets, byCategory, loading, refetch: fetchBudgets };
}
