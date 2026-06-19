import { formatCurrency } from './formatters';
import { presentLocalNotification } from './push';
import { supabase } from './supabase';

// Fire the budget warning once month-to-date spend crosses this fraction.
const BUDGET_ALERT_THRESHOLD = 0.8;

type NudgeType = 'daily_reminder' | 'weekly_digest' | 'budget_warning';

interface NewNudge {
  user_id: string;
  type: NudgeType;
  message: string;
}

/**
 * Client-side alert engine. Runs on app open: reads the user's budget +
 * this-month transactions and inserts any due alerts into `nudges` (RLS lets
 * a user write their own). Deduped so each alert fires at most once per its
 * period:
 *   - daily_reminder : once per calendar day — nudge to log spending
 *   - weekly_digest  : weekends only, once per 7 days — week's spend recap
 *   - budget_warning : once per day, when MTD spend ≥ 80% of monthly budget
 *
 * Returns the number of alerts inserted (so the caller can refetch).
 */
export async function runNudgeChecks(): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: profile } = await supabase
    .from('profiles')
    .select('monthly_budget, currency')
    .maybeSingle();
  if (!profile) return 0;

  const currency = (profile.currency as string) ?? 'USD';
  const budget = (profile.monthly_budget as number) ?? 0;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [{ data: recentNudges }, { data: monthDebits }] = await Promise.all([
    supabase
      .from('nudges')
      .select('type, created_at')
      .gte('created_at', sevenDaysAgo.toISOString()),
    supabase
      .from('transactions')
      .select('amount, category, transacted_at')
      .eq('transaction_type', 'debit')
      .gte('transacted_at', monthStart.toISOString()),
  ]);

  const nudges = recentNudges ?? [];
  const debits = monthDebits ?? [];

  const hasSince = (type: NudgeType, since: Date) =>
    nudges.some(
      (n) => n.type === type && new Date(n.created_at as string) >= since,
    );

  const toInsert: NewNudge[] = [];

  // 1. Daily reminder — once per day.
  if (!hasSince('daily_reminder', startOfToday)) {
    toInsert.push({
      user_id: user.id,
      type: 'daily_reminder',
      message:
        "Spent anything today? Log it so your dashboard and budget stay accurate.",
    });
  }

  // 2. Weekend summary — Sat/Sun only, once per 7 days.
  const dow = now.getDay(); // 0 = Sun, 6 = Sat
  const isWeekend = dow === 0 || dow === 6;
  if (isWeekend && !hasSince('weekly_digest', sevenDaysAgo)) {
    const weekDebits = debits.filter(
      (t) => new Date(t.transacted_at as string) >= sevenDaysAgo,
    );
    if (weekDebits.length > 0) {
      const weekTotal = weekDebits.reduce(
        (s, t) => s + (t.amount as number),
        0,
      );
      const byCat: Record<string, number> = {};
      for (const t of weekDebits) {
        byCat[t.category as string] =
          (byCat[t.category as string] ?? 0) + (t.amount as number);
      }
      const topCat =
        Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Other';
      const count = weekDebits.length;
      toInsert.push({
        user_id: user.id,
        type: 'weekly_digest',
        message: `This week you spent ${formatCurrency(weekTotal, currency)} across ${count} ${count === 1 ? 'purchase' : 'purchases'} — most on ${topCat}.`,
      });
    }
  }

  // 3. Budget warning — once per day, at ≥80% of monthly budget.
  if (budget > 0) {
    const mtdSpent = debits.reduce((s, t) => s + (t.amount as number), 0);
    const ratio = mtdSpent / budget;
    if (ratio >= BUDGET_ALERT_THRESHOLD && !hasSince('budget_warning', startOfToday)) {
      const pct = Math.round(ratio * 100);
      toInsert.push({
        user_id: user.id,
        type: 'budget_warning',
        message: `You've spent ${formatCurrency(mtdSpent, currency)} of your ${formatCurrency(budget, currency)} budget (${pct}%). You're close to the limit — spend wisely.`,
      });
    }
  }

  if (toInsert.length === 0) return 0;
  const { error } = await supabase.from('nudges').insert(toInsert);
  if (error) {
    console.error('runNudgeChecks insert error:', error);
    return 0;
  }

  // Also push event-driven alerts to the OS notification bar (not just the
  // in-app card). The daily reminder has its own scheduled 8 PM notification,
  // so skip it here to avoid a duplicate. No-op on web.
  for (const n of toInsert) {
    if (n.type === 'budget_warning' || n.type === 'weekly_digest') {
      await presentLocalNotification('Pocket', n.message);
    }
  }
  return toInsert.length;
}
