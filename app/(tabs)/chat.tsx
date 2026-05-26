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
import { supabase } from '../../lib/supabase';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'How am I doing against my budget?',
  'What did I spend on food this month?',
  'What was my biggest transaction?',
  'Where did most of my money go?',
];

export default function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Auto-scroll to bottom on new messages or typing-indicator changes.
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setError(null);
    setSending(true);

    const { data, error: err } = await supabase.functions.invoke('chat-agent', {
      body: { messages: next },
    });
    setSending(false);

    if (err) {
      const ctx = (err as { context?: unknown }).context;
      if (ctx instanceof Response) {
        const body = await ctx.json().catch(() => null);
        setError(body?.error ?? `HTTP ${ctx.status}`);
      } else {
        setError(err.message || String(err));
      }
      return;
    }

    if (data?.message?.content) {
      setMessages([...next, data.message as ChatMessage]);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-3 border-b border-border bg-surface">
        <Text className="text-2xl font-bold text-text-primary">
          Chat with Pocket
        </Text>
        <Text className="text-xs text-text-muted mt-0.5">
          Grounded in your actual transactions
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      >
        {messages.length === 0 ? (
          <View className="py-8">
            <Text className="text-5xl text-center mb-4">💬</Text>
            <Text className="text-base text-text-secondary text-center mb-6">
              Ask me anything about your money. Try one of these:
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
              <MessageBubble key={i} message={m} />
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
            <Text className="text-danger text-xs font-semibold uppercase mb-1">
              Error
            </Text>
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}
      </ScrollView>

      <View className="px-4 pt-3 pb-4 bg-surface border-t border-border flex-row items-end gap-2">
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your money…"
          placeholderTextColor="#9CA3AF"
          multiline
          style={{ textAlignVertical: 'center', maxHeight: 96 }}
          className="flex-1 bg-background border border-border rounded-2xl px-4 py-2 text-sm text-text-primary"
        />
        <Pressable
          onPress={() => send(input)}
          disabled={sending || !input.trim()}
          className={`w-11 h-11 rounded-full items-center justify-center ${
            sending || !input.trim()
              ? 'bg-text-muted'
              : 'bg-primary active:opacity-80'
          }`}
        >
          <Ionicons name="arrow-up" size={20} color="white" />
        </Pressable>
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View
      className={isUser ? 'self-end max-w-[80%]' : 'self-start max-w-[85%]'}
    >
      <View
        className={`px-4 py-3 rounded-2xl ${
          isUser ? 'bg-primary' : 'bg-surface border border-border'
        }`}
      >
        <Text className={isUser ? 'text-white' : 'text-text-primary'}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}
