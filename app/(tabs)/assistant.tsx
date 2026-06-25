import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { supabase } from '../../lib/supabase';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  recorded?: boolean;
}

const SUGGESTIONS = [
  'Coffee at Starbucks 6',
  'Bought medicine at CVS 40',
  'How much did I spend on food this month?',
  'How much do I owe on Splitwise?',
];

/**
 * The Pocket Assistant — a chat interface that both RECORDS transactions and
 * ANSWERS questions, backed by the `assistant` edge function. Opened from the
 * center tab button. Each message is one-shot (record or answer); the thread
 * keeps the visual history.
 */
export default function AssistantTab() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Voice input → drops the transcript into the box (review before send).
  const voice = useVoiceInput((t) =>
    setInput((prev) => (prev ? `${prev} ${t}` : t)),
  );

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setError(null);
    setSending(true);

    const { data, error: err } = await supabase.functions.invoke('assistant', {
      body: { text: trimmed },
    });
    setSending(false);

    if (err) {
      const ctx = (err as { context?: unknown }).context;
      let msg = err.message || String(err);
      if (ctx instanceof Response) {
        const b = await ctx.json().catch(() => null);
        msg = b?.error ?? `HTTP ${ctx.status}`;
      }
      setError(msg);
      return;
    }

    const r = data as { action: 'record' | 'answer'; message: string };
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: r.message, recorded: r.action === 'record' },
    ]);
  }

  return (
    <View className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-3 border-b border-border bg-surface">
        <Text className="text-2xl font-bold text-text-primary">Pocket Assistant</Text>
        <Text className="text-xs text-text-muted mt-0.5">
          Log a spend or income, or ask about your money
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      >
        {messages.length === 0 ? (
          <View className="py-8">
            <Text className="text-5xl text-center mb-4">✨</Text>
            <Text className="text-base text-text-secondary text-center mb-6">
              Tell me what you spent or earned, or ask a question:
            </Text>
            <View className="gap-2">
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
                  className="bg-surface border border-border rounded-2xl px-4 py-3 active:opacity-80"
                >
                  <Text className="text-sm text-text-primary">{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View className="gap-3">
            {messages.map((m, i) => (
              <Bubble key={i} m={m} />
            ))}
            {sending && (
              <View className="flex-row items-center gap-2 self-start bg-surface border border-border rounded-2xl px-4 py-3">
                <ActivityIndicator size="small" />
                <Text className="text-sm text-text-muted">Thinking…</Text>
              </View>
            )}
          </View>
        )}

        {error && (
          <View className="border border-danger rounded-2xl p-4 mt-4">
            <Text className="text-danger text-xs font-semibold uppercase mb-1">Error</Text>
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}
      </ScrollView>

      <View className="px-4 pt-3 pb-4 bg-surface border-t border-border flex-row items-end gap-2">
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Log a spend or ask a question…"
          placeholderTextColor="#9CA3AF"
          multiline
          style={{ textAlignVertical: 'center', maxHeight: 96 }}
          className="flex-1 bg-background border border-border rounded-2xl px-4 py-2 text-sm text-text-primary"
        />
        {voice.supported && (
          <Pressable
            onPress={voice.toggle}
            disabled={voice.busy}
            className="w-11 h-11 rounded-full items-center justify-center border border-border"
            style={{ backgroundColor: voice.recording ? '#F43F5E' : '#FFFFFF' }}
          >
            {voice.busy ? (
              <ActivityIndicator size="small" />
            ) : (
              <Ionicons
                name={voice.recording ? 'stop' : 'mic-outline'}
                size={20}
                color={voice.recording ? '#FFFFFF' : '#4F46E5'}
              />
            )}
          </Pressable>
        )}
        <Pressable
          onPress={() => send(input)}
          disabled={sending || !input.trim()}
          className={`w-11 h-11 rounded-full items-center justify-center ${
            sending || !input.trim() ? 'bg-text-muted' : 'bg-primary active:opacity-80'
          }`}
        >
          <Ionicons name="arrow-up" size={20} color="white" />
        </Pressable>
      </View>
    </View>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.role === 'user') {
    return (
      <View className="self-end max-w-[80%]">
        <View className="px-4 py-3 rounded-2xl bg-primary">
          <Text className="text-white">{m.content}</Text>
        </View>
      </View>
    );
  }
  return (
    <View className="self-start max-w-[85%]">
      <View
        className="px-4 py-3 rounded-2xl border"
        style={{
          backgroundColor: m.recorded ? '#10B98112' : '#FFFFFF',
          borderColor: m.recorded ? '#10B98140' : '#E5E7EB',
        }}
      >
        <Text className="text-text-primary">
          {m.recorded ? '✅ ' : ''}
          {m.content}
        </Text>
      </View>
    </View>
  );
}
