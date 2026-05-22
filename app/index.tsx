import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

type ConnectionStatus = 'checking' | 'ok' | 'error';

export default function Home() {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [message, setMessage] = useState('Pinging Supabase...');

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .then(({ error }) => {
        if (error) {
          setStatus('error');
          setMessage(`Connection failed: ${error.message}`);
        } else {
          setStatus('ok');
          setMessage('Connected to Supabase ✓');
        }
      });
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-background p-6">
      <Text className="text-3xl font-bold text-text-primary mb-2">Pocket</Text>
      <Text className="text-base text-text-secondary mb-10">
        Your money, finally explained
      </Text>
      <Text
        className={
          status === 'ok'
            ? 'text-success font-semibold'
            : status === 'error'
              ? 'text-danger font-semibold'
              : 'text-text-muted'
        }
      >
        {message}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}
