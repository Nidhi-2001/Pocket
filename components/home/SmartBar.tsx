import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface SmartBarProps {
  /** Called after a transaction is recorded, so Home can refresh. */
  onRecorded: () => void;
}

interface AssistantResult {
  action: 'record' | 'answer';
  message: string;
}

/**
 * One natural-language bar that does everything: type "lunch 12" or "got paid
 * 5000" to record a transaction, or ask "how much did I spend on food?" to get
 * a grounded answer. Routes to the `assistant` edge function which decides
 * intent, records (server-side) or answers, and returns a message.
 */
export function SmartBar({ onRecorded }: SmartBarProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssistantResult | null>(null);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke('assistant', {
      body: { text: trimmed },
    });
    setBusy(false);
    if (error) {
      setResult({ action: 'answer', message: "Sorry, I couldn't process that — try again." });
      return;
    }
    const r = data as AssistantResult;
    setResult(r);
    setText('');
    if (r.action === 'record') onRecorded();
  }

  const canSend = !!text.trim() && !busy;

  return (
    <View>
      <View className="flex-row items-end bg-surface border border-border rounded-2xl px-3 py-1.5">
        <Ionicons name="sparkles" size={18} color="#4F46E5" style={{ marginBottom: 10 }} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="How can I help? Log a spend or ask a question…"
          placeholderTextColor="#9CA3AF"
          editable={!busy}
          onSubmitEditing={submit}
          returnKeyType="send"
          multiline
          className="flex-1 px-2 py-2 text-base text-text-primary"
        />
        <Pressable
          onPress={submit}
          disabled={!canSend}
          className="w-9 h-9 rounded-full items-center justify-center mb-0.5"
          style={{ backgroundColor: canSend ? '#4F46E5' : '#C7D2FE' }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="arrow-up" size={18} color="white" />
          )}
        </Pressable>
      </View>

      {result && (
        <View
          className="mt-2 rounded-2xl p-3 flex-row gap-2 border border-border"
          style={{ backgroundColor: result.action === 'record' ? '#10B98112' : '#FFFFFF' }}
        >
          <Text className="text-base">{result.action === 'record' ? '✅' : '💬'}</Text>
          <Text className="flex-1 text-sm text-text-primary leading-relaxed">
            {result.message}
          </Text>
        </View>
      )}
    </View>
  );
}
