# Pocket

> Your money, finally explained.

Pocket is an AI-powered personal-finance app for young adults (18–26)
**anywhere in the world**. Each user picks their own currency (USD, EUR, GBP,
JPY, INR, and many more). Log spends and income by **typing or speaking** to a
natural-language assistant, snap a bank/credit-card **statement PDF**, connect
**Splitwise**, and understand your money through budgets, goals, proactive AI
insights, and a monthly **Spending Personality** card.

This repo is a personal project by [@Nidhi-2001](https://github.com/Nidhi-2001),
built openly. It is **live in web beta at
[pocketme.netlify.app](https://pocketme.netlify.app)** (native iOS/Android is a
follow-up). Contributions and feedback are welcome, but the roadmap below is the
source of truth for direction.

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

**Live in web beta** at [pocketme.netlify.app](https://pocketme.netlify.app)
(Netlify, auto-deployed from `main`). MVP Phases 0–9 are complete, plus a
post-MVP pass (Phase 10): the assistant, voice, insights, alerts, a
password auth flow, a full visual redesign, and deployment.

| #  | Phase                                              | Status |
| -- | -------------------------------------------------- | ------ |
| 0  | Foundation: Expo + NativeWind + GitHub             | ✅      |
| 1  | Backend: Supabase project + schema + RLS           | ✅      |
| 2  | Auth + onboarding (email **+ password**, email-code verification) | ✅ |
| 3  | SMS parser edge function (Groq)                    | ✅†     |
| 4  | Core screens: Home, Spends, Transaction detail     | ✅      |
| 5  | AI chat edge function (Groq)                        | ✅†     |
| 6  | Goals + nudges + monthly personality               | ✅      |
| 7  | PDF statement upload (`parse-statement`, Groq)     | ✅      |
| 8  | Income tracking + per-category budgets + cash flow | ✅      |
| 9  | Splitwise: "you owe" chart, import, OAuth, Net position | ✅ |
| 10 | Assistant (NL + **voice**), proactive AI insights, alerts, password auth, redesign (glassmorphism + slate theme, dark mode), **Netlify deploy** | ✅ |

† `parse-sms` and `chat-agent` are **superseded** — this build logs spends via
the assistant (not SMS reading), and chat was folded into the assistant. Both
are candidates for removal.

All AI agents run on **Groq `llama-3.3-70b-versatile`**; voice transcription uses
**Groq Whisper**. The RN bundle never calls a provider directly — only Edge
Functions do.

What runs today (signed-in user):
- **Onboarding**: welcome → how-it-works → **sign up with email + password**, verified by an emailed 6-digit code. Also password login, "email me a code" fallback, and forgot-password. Auth emails send via SMTP (see [`AGENTS.md`](./AGENTS.md)).
- **Pocket Assistant** (center tab): log a spend/income or ask a question in natural language — by **typing or voice** (mic → Groq Whisper → the assistant).
- Upload a bank/credit-card **statement PDF** → every transaction parsed in.
- Connect **Splitwise** (OAuth) → per-person "you owe" chart + import paid expenses.
- **Home**: gradient cash-flow hero, a **proactive AI insight**, nudges/alerts, a cumulative **Net position** (transactions netted against the Splitwise balance), recent transactions.
- **Spends**: category donut + income/expense cash-flow breakdown + budgets.
- **Goals**, per-category **budgets**, and a transaction detail screen (edit category / delete).
- **Dark mode** (System / Light / Dark) and a frosted-glass "slate monochrome" theme.
- 5 tabs (Home, Spends, **Assistant**, Goals, Profile) with refetch-on-focus so edits propagate instantly.

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

Target user: a young adult (anywhere in the world, any supported currency) who
wants to understand where their money goes — logging spend manually, importing
statements, or syncing Splitwise — without maintaining a spreadsheet.

---

## Tech stack

| Layer            | Choice                                                                    | Reason                                                             |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Mobile           | React Native + Expo (managed workflow) + TypeScript strict                | Single codebase, OTA updates via EAS, no native build chain locally |
| Styling          | NativeWind (Tailwind CSS for RN)                                          | One styling vocabulary across mobile + web; no `StyleSheet.create` |
| Routing          | Expo Router (file-based)                                                  | URL-addressable screens; same mental model as Next.js              |
| Backend          | Supabase (Postgres + auth + edge functions + cron)                        | One platform, generous free tier, RLS first-class                  |
| AI — all agents  | Groq `llama-3.3-70b-versatile` (assistant, statement parsing, insights, personality); Groq Whisper for voice | One provider, one key, fastest inference. Free tier is ample for personal-scale traffic. |
| Auth             | Supabase email **+ password**, with an emailed verification code          | Passwordless-code fallback + forgot-password too; emails via custom SMTP (Gmail/Resend) |
| Hosting (web)    | Netlify — auto-deploy from `main` ([pocketme.netlify.app](https://pocketme.netlify.app)) | SPA export of the Expo web build; native (EAS) is a follow-up      |
| Build (native)   | EAS Build                                                                 | Cloud builds; no Android Studio / Xcode needed locally             |
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
│  └─────────────┘   │  - parse-sms    → Groq   │ │
│                    │  - parse-statement→ Groq │ │
│                    │  - chat-agent   → Groq   │ │
│                    │  - personality  → Groq   │ │
│                    │  - goal-nudge   → Groq   │ │
│                    │  - splitwise-*  → SW API │ │
│                    └──────────────────────────┘ │
└──────────────────────────────────────────────────┘
                              │
                              ▼
                  External APIs: Groq (all AI)
                  + Splitwise (balances / expenses)
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

Then run the migrations in `supabase/migrations/` in order (0001 → 0010)
against your Supabase project (SQL Editor → paste → run) to create the tables.
Configure auth email + SMTP per the [auth notes in `AGENTS.md`](./AGENTS.md)
(email + password with an emailed verification code; templates need
`{{ .Token }}`). For Splitwise, set the `SPLITWISE_*` secrets and deploy the
`supabase/functions/splitwise-*` edge functions. Deploying the web app is
covered in [`NETLIFY_DEPLOY.md`](./NETLIFY_DEPLOY.md); pre-launch tasks (secret
rotation, SMTP, Splitwise callback) are in [`PRE_DEPLOY.md`](./PRE_DEPLOY.md).

---

## Project structure

```
Pocket/
├─ app/                          Expo Router screens (file-based routing)
│  ├─ _layout.tsx                Root layout + auth guard
│  ├─ (auth)/                    Unauthenticated routes
│  │  ├─ welcome.tsx
│  │  ├─ how-it-works.tsx        Onboarding: what Pocket does
│  │  ├─ auth.tsx                Email + password signup / login / reset (email code)
│  │  └─ setup.tsx               Name + monthly budget
│  └─ (tabs)/                    Home, Spends, Assistant (center), Goals, Profile
│     └─ index.tsx               Home dashboard
├─ components/                   Reusable UI primitives
│  ├─ ui/ (GlassView, ScreenBackground, …)  home/  spends/  goals/  profile/
├─ constants/
│  └─ theme.ts                   colors, categories, spacing, radius
├─ hooks/                        useTransactions, useAuth, etc. (Phase 4+)
├─ lib/
│  ├─ supabase.ts                Client init (anon key, AsyncStorage session)
│  └─ formatters.ts              minor-units → "$1,299"; device-local dates
├─ supabase/
│  ├─ migrations/
│  │  └─ 0001…0010.sql           tables + RLS + triggers (all owner-scoped)
│  └─ functions/
│     ├─ assistant/              NL record + answer (primary input path)
│     ├─ transcribe/             Voice → text (Groq Whisper)
│     ├─ generate-insights/      Proactive daily insight
│     ├─ parse-statement/        PDF statement → transactions
│     ├─ splitwise-*/            balances, import, oauth
│     ├─ scheduled-alerts/       Cron: reminders / digests / budget warnings
│     └─ personality/  parse-sms/  chat-agent/  goal-nudge/  (last three legacy)
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
