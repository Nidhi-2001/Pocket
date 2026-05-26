# AGENTS.md

Guidance for AI coding assistants (Claude Code, Cursor, GitHub Copilot Chat,
Codex CLI, etc.) working in this repository. Read this BEFORE touching code.

`CLAUDE.md` is a one-line redirect to this file; both populate context for
agent runtimes.

---

## What this project is

**Pocket** is a React Native + Expo app for Indian young adults that turns
bank SMS into a usable spending dashboard via LLMs. Backend is Supabase
(Postgres + auth + edge functions). See `README.md` for product context and
build plan.

You are most likely being asked to either:

1. **Implement the next sub-step of the current phase** (see the status table
   in `README.md`). Phases ship in order — don't skip ahead.
2. **Fix a specific bug** in an already-built area.
3. **Refactor or polish** existing screens / functions.

If you're unsure which, ask before writing code.

---

## Hard rules (non-negotiable)

Breaking any of these is a bug, even if tests pass.

| # | Rule                                                                          |
| - | ----------------------------------------------------------------------------- |
| 1 | All monetary amounts stored as **paise** (integer, ₹1 = 100). Never floats.   |
| 2 | All user-facing dates in **IST (UTC+5:30)** via `lib/formatters.ts`.          |
| 3 | Categories: exactly `Food / Transport / Shopping / Entertainment / Other`.   |
| 4 | RLS is enabled on every public table. New tables must enable RLS + policies. |
| 5 | The React Native bundle never calls an AI provider directly — only Supabase Edge Functions do. |
| 6 | Only `EXPO_PUBLIC_*` env vars are safe in the app. `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY` are server-only. |
| 7 | NativeWind classes for all styling. **No `StyleSheet.create`.** If a token is missing, extend `tailwind.config.js`. |
| 8 | TypeScript strict. No `any`. No `// @ts-ignore` without a justifying comment. |
| 9 | Never commit `.env.local`, `.env`, `pocket-qr.png`, or anything matching the gitignore. |
| 10| Never `git push --force` to `main`. Never amend commits already pushed.       |

---

## Project conventions

### Files and routing

- Routes live in `app/`. **Expo Router** turns the file tree into the route
  tree. Folders in `(parens)` are groups — they organise files without
  affecting the URL.
- Authenticated routes live in `app/(tabs)/`. Unauthenticated routes live in
  `app/(auth)/`. The root `app/_layout.tsx` enforces the boundary.
- Shared UI primitives go in `components/ui/`. Feature-specific components go
  in `components/{home,spends,chat,goals}/`.
- Cross-cutting hooks live in `hooks/`. Naming: `useFoo.ts` exports `useFoo`.
- Edge functions live in `supabase/functions/<name>/index.ts`. Each function
  is self-contained Deno code; they do **not** import from `lib/` (different
  runtime).

### Imports

- Use relative imports (`../../lib/supabase`). No path aliases configured yet.
- Order: React → external libs → Expo/Supabase → relative imports → CSS side
  effects. Empty line between groups.

### Styling

- Use the theme tokens defined in `tailwind.config.js`:
  `bg-primary`, `text-text-primary`, `text-text-secondary`, `text-text-muted`,
  `bg-surface`, `bg-background`, `text-success`, `text-danger`, `border-border`.
- Spacing scale: Tailwind's defaults plus the named values in `constants/theme.ts`.
- Touchable elements: `Pressable` with `active:opacity-80`.
- Rounded shapes: `rounded-2xl` (16px) is the default card radius.

### Data layer

- All Postgres access from the app goes through `supabase` (in `lib/supabase.ts`).
- All write operations must respect RLS — i.e., the user's session must own
  the row.
- `transactions.amount`, `goals.target_amount`, `goals.current_amount`, and
  `profiles.monthly_budget` are all in **paise**.

---

## Phase status

