import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';

interface UseSplitwiseConnectionResult {
  /** null while loading, then true/false. */
  connected: boolean | null;
  refetch: () => Promise<void>;
}

/**
 * Whether the current user has a stored Splitwise connection. Reads
 * splitwise_connections (RLS scopes it to the user's own row).
 */
export function useSplitwiseConnection(): UseSplitwiseConnectionResult {
  const [connected, setConnected] = useState<boolean | null>(null);

  const fetchStatus = useCallback(async () => {
    const { data, error } = await supabase
      .from('splitwise_connections')
      .select('user_id')
      .maybeSingle();
    if (error) {
      console.error('useSplitwiseConnection error:', error);
    }
    setConnected(!!data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [fetchStatus]),
  );

  return { connected, refetch: fetchStatus };
}
