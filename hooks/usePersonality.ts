import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Personality } from '../types';

interface UsePersonalityResult {
  personality: Personality | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function usePersonality(): UsePersonalityResult {
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLatest = useCallback(async () => {
    const { data, error } = await supabase
      .from('personalities')
      .select('*')
      .order('month', { ascending: false })
      .limit(1);
    if (error) {
      console.error('usePersonality error:', error);
    }
    const first = (data && data[0]) ?? null;
    setPersonality((first as Personality) ?? null);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLatest();
    }, [fetchLatest]),
  );

  return { personality, loading, refetch: fetchLatest };
}
