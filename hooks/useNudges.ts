import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Nudge } from '../types';

interface UseNudgesResult {
  nudges: Nudge[];
  loading: boolean;
  refetch: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
}

export function useNudges(): UseNudgesResult {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNudges = useCallback(async () => {
    const { data, error } = await supabase
      .from('nudges')
      .select('*')
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) {
      console.error('useNudges error:', error);
    }
    setNudges((data as Nudge[]) ?? []);
    setLoading(false);
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      await supabase.from('nudges').update({ read: true }).eq('id', id);
      setNudges((prev) => prev.filter((n) => n.id !== id));
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      fetchNudges();
    }, [fetchNudges]),
  );

  return { nudges, loading, refetch: fetchNudges, markRead };
}
