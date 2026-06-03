# Pocket

> Your money, finally explained.

Pocket is an AI-powered spending accountability app for young adults (18–26)
**anywhere in the world**. Each user picks their own currency (USD, EUR, GBP,
JPY, INR, and many more). It reads bank notification messages, auto-categorises
every transaction, and helps the user understand their money through a
conversational chat interface, smart nudges, and a monthly **Spending
Personality** card.

This repo is a personal project by [@Nidhi-2001](https://github.com/Nidhi-2001),
built openly. It is not production yet. Contributions and feedback are welcome
but the roadmap below is the source of truth for direction.

---

## Contents

- [Status](#status)
- [What Pocket does](#what-pocket-does)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Local setup](#local-setup)
- [Project structure](#project-structure)
- [Conventions and invariants](#conventions-and-invariants)
- [Build plan](#build-plan)
- [Known gotchas](#known-gotchas)

---

## Status

**Current phase: all six MVP phases complete.** Cron scheduling and landing page are the remaining optional polish.

| # | Phase                                            | Status |
| - | ------------------------------------------------ | ------ |
| 0 | Foundation: Expo + NativeWind + GitHub           | ✅      |
| 1 | Backend: Supabase project + schema + RLS         | ✅      |
| 2 | Auth + onboarding screens (email OTP)            | ✅      |
| 3 | SMS parser edge function (Groq)                  | ✅      |
| 4 | Core screens: Home, Spends, Transaction detail   | ✅      |
| 5 | AI chat edge function (Groq) + chat screen       | ✅      |
| 6 | Goals + nudges + monthly personality             | ✅\*    |
| + | Landing page (Vercel) — only for Play Store      | ☐      |

\* Phase 6 is functionally complete: Goals UI, `goal-nudge` and `personality`
edge functions, and Home surfacing all work. Cron *scheduling* (so the
functions run automatically on a schedule) is the one optional bit that
isn't wired up — for now both functions can be invoked on-demand from
Home's "Pocket insights" buttons. Set up via Supabase dashboard or
pg_cron when ready for production.

What runs today: the app is a working spending dashboard. A signed-in user can
- complete the email-OTP onboarding (welcome → SMS-permission → OTP → setup),
- paste a bank SMS on Home and watch it parse into a real transaction row,
- see month-to-date spend vs budget in a hero card,
- browse recent transactions on Home and a category donut breakdown on Spends,
- tap a transaction to open a full-screen detail, change its category, or delete it,
- navigate between 5 tabs (Home, Spends, Goals, Chat, Profile) with persistent state and refetch-on-focus so edits propagate instantly.

---

## What Pocket does

Five-feature MVP:

1. **SMS parsing** — bank notification SMS is parsed by an LLM into a
   structured transaction (amount, merchant, category, type, timestamp) and
   stored in Postgres.
2. **Home dashboard** — spend-vs-budget hero card, recent transactions, AI
   nudges.
3. **AI chat** — "Ask Pocket anything about your money." Personal-finance Q&A
   grounded in the user's own transaction history.
4. **Goals + nudges** — savings goals with AI coaching, nightly check-ins.
5. **Monthly Spending Personality** — a short, shareable "what your spending
   says about you" card generated once per month.

Target user: a college student / young professional in India who already gets
bank SMS, wants to understand where their money goes, and doesn't want to
maintain a spreadsheet.

---

## Tech stack

| Layer            | Choice                                                                    | Reason                                                             |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Mobile           | React Native + Expo (managed workflow) + TypeScript strict                | Single codebase, OTA updates via EAS, no native build chain locally |
| Styling          | NativeWind (Tailwind CSS for RN)                                          | One styling vocabulary across mobile + web; no `StyleSheet.create` |
| Routing          | Expo Router (file-based)                                                  | URL-addressable screens; same mental model as Next.js              |
| Backend          | Supabase (Postgres + auth + edge functions + cron)                        | One platform, generous free tier, RLS first-class                  |
| AI — all agents  | Groq `llama-3.3-70b-versatile` (SMS parsing, chat, monthly personality)   | One provider, one key, fastest inference. Free tier (30 RPM, 14.4k req/day) is more than enough for personal-scale traffic. |
| Auth             | Supabase email OTP                                                        | Free; pivoted from phone OTP after Supabase required a paid SMS provider |
| Build            | EAS Build                                                                 | Cloud builds; no Android Studio / Xcode needed locally             |
| Landing page     | Next.js on Vercel                                                         | Static + fast; only needed at Play Store submission                |

Every paid-tier AI key is **server-side only** (Supabase Edge Functions). The
React Native bundle only ever sees `EXPO_PUBLIC_*` env vars — the Supabase URL
and anon key, which are RLS-gated and safe to ship.

---

## Architecture

```
┌──────────────────────────┐
│  React Native app        │
│  (Expo, web + mobile)    │
│                          │
│  - Screens (app/)        │
│  - Supabase client only  │
│    has anon key          │
└──────────┬───────────────┘
           │ HTTPS (anon key, RLS-scoped)
           ▼
┌──────────────────────────────────────────────────┐
│  Supabase project                                │
│                                                  │
│  ┌─────────────┐   ┌──────────────────────────┐ │
│  │  Postgres   │   │  Edge Functions (Deno)   │ │
│  │  + RLS      │◄──┤  service-role key inside │ │
│  │  + auth     │   │                          │ │
│  └─────────────┘   │  - parse-sms  → Groq     │ │
│                    │  - chat-agent → Gemini   │ │
│                    │  - personality → Mistral │ │
│                    │  - goal-nudge (cron)     │ │
│                    └──────────────────────────┘ │
└──────────────────────────────────────────────────┘
                              │
                              ▼
                  External AI provider APIs
                  (Groq / Gemini / Mistral)
```

Key invariant: **the React Native bundle never calls an AI provider directly.**
Every AI call is a fetch to a Supabase Edge Function endpoint. This keeps API
keys off the device and lets us swap providers without shipping an app update.

---

## Local setup

Prerequisites:

- Node.js (anything ≥ 20 LTS; Node 24 also works with caveats — see
  [Known gotchas](#known-gotchas))
- A free [Supabase](https://supabase.com) project
- A free [Groq](https://console.groq.com) API key (needed from Phase 3 onward)
- For mobile testing later: Expo Go on Android (web target works without it)

Steps:

```bash
git clone https://github.com/Nidhi-2001/Pocket.git
cd Pocket
npm install
cp .env.example .env.local
# edit .env.local — fill in Supabase URL, anon key, service role key
npx expo start --web
# open http://localhost:8081
```

Then run the SQL in `supabase/migrations/0001_initial_schema.sql` against your
Supabase project (SQL Editor → paste → run) to create the tables. Configure
email OTP per [Phase 2.3 notes in `AGENTS.md`](./AGENTS.md).

---

## Project structure

```
Pocket/
├─ app/                          Expo Router screens (file-based routing)
│  ├─ _layout.tsx                Root layout + auth guard
│  ├─ (auth)/                    Unauthenticated routes
│  │  ├─ welcome.tsx
│  │  ├─ sms-permission.tsx
│  │  ├─ otp.tsx                 Email + 6-10 digit code
│  │  └─ setup.tsx               Name + monthly budget
│  └─ (tabs)/                    Authenticated routes (tab nav in Phase 4)
│     └─ index.tsx               Home (placeholder for now)
├─ components/                   Reusable UI primitives (filled in Phase 4+)
│  ├─ ui/  home/  spends/  chat/  goals/
├─ constants/
│  └─ theme.ts                   colors, categories, spacing, radius
├─ hooks/                        useTransactions, useAuth, etc. (Phase 4+)
├─ lib/
│  ├─ supabase.ts                Client init (anon key, AsyncStorage session)
│  └─ formatters.ts              ₹ paise → "₹1,299"; IST date formatting
├─ supabase/
│  ├─ migrations/
│  │  └─ 0001_initial_schema.sql 7 tables + RLS + handle_new_user trigger
│  └─ functions/
│     ├─ parse-sms/              Edge function (Phase 3)
│     ├─ chat-agent/             Edge function (Phase 5)
│     ├─ goal-nudge/             Cron (Phase 6)
│     └─ personality/            Cron (Phase 6)
├─ types/
│  └─ index.ts                   Profile, Transaction, Goal, Nudge, etc.
├─ app.json                      Expo config (scheme: pocket, plugins, web bundler)
├─ babel.config.js               nativewind preset + jsxImportSource
├─ metro.config.js               withNativeWind wrapper
├─ tailwind.config.js            Token theme + darkMode: 'class'
├─ global.css                    Tailwind directives
├─ nativewind-env.d.ts           NativeWind + *.css module types
├─ .env.example                  Template — copy to .env.local and fill in
├─ .npmrc                        legacy-peer-deps=true (expo-router transitive fix)
└─ tsconfig.json                 Extends expo/tsconfig.base, strict: true
```

---

## Conventions and invariants

These are non-negotiable. If a change violates one of these, the change is wrong.

1. **All money is stored as integer minor units of the user's chosen currency**
   (cents for USD, paise for INR, yen for JPY since JPY has no minor unit, etc.).
   Convert at the UI boundary using `lib/currency.ts → formatMoney(minor, code)`.
   Never store major-unit floats — floating-point math + money = bugs.
2. **All dates and times are in the user's local timezone** when displayed.
   `lib/formatters.ts → formatDate` uses the device locale; the LLM emits
   ISO 8601 with offset, so different users can be in different zones.
3. **Categories are exactly:** `Food | Transport | Shopping | Entertainment | Other`.
   Enforced by a check constraint on `public.transactions.category`. Do not add
   or rename categories without a migration.
4. **Every table has RLS enabled** with default-deny. Policies scope reads/writes
   to `auth.uid()`. New tables MUST enable RLS in the same migration.
5. **No AI key in the app bundle.** All AI calls go through Supabase Edge
   Functions. Only `EXPO_PUBLIC_*` env vars are safe to expose; everything else
   is server-only.
6. **Styling: NativeWind classes only.** No `StyleSheet.create`. If a style
   isn't expressible in Tailwind, extend `tailwind.config.js`.
7. **TypeScript strict.** No `any`. No `// @ts-ignore` without a comment that
   explains why.

---

## Build plan

The roadmap is phase-by-phase. Each phase ends in a working, demonstrable,
committed state. Don't skip ahead.

| # | Goal                                                       | Key outputs                                                                   |
| - | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 0 | Project compiles and runs                                  | Expo app, NativeWind, repo on GitHub                                          |
| 1 | Database exists, app talks to it                           | Supabase project, schema migration, RLS, working `supabase` client            |
| 2 | A user can sign up and reach an authed screen              | welcome / SMS-permission / OTP / setup screens, auth guard                    |
| 3 | An SMS string can become a transaction row                 | `parse-sms` edge function, Groq integration, test endpoint                    |
| 4 | The home, spends, and detail screens render real data      | Tab nav, hero card, donut chart, transaction list, detail screen              |
| 5 | The user can have a conversation with their money          | `chat-agent` edge function (Gemini), chat screen with grounding               |
| 6 | Nudges and personality cards arrive on schedule            | `goal-nudge` cron, `personality` monthly cron, notification surface           |

After phase 6: polish, then a Next.js landing page on Vercel (only required
because Google Play asks for a public privacy-policy URL at submission).

---

## Known gotchas

These cost us time in earlier phases. Documenting so future-you doesn't redo
the diagnosis.

- **NativeWind 4.2 + Metro (Expo SDK 56) + Node 24 dev-loop crash.** The
  NativeWind file watcher crashes the Metro process with
  `TypeError: Cannot read properties of undefined (reading 'addedFiles')`
  any time a `.tsx` file changes during a session. **Workaround:** kill the
  dev server and restart (`npx expo start --web`) after every edit. Long-term
  fix candidates (untested): downgrade NativeWind to 4.1.x, downgrade Node to
  v20 LTS, or wait for NativeWind 4.3+.
- **Don't put this project under OneDrive.** OneDrive sync conflicts with
  `node_modules` and Metro's file watcher. We had to relocate from
  `C:\Users\nidhi\OneDrive\Desktop\Pocket` to `C:\Users\nidhi\Downloads\Pocket`
  early in Phase 0.
- **Supabase phone OTP now requires a paid SMS provider.** Twilio etc. cost
  money. We pivoted to **email OTP** — same UX (enter address → enter code),
  no third-party charges. The screen is still `app/(auth)/otp.tsx`.
- **Supabase email OTP token length is project-configurable** (default 6,
  ours is 8). `app/(auth)/otp.tsx` accepts 6-10 digits.
- **Both** the `Magic Link` and `Confirm signup` email templates need
  `{{ .Token }}` in their body. Supabase uses one or the other depending on
  whether the email is for a new or returning user.
- **Auth guard race condition.** When OTP verifies, the auth-state change
  fires *before* the screen's `router.replace('/setup')`. An aggressive guard
  that bounces signed-in users out of `(auth)` would beat the explicit nav.
  Our `app/_layout.tsx` deliberately only kicks **unauthenticated** users to
  `/welcome`; signed-in users keep their explicit route.
- **`.env.local` contains real keys** and is gitignored. **Never commit it.**
  If you accidentally paste a service-role key in chat, rotate it in
  Supabase → Project Settings → API.

---

## License

Personal project, no license yet. Code is here so the development is
auditable. If you want to reuse anything substantial, open an issue first.
