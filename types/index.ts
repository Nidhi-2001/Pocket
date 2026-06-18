import type { CurrencyCode } from '../lib/currency';

export interface Profile {
  id: string;
  name: string;
  phone: string;
  monthly_budget: number; // in minor units of `currency`
  expected_monthly_income: number; // in minor units of `currency`
  currency: CurrencyCode | string;
  created_at: string;
}

export interface CategoryBudget {
  id: string;
  user_id: string;
  category: 'Food' | 'Transport' | 'Shopping' | 'Entertainment' | 'Other';
  budget_amount: number; // in minor units
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number; // in minor units of the user's currency
  merchant: string;
  category: 'Food' | 'Transport' | 'Shopping' | 'Entertainment' | 'Other';
  transaction_type: 'debit' | 'credit';
  raw_sms?: string;
  transacted_at: string;
  created_at: string;
}

export interface ParsedTransaction {
  valid: boolean;
  amount: number;
  merchant: string;
  category: Transaction['category'];
  transaction_type: Transaction['transaction_type'];
  transacted_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  emoji: string;
  target_amount: number; // in minor units of `currency`
  current_amount: number; // in minor units of `currency`
  currency: CurrencyCode | string;
  deadline?: string;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
}

export interface Nudge {
  id: string;
  user_id: string;
  type:
    | 'budget_warning'
    | 'goal_check'
    | 'weekly_digest'
    | 'personality'
    | 'daily_reminder';
  message: string;
  read: boolean;
  created_at: string;
}

export interface Personality {
  id: string;
  user_id: string;
  month: string;
  type: string;
  title: string;
  emoji: string;
  insights: string[];
  actions: string[];
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface PersonalityResult {
  type: string;
  title: string;
  emoji: string;
  insights: string[];
  actions: string[];
}
