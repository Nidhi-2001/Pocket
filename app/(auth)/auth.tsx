import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type Mode = 'login' | 'signup' | 'reset';
type Step = 'form' | 'code' | 'newpw';

const MIN_PASSWORD = 8;

/**
 * Combined auth screen.
 *  - Sign up: email + password + confirm → supabase.auth.signUp → a 6-digit
 *    code is emailed (Confirm-signup template) → verifyOtp(type:'signup').
 *  - Log in: email + password → signInWithPassword. A "code instead" link
 *    falls back to passwordless OTP so existing/forgotten-password users get in.
 *  - Reset: "Forgot password?" → resetPasswordForEmail emails a recovery code →
 *    verifyOtp(type:'recovery') → set a new password via updateUser.
 *
 * NOTE: every emailed code (signup, login fallback, reset) relies on real email
 * delivery — set up SMTP (see PRE_DEPLOY.md) so Gmail doesn't drop them. The
 * "Reset Password" and "Confirm signup" Supabase templates must contain
 * {{ .Token }} so the code appears in the email body.
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
  const [resendIn, setResendIn] = useState(0); // seconds until "Resend code" re-enables

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

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
    setResendIn(15);
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
    setResendIn(15);
    setInfo('We emailed you a sign-in code.');
  }

  async function sendResetCode() {
    resetMessages();
    if (!email.includes('@')) return setError('Enter your email first.');
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (err) return setError(err.message);
    setCodeContext('reset');
    setStep('code');
    setResendIn(15);
    setInfo('We emailed you a password-reset code.');
  }

  async function resendCode() {
    if (loading || resendIn > 0) return;
    resetMessages();
    setLoading(true);
    const res =
      codeContext === 'signup'
        ? await supabase.auth.resend({ type: 'signup', email })
        : codeContext === 'reset'
          ? await supabase.auth.resetPasswordForEmail(email)
          : await supabase.auth.signInWithOtp({
              email,
              options: { shouldCreateUser: false },
            });
    setLoading(false);
    if (res.error) return setError(res.error.message);
    setResendIn(15);
    setInfo('Code re-sent — check your email (and spam).');
  }

  async function verifyCode() {
    resetMessages();
    if (code.length < 6) return setError('Enter the code from your email.');
    setLoading(true);

    // Signup → 'signup'; reset → 'recovery'; passwordless login → 'email'/'magiclink'.
    const types =
      codeContext === 'signup'
        ? (['signup', 'email'] as const)
        : codeContext === 'reset'
          ? (['recovery'] as const)
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
    // Reset: the recovery session is now active — collect a new password.
    if (codeContext === 'reset') {
      setPassword('');
      setConfirm('');
      setStep('newpw');
      setInfo('Code verified — choose a new password.');
      return;
    }
    goToNext();
  }

  async function updatePassword() {
    resetMessages();
    if (password.length < MIN_PASSWORD)
      return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError('Passwords don’t match.');
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) return setError(err.message);
    goToNext();
  }

  // ---- Code step ----------------------------------------------------------
  if (step === 'code') {
    const disabled = loading || code.length < 6;
    const isReset = codeContext === 'reset';
    return (
      <View className="flex-1 bg-background px-6 py-16 justify-between">
        <View className="mt-12">
          <Text className="text-3xl font-extrabold text-text-primary mb-3 tracking-tight">
            {isReset ? 'Reset your password' : 'Verify your email'}
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

          <View className="mt-5 items-center gap-3">
            <Pressable
              onPress={resendCode}
              disabled={loading || resendIn > 0}
              className="active:opacity-70"
            >
              <Text
                className={`text-sm font-medium ${resendIn > 0 ? 'text-text-muted' : 'text-primary'}`}
              >
                {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setStep('form');
                setCode('');
                resetMessages();
              }}
              className="active:opacity-70"
            >
              <Text className="text-text-secondary text-sm">Use a different email</Text>
            </Pressable>
          </View>
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
              {isReset ? 'Verify code' : 'Verify & continue'}
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  // ---- New-password step (after reset code verified) ----------------------
  if (step === 'newpw') {
    const disabled = loading || password.length < MIN_PASSWORD || !confirm;
    return (
      <View className="flex-1 bg-background px-6 py-16 justify-between">
        <View className="mt-12">
          <Text className="text-3xl font-extrabold text-text-primary mb-3 tracking-tight">
            Choose a new password
          </Text>
          <Text className="text-base text-text-secondary mb-8">
            Pick something you’ll remember — at least {MIN_PASSWORD} characters.
          </Text>

          <View className="flex-row items-center bg-surface border border-border rounded-2xl px-4 mb-4">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="New password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
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
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Confirm new password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPw}
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-surface border border-border rounded-2xl px-4 py-4 text-base text-text-primary"
          />
          {error && <Text className="text-danger mt-3 text-sm">{error}</Text>}
        </View>

        <Pressable
          onPress={updatePassword}
          disabled={disabled}
          className={`py-4 rounded-2xl items-center ${
            disabled ? 'bg-text-muted' : 'bg-primary active:opacity-80'
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-lg">Update password</Text>
          )}
        </Pressable>
      </View>
    );
  }

  // ---- Form step (login / signup / reset) ---------------------------------
  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';
  const formDisabled =
    loading ||
    !email ||
    (!isReset && !password) ||
    (isSignup && (!confirm || password.length < MIN_PASSWORD));

  const title = isReset
    ? 'Reset your password'
    : isSignup
      ? 'Create your account'
      : 'Welcome back';
  const subtitle = isReset
    ? 'Enter your email and we’ll send you a reset code.'
    : isSignup
      ? 'Sign up to start tracking your money.'
      : 'Log in to pick up where you left off.';

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 80, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode toggle (hidden during reset) */}
        {!isReset ? (
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
        ) : (
          <Pressable onPress={() => switchMode('login')} className="mb-8 self-start active:opacity-70">
            <Text className="text-primary text-sm">← Back to log in</Text>
          </Pressable>
        )}

        <Text className="text-3xl font-extrabold text-text-primary mb-2 tracking-tight">
          {title}
        </Text>
        <Text className="text-base text-text-secondary mb-8">{subtitle}</Text>

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

        {!isReset && (
          <>
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
          </>
        )}

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
          onPress={isReset ? sendResetCode : isSignup ? handleSignUp : handleLogin}
          disabled={formDisabled}
          className={`mt-6 py-4 rounded-2xl items-center ${
            formDisabled ? 'bg-text-muted' : 'bg-primary active:opacity-80'
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-lg">
              {isReset ? 'Send reset code' : isSignup ? 'Create account' : 'Log in'}
            </Text>
          )}
        </Pressable>

        {mode === 'login' && (
          <View className="mt-4 items-center gap-3">
            <Pressable onPress={sendLoginCode} disabled={loading} className="active:opacity-80">
              <Text className="text-primary text-sm">Email me a sign-in code instead</Text>
            </Pressable>
            <Pressable onPress={() => switchMode('reset')} className="active:opacity-80">
              <Text className="text-text-secondary text-sm">Forgot password?</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
