# Pocket — Privacy Policy

_Last updated: [FILL IN DATE]_  ·  Contact: **[FILL IN YOUR EMAIL]**

Pocket ("we", "the app") helps you understand your spending. This policy
explains what data we handle and why. We collect only what's needed to run the
app, and we never sell your data.

## What we collect

- **Account:** your email address (used only to sign you in via a one-time
  code — we do **not** read your inbox or access your Google account).
- **Financial data you add:** transactions (amount, merchant/description,
  category, date), monthly budget, per-category budgets, savings goals, and
  income. You enter these manually, by uploading a statement PDF, or by
  importing from Splitwise.
- **Splitwise data (only if you connect it):** your Splitwise balances and
  expenses, fetched via Splitwise's API using a token you authorize. You can
  disconnect at any time, which deletes the stored token.

## How your data is used

- To display your dashboards, charts, budgets, goals, and alerts.
- To answer your questions in the in-app assistant and generate nudges and a
  monthly "spending personality."

## Third parties that process your data

- **Supabase** — stores your data (Postgres) and handles authentication.
  Access is restricted per-user by row-level security.
- **Groq** — our AI provider. To parse entries and answer your questions, we
  send the relevant text (e.g., transaction descriptions, amounts, category
  totals, and Splitwise balances) to Groq's API for processing. We do not send
  your email or login credentials.
- **Splitwise** — only if you connect your account; we read your balances and
  expenses via their API.

We do not sell your data or use it for advertising.

## Data retention & your rights

- Your data is kept until you delete it or your account.
- You can edit or delete transactions in the app, disconnect Splitwise, and
  request full account/data deletion by emailing **[FILL IN YOUR EMAIL]**.

## Security

Data is transmitted over HTTPS and protected by per-user access controls.
Server-side secrets (AI and database keys) are never exposed in the app.

## Changes

We may update this policy; the "last updated" date will change accordingly.

## Contact

Questions? Email **[FILL IN YOUR EMAIL]**.