| Phase | What                                              | Status |
| ----- | ------------------------------------------------- | ------ |
| 0     | Expo scaffold + NativeWind + repo + dev server    | ✅ done |
| 1     | Supabase project + schema + RLS + client connects | ✅ done |
| 2     | Auth + onboarding screens (email OTP)             | ✅ done |
| 3     | `parse-sms` edge function (Groq)                  | ✅ done |
| 4     | Home / Spends / Transaction detail screens        | ✅ done |
| 5     | `chat-agent` edge function + chat screen          | ⏳ next |
| 6     | Goals + nudge cron + monthly personality          | ☐      |

When you finish a sub-step, commit and update the README status table
(`## Status` section) so the repo's own docs track reality.

---

## Known gotchas (verified bugs / pitfalls)

These wasted real time in earlier phases. Don't redo the diagnosis.

### 1. NativeWind file-watcher crashes the dev server on file edits

**Symptom:** `npx expo start --web` dies with
`TypeError: Cannot read properties of undefined (reading 'addedFiles')` in
`react-native-css-interop/dist/metro/index.js:179`. Happens on Node 24 +
NativeWind 4.2 + Metro 0.84 (Expo SDK 56).

**Workaround:** restart the dev server after every file edit. PowerShell:

```powershell
$pid_ = (Get-NetTCPConnection -LocalPort 8081 -State Listen).OwningProcess
if ($pid_) { Stop-Process -Id $pid_ -Force }
npx expo start --web
```

**Don't waste time re-diagnosing.** Long-term fix: downgrade NativeWind to
4.1.x or wait for 4.3+. Tracked as TODO.

### 2. Supabase email OTP

- We pivoted from **phone OTP → email OTP** because Supabase now requires a
  paid SMS provider. The code in `app/(auth)/otp.tsx` uses
  `supabase.auth.signInWithOtp({ email })` then `verifyOtp({ email, token, type: 'email' })`,
  falling back to `type: 'signup'` for first-time users.
- The OTP length is **project-configurable** in Supabase (default 6, ours is 8).
  The screen's input accepts 6-10 digits.
- Both `Magic Link` AND `Confirm signup` email templates need `{{ .Token }}` in
  their body — Supabase uses different templates for new vs returning users.
  See [docs](https://supabase.com/docs/guides/auth/auth-email-templates).

### 3. Auth guard race condition

In `app/_layout.tsx`, the guard ONLY redirects unauthenticated users to
`/welcome`. Do not add an "if signed in and in (auth) → go to (tabs)" rule —
the auth-state change event fires before the OTP screen's
`router.replace('/setup')`, and the guard would win the race, breaking the
signup flow.

### 4. OneDrive + Node projects

This project lives at `C:\Users\nidhi\Downloads\Pocket`, deliberately not
under `OneDrive\Desktop`. OneDrive syncing conflicts with `node_modules` and
Metro's file watcher. If a future fork lands under OneDrive, move it out.

### 5. `.npmrc` requires `legacy-peer-deps=true`

Expo Router transitively pulls `react-dom@19.2.6` (for web Radix UI), but
Expo SDK 56 pins `react@19.2.3`. The mismatch breaks plain `npm install`.
Our `.npmrc` sets `legacy-peer-deps=true` to keep installs working. Don't
remove it.

---

## How to verify a change

Before committing any non-trivial change, run:

```bash
# Typecheck the whole project
npx tsc --noEmit

# Restart the dev server and refresh the browser to smoke-test the affected
# screen. The web target at http://localhost:8081 is the fastest verification
# loop. Phase 2+ flows can be tested as a real user.
```

For changes to edge functions (Phase 3 onward), test with curl against the
deployed function URL with a real bearer token.

---

## Commit and branching

- One logical change per commit. Imperative subject ≤ 70 chars.
- Sign commits with the agent's identity in the trailer
  (`Co-Authored-By: ...`). Anthropic Claude agents already do this; other
  agents should follow suit.
- Push to `main` directly is fine for this stage — no PR process yet. When the
  project gets contributors, this will change to feature branches + PRs.

---

## When in doubt

1. Read `README.md` for the product context.
2. Read this file again for the rules.
3. Read `supabase/migrations/0001_initial_schema.sql` for the data model.
4. Look at existing screens in `app/(auth)/` and `app/(tabs)/` as style
   references.
5. If still unclear, ask the human user before writing code. Don't guess at
   product intent.
