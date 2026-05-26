import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface UseProfileResult {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
}

export function useProfile(): UseProfileResult {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .single()
      .then(({ data, error: err }) => {
        if (err) {
          console.error('useProfile fetch error:', err);
          setError(err.message);
        } else {
          setProfile((data as Profile) ?? null);
        }
        setLoading(false);
      });
  }, []);

  return { profile, loading, error };
}
