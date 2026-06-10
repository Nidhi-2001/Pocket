import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CategoryBudgetsCard } from '../../components/profile/CategoryBudgetsCard';
import { SplitwiseConnectCard } from '../../components/profile/SplitwiseConnectCard';
import { CurrencyDropdown } from '../../components/ui/CurrencyDropdown';
import {
  type CurrencyCode,
  getCurrency,
  majorToMinor,
  minorToMajor,
} from '../../lib/currency';
import { formatCurrency } from '../../lib/formatters';
import { supabase } from '../../lib/supabase';

interface ProfileRow {
  name: string;
  monthly_budget: number;
  expected_monthly_income: number;
  currency: string;
}

export default function ProfileTab() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCurrency, setEditCurrency] = useState<CurrencyCode>('USD');
  const [editBudget, setEditBudget] = useState('');
  const [editIncome, setEditIncome] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from('profiles')
      .select('name, monthly_budget, expected_monthly_income, currency')
      .maybeSingle();
    if (data) setProfile(data as ProfileRow);
    const { data: u } = await supabase.auth.getUser();
    setEmail(u.user?.email ?? null);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit() {
    if (!profile) return;
    setEditName(profile.name);
    setEditCurrency((profile.currency as CurrencyCode) ?? 'USD');
    setEditBudget(
      String(Math.round(minorToMajor(profile.monthly_budget, profile.currency))),
    );
    setEditIncome(
      profile.expected_monthly_income > 0
        ? String(
            Math.round(
              minorToMajor(profile.expected_monthly_income, profile.currency),
            ),
          )
        : '',
    );
    setError(null);
    setEditing(true);
  }

  async function saveEdit() {
    const budgetMajor = parseInt(editBudget, 10);
    if (!editName.trim() || !budgetMajor || budgetMajor < 1) {
      setError('Name and a valid budget are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setError('Not signed in.');
      return;
    }
    const incomeMajor = editIncome ? parseInt(editIncome, 10) : 0;
    const { error: err } = await supabase
      .from('profiles')
      .update({
        name: editName.trim(),
        currency: editCurrency,
        monthly_budget: majorToMinor(budgetMajor, editCurrency),
        expected_monthly_income: incomeMajor
          ? majorToMinor(incomeMajor, editCurrency)
          : 0,
      })
      .eq('id', user.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditing(false);
    load();
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const cur = profile ? getCurrency(profile.currency) : getCurrency('USD');
  const editCur = getCurrency(editCurrency);

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-4 flex-row items-center justify-between">
        <Text className="text-3xl font-bold text-text-primary">Profile</Text>
        {!editing && profile && (
          <Pressable
            onPress={startEdit}
            className="flex-row items-center gap-1 px-3 py-2 bg-surface border border-border rounded-xl active:opacity-80"
          >
            <Ionicons name="pencil-outline" size={14} color="#4F46E5" />
            <Text className="text-sm text-primary font-medium">Edit</Text>
          </Pressable>
        )}
      </View>

      <View className="px-6 pb-6">
        {editing ? (
          <View className="bg-surface border border-border rounded-2xl p-5">
            <Text className="text-xs text-text-secondary mb-1">Name</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              className="bg-background border border-border rounded-xl px-3 py-2 text-base text-text-primary mb-4"
            />

            <Text className="text-xs text-text-secondary mb-1">Currency</Text>
            <CurrencyDropdown value={editCurrency} onChange={setEditCurrency} />

            <Text className="text-xs text-text-secondary mb-1 mt-4">
              Monthly budget ({editCur.symbol})
            </Text>
            <View className="flex-row items-center bg-background border border-border rounded-xl px-3 mb-4">
              <Text className="text-base text-text-muted mr-2">
                {editCur.symbol}
              </Text>
              <TextInput
                value={editBudget}
                onChangeText={(t) => setEditBudget(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                inputMode="numeric"
                className="flex-1 py-2 text-base text-text-primary"
              />
            </View>

            <Text className="text-xs text-text-secondary mb-1">
              Expected monthly income ({editCur.symbol}) — optional
            </Text>
            <View className="flex-row items-center bg-background border border-border rounded-xl px-3 mb-4">
              <Text className="text-base text-text-muted mr-2">
                {editCur.symbol}
              </Text>
              <TextInput
                value={editIncome}
                onChangeText={(t) => setEditIncome(t.replace(/\D/g, ''))}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                inputMode="numeric"
                className="flex-1 py-2 text-base text-text-primary"
              />
            </View>

            {error && (
              <Text className="text-danger text-sm mb-3">{error}</Text>
            )}

            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setEditing(false)}
                disabled={saving}
                className="flex-1 py-3 rounded-xl border border-border bg-surface items-center active:opacity-80"
              >
                <Text className="text-text-secondary font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEdit}
                disabled={saving}
                className={`flex-1 py-3 rounded-xl items-center ${
                  saving ? 'bg-text-muted' : 'bg-primary active:opacity-80'
                }`}
              >
                {saving ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-white font-semibold">Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="gap-3">
            <View className="bg-surface border border-border rounded-2xl p-5">
              <Text className="text-xs text-text-muted uppercase mb-1">
                Name
              </Text>
              <Text className="text-lg text-text-primary font-medium">
                {profile?.name ?? '—'}
              </Text>
            </View>

            <View className="bg-surface border border-border rounded-2xl p-5">
              <Text className="text-xs text-text-muted uppercase mb-1">
                Email
              </Text>
              <Text className="text-lg text-text-primary font-medium">
                {email ?? '—'}
              </Text>
            </View>

            <View className="bg-surface border border-border rounded-2xl p-5">
              <Text className="text-xs text-text-muted uppercase mb-1">
                Currency
              </Text>
              <Text className="text-lg text-text-primary font-medium">
                {cur.symbol} {cur.code} — {cur.name}
              </Text>
            </View>

            <View className="bg-surface border border-border rounded-2xl p-5">
              <Text className="text-xs text-text-muted uppercase mb-1">
                Monthly budget
              </Text>
              <Text className="text-lg text-text-primary font-medium">
                {profile
                  ? formatCurrency(profile.monthly_budget, profile.currency)
                  : '—'}
              </Text>
            </View>

            <View className="bg-surface border border-border rounded-2xl p-5">
              <Text className="text-xs text-text-muted uppercase mb-1">
                Expected monthly income
              </Text>
              <Text className="text-lg text-text-primary font-medium">
                {profile && profile.expected_monthly_income > 0
                  ? formatCurrency(
                      profile.expected_monthly_income,
                      profile.currency,
                    )
                  : 'Not set'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {!editing && (
        <View className="px-6 mb-3 gap-3">
          <CategoryBudgetsCard />
          <SplitwiseConnectCard />
        </View>
      )}

      <View className="px-6 pt-2 pb-12">
        <Pressable
          onPress={signOut}
          className="flex-row items-center justify-center gap-2 border border-border bg-surface py-4 rounded-2xl active:opacity-80"
        >
          <Ionicons name="log-out-outline" size={18} color="#6B7280" />
          <Text className="text-text-secondary font-medium">Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
