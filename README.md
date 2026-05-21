# Pocket

> Your money, finally explained.

AI-powered spending accountability app for Indian students and young adults (18–26). Pocket reads your bank SMS messages, auto-categorises transactions using AI, and helps you understand your money through a conversational chat interface, smart nudges, and a monthly Spending Personality card.

## Status

Early development — currently in Phase 0 (foundation setup).

## Stack

- **Mobile:** React Native + Expo (managed workflow) + TypeScript (strict) + NativeWind
- **Backend:** Supabase (Postgres + auth + edge functions + cron)
- **AI agents (all free tier):**
  - SMS parser — Groq `llama-3.3-70b-versatile`
  - Chat + goal coach — Google Gemini 2.5 Flash
  - Monthly personality — Mistral `mistral-small-latest`
- **Build + deploy:** EAS Build (mobile), Vercel (landing page)

## Core features

1. SMS parsing → auto transaction tracking
2. Home dashboard (spend vs budget, recent transactions)
3. AI chat — "Ask Pocket anything about your money"
4. Goals with AI coach nudges
5. Spending Personality card (monthly)

## Getting started

Setup instructions will be added once Phase 0 is complete.
