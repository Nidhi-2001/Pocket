import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type Step = 'email' | 'code';

export default function Otp() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!email.includes('@')) {
      setError('Please enter a valid email.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setStep('code');
  }

  async function verify() {
    if (code.length < 6) {
      setError('Enter the code from your email.');
      return;
    }
    setLoading(true);
    setError(null);

    // Try the unified 'email' type first; fall back to 'signup' for brand-new
    // users on Supabase projects that route signup OTPs through that path.
    let result = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    if (result.error) {
      console.log('verifyOtp type=email failed, retrying with type=signup');
      result = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup',
      });
    }

    setLoading(false);
    if (result.error) {
      console.error('verifyOtp final error:', result.error);
      const e = result.error;
      const detail = [e.message, e.status ? `status ${e.status}` : null, e.code]
        .filter(Boolean)
        .join(' • ');
      setError(detail);
      return;
    }
    console.log('verifyOtp success, session:', !!result.data.session);
    router.replace('/setup');
  }

  if (step === 'email') {
    const disabled = loading || !email;
    return (
      <View className="flex-1 bg-background px-6 py-16 justify-between">
        <View className="mt-12">
          <Text className="text-3xl font-bold text-text-primary mb-3">
            What&apos;s your email?
          </Text>
          <Text className="text-base text-text-secondary mb-8">
            We&apos;ll send you a code to sign in.
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="email"
            className="bg-surface border border-border rounded-2xl px-4 py-4 text-lg text-text-primary"
          />
          {error && <Text className="text-danger mt-3 text-sm">{error}</Text>}
        </View>

        <Pressable
          onPress={sendCode}
          disabled={disabled}
          className={`py-4 rounded-2xl items-center ${
            disabled ? 'bg-text-muted' : 'bg-primary active:opacity-80'
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-lg">Send code</Text>
          )}
        </Pressable>
      </View>
    );
  }

  const disabled = loading || code.length < 6;
  return (
    <View className="flex-1 bg-background px-6 py-16 justify-between">
      <View className="mt-12">
        <Text className="text-3xl font-bold text-text-primary mb-3">
          Enter the code
        </Text>
        <Text className="text-base text-text-secondary mb-1">
          We sent a code to
        </Text>
        <Text className="text-base text-text-primary font-semibold mb-8">
          {email}
        </Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 10))}
          placeholder="------"
          placeholderTextColor="#9CA3AF"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={10}
          autoFocus
          className="bg-surface border border-border rounded-2xl px-4 py-4 text-3xl text-text-primary text-center tracking-widest"
        />
        {error && <Text className="text-danger mt-3 text-sm">{error}</Text>}

        <Pressable
          onPress={() => {
            setStep('email');
            setCode('');
            setError(null);
          }}
          className="mt-4 self-center"
        >
          <Text className="text-primary text-sm">Use a different email</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={verify}
        disabled={disabled}
        className={`py-4 rounded-2xl items-center ${
          disabled ? 'bg-text-muted' : 'bg-primary active:opacity-80'
        }`}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold text-lg">
            Verify &amp; sign in
          </Text>
        )}
      </Pressable>
    </View>
  );
}
