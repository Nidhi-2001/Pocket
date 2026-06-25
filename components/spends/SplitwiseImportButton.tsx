import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface SplitwiseImportButtonProps {
  /** Called after a successful import so the host can refetch transactions. */
  onImported?: () => void;
}

interface ImportResult {
  imported: number;
  duplicates: number;
  skipped: number;
  totalExpenses: number;
}

/**
 * Triggers the `splitwise-import` edge function, which pulls the user's
 * Splitwise expenses and stores the portion they PAID as Pocket
 * transactions. Shows a one-line result summary after each run.
 */
export function SplitwiseImportButton({ onImported }: SplitwiseImportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke('splitwise-import', {
      body: {},
    });
    setBusy(false);
    if (error) {
      setMsg("Couldn't import from Splitwise. Try again.");
      return;
    }
    const r = data as ImportResult;
    const parts = [`Imported ${r.imported}`];
    if (r.duplicates > 0) parts.push(`${r.duplicates} already added`);
    setMsg(`${parts.join(' · ')}.`);
    if (r.imported > 0) onImported?.();
  }

  return (
    <View className="mt-3">
      <Pressable
        onPress={run}
        disabled={busy}
        className="flex-row items-center justify-center gap-2 bg-surface border border-border rounded-2xl py-3 active:opacity-80"
      >
        {busy ? (
          <ActivityIndicator size="small" />
        ) : (
          <>
            <Ionicons name="download-outline" size={16} color="#2563EB" />
            <Text className="text-sm font-semibold" style={{ color: '#2563EB' }}>
              Import expenses I paid
            </Text>
          </>
        )}
      </Pressable>
      {msg && (
        <Text className="text-xs text-text-muted text-center mt-2">{msg}</Text>
      )}
    </View>
  );
}
