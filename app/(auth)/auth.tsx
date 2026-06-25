import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type Mode = 'login' | 'signup';
type Step = 'form' | 'code';

const MIN_PASSWORD = 8;

/**
 * Combined auth screen.
 *  - Sign up: email + password + confirm → supabase.auth.signUp → a 6-digit
 *    code is emailed (Confirm-signup template) → verifyOtp(type:'signup').
 *  - Log in: email + password → signInWithPassword. A "code instead" link
 *    falls back to passwordless OTP so existing/forgotten-password users still
 *    get in.
 *
 * NOTE: signup verification + the code fallback both rely on email actually
 * being delivered — set up real SMTP (see PRE_DEPLOY.md) so Gmail doesn't drop
 * the code.
 */
export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'login' ? 'login' : 'signup');
  const [step, setStep] = useState<Step>('form');
  const [codeContext, setCodeContext] = useState<Mode>('signup');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function resetMessages() {
    setError(null);
    setInfo(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep('form');
    setPassword('');
    setConfirm('');
    setCode('');
    resetMessages();
  }

  // After any successful authentication, send new users to profile setup and
  // returning users straight to the dashboard.
  async function goToNext() {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .maybeSingle();
    const onboarded = !!profile?.name && profile.name !== 'there';
    router.replace(onboarded ? '/(tabs)/' : '/setup');
  }

  async function handleSignUp() {
    resetMessages();
    if (!email.includes('@')) return setError('Please enter a valid email.');
    if (password.length < MIN_PASSWORD)
      return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError('Passwords don’t match.');

    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (err) return setError(err.message);

    // Supabase returns a user with empty identities when the email already
    // exists (anti-enumeration) — nudge them to log in instead.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      switchMode('login');
      return setInfo('This email already has an account — log in instead.');
    }
    // Confirmations off → already signed in. Otherwise verify the emailed code.
    if (data.session) return goToNext();
    setCodeContext('signup');
    setStep('code');
    setInfo('We emailed you a 6-digit verification code.');
  }

  async function handleLogin() {
    resetMessages();
    if (!email.includes('@')) return setError('Please enter a valid email.');
    if (!password) return setError('Enter your password.');

    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) return setError(err.message);
    goToNext();
  }

  async function sendLoginCode() {
    resetMessages();
    if (!email.includes('@')) return setError('Enter your email first.');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (err) return setError(err.message);
    setCodeContext('login');
    setStep('code');
    setInfo('We emailed you a sign-in code.');
  }

  async function verifyCode() {
    resetMessages();
    if (code.length < 6) return setError('Enter the code from your email.');
    setLoading(true);

    // Signup codes verify as 'signup'; passwordless login codes as
    // 'email'/'magiclink'. Try the relevant types in order.
    const types =
      codeContext === 'signup'
        ? (['signup', 'email'] as const)
        : (['email', 'magiclink'] as const);
    let result: Awaited<ReturnType<typeof supabase.auth.verifyOtp>> | null = null;
    for (const t of types) {
      result = await supabase.auth.verifyOtp({ email, token: code, type: t });
      if (!result.error) break;
    }
    setLoading(false);

    if (!result || result.error) {
      return setError(result?.error?.message || 'Verification failed.');
    }
    goToNext();
  }

  // ---- Code step ----------------------------------------------------------
  if (step === 'code') {
    const disabled = loading || code.length < 6;
    return (
      <View className="flex-1 bg-background px-6 py-16 justify-between">
        <View className="mt-12">
          <Text className="text-3xl font-extrabold text-text-primary mb-3 tracking-tight">
            Verify your email
          </Text>
          <Text className="text-base text-text-secondary mb-1">
            Enter the code we sent to
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
          {info && !error && (
            <Text className="text-text-secondary mt-3 text-sm">{info}</Text>
          )}

          <Pressable
            onPress={() => {
              setStep('form');
              setCode('');
              resetMessages();
            }}
            className="mt-4 self-center"
          >
            <Text className="text-primary text-sm">Use a different email</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={verifyCode}
          disabled={disabled}
          className={`py-4 rounded-2xl items-center ${
            disabled ? 'bg-text-muted' : 'bg-primary active:opacity-80'
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-lg">
              Verify &amp; continue
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  // ---- Form step (login / signup) ----------------------------------------
  const isSignup = mode === 'signup';
  const disabled =
    loading ||
    !email ||
    !password ||
    (isSignup && (!confirm || password.length < MIN_PASSWORD));

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 80, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode toggle */}
        <View className="flex-row bg-surface-soft rounded-2xl p-1 gap-1 mb-8">
          {(['login', 'signup'] as const).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => switchMode(m)}
                className={`flex-1 py-2.5 rounded-xl items-center active:opacity-80 ${
                  active ? 'bg-primary' : ''
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    active ? 'text-white' : 'text-text-secondary'
                  }`}
                >
                  {m === 'login' ? 'Log in' : 'Sign up'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="text-3xl font-extrabold text-text-primary mb-2 tracking-tight">
          {isSignup ? 'Create your account' : 'Welcome back'}
        </Text>
        <Text className="text-base text-text-secondary mb-8">
          {isSignup
            ? 'Sign up to start tracking your money.'
            : 'Log in to pick up where you left off.'}
        </Text>

        <Text className="text-sm font-medium text-text-secondary mb-1.5">Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="email"
          className="bg-surface border border-border rounded-2xl px-4 py-4 text-base text-text-primary mb-4"
        />

        <Text className="text-sm font-medium text-text-secondary mb-1.5">Password</Text>
        <View className="flex-row items-center bg-surface border border-border rounded-2xl px-4 mb-4">
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={isSignup ? `At least ${MIN_PASSWORD} characters` : 'Your password'}
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPw}
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 py-4 text-base text-text-primary"
          />
          <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8} className="active:opacity-60">
            <Ionicons
              name={showPw ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#94A3B8"
            />
          </Pressable>
        </View>

        {isSignup && (
          <>
            <Text className="text-sm font-medium text-text-secondary mb-1.5">
              Confirm password
            </Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Re-enter your password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              className="bg-surface border border-border rounded-2xl px-4 py-4 text-base text-text-primary mb-4"
            />
          </>
        )}

        {error && <Text className="text-danger mt-1 text-sm">{error}</Text>}
        {info && !error && (
          <Text className="text-text-secondary mt-1 text-sm">{info}</Text>
        )}

        <Pressable
          onPress={isSignup ? handleSignUp : handleLogin}
          disabled={disabled}
          className={`mt-6 py-4 rounded-2xl items-center ${
            disabled ? 'bg-text-muted' : 'bg-primary active:opacity-80'
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-lg">
              {isSignup ? 'Create account' : 'Log in'}
            </Text>
          )}
        </Pressable>

        {!isSignup && (
          <Pressable onPress={sendLoginCode} disabled={loading} className="mt-4 self-center">
            <Text className="text-primary text-sm">Email me a sign-in code instead</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
