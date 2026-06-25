# Pocket — Privacy Policy

> **▸ Before publishing:** replace `[your contact email]` (appears 3×, below) with the
> address you want users to reach you at, and confirm the "Last updated" date.

_Last updated: June 24, 2026_  ·  Contact: **[your contact email]**

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
- **Voice input (only when you use the mic):** when you tap the microphone in
  the assistant, the app records a short audio clip and sends it to our speech
  provider to convert to text. The audio is used only to produce that
  transcript and is not stored by us after transcription.
- **Splitwise data (only if you connect it):** your Splitwise balances and
  expenses, fetched via Splitwise's API using a token you authorize. You can
  disconnect at any time, which deletes the stored token.
- **Notification token (only if you enable notifications):** a device push
  token so we can send you the reminders and alerts you turn on. Removing the
  app or disabling notifications stops this.

## How your data is used

- To display your dashboards, charts, budgets, goals, and alerts.
- To answer your questions in the in-app assistant, record spends/income you
  describe, and generate nudges, proactive insights, and a monthly "spending
  personality."
- To transcribe voice input into text you can review before sending.

## Third parties that process your data

- **Supabase** — stores your data (Postgres) and handles authentication and
  email delivery. Access is restricted per-user by row-level security.
- **Groq** — our AI provider. To parse entries, answer your questions, generate
  insights, and transcribe voice input, we send the relevant text or audio
  (e.g., transaction descriptions, amounts, category totals, Splitwise
  balances, and microphone recordings) to Groq's API for processing. We do not
  send your email or login credentials.
- **Splitwise** — only if you connect your account; we read your balances and
  expenses via their API.
- **Expo / push services (Apple APNs, Google FCM)** — only if you enable
  notifications; they deliver the push messages to your device.

We do not sell your data or use it for advertising.

## Data retention & your rights

- Your data is kept until you delete it or your account.
- Voice recordings are not retained after they are transcribed.
- You can edit or delete transactions in the app, disconnect Splitwise, disable
  notifications, and request full account/data deletion by emailing
  **[your contact email]**.

## Security

Data is transmitted over HTTPS and protected by per-user access controls.
Server-side secrets (AI and database keys) are never exposed in the app.

## Children

Pocket is not directed to children under 13, and we do not knowingly collect
data from them.

## Changes

We may update this policy; the "last updated" date will change accordingly.

## Contact

Questions? Email **[your contact email]**.
