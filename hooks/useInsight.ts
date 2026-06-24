import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Insight } from '../types';

interface UseInsightResult {
  insight: Insight | null;
  loading: boolean;
  dismiss: () => Promise<void>;
}

/**
 * Loads today's proactive insight via the `generate-insights` edge function.
 * The function is idempotent: it returns today's insight if it exists, or
 * generates one (a single Groq call) on the first open of the day. Returns
 * null when there isn't enough data yet (→ Home shows a placeholder).
 */
export function useInsight(): UseInsightResult {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('generate-insights', {
      body: {},
    });
    if (error) {
      console.error('useInsight error:', error);
      setInsight(null);
    } else {
      setInsight((data as { insight: Insight | null })?.insight ?? null);
    }
    setLoading(false);
  }, []);

  const dismiss = useCallback(async () => {
    if (!insight) return;
    const id = insight.id;
    setInsight(null); // optimistic
    await supabase.from('insights').update({ dismissed: true }).eq('id', id);
  }, [insight]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { insight, loading, dismiss };
}
