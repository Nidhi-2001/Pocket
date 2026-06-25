# Pre-deploy checklist

Three things to do before Pocket goes public. None of these are code changes in
this repo — they're account/dashboard actions plus a couple of CLI commands.
Work top to bottom.

- [ ] **A. Rotate every secret that was pasted in chat / committed to a machine**
- [ ] **B. Set up real SMTP** so login OTP emails actually deliver
- [ ] **C. Register the deployed Splitwise callback URL**

---

## A. Rotate secrets

During development, several secrets were typed into chat and/or written to
`.env.local` on this Mac. Treat all of them as compromised and rotate before a
public deploy. `.env.local` is gitignored (good) — but it still lives on disk,
so rotation is about invalidating the old values everywhere.

| Secret | Where it lives | Action | Public? |
| --- | --- | --- | --- |
| **Supabase `service_role` key** | `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`) + Supabase function secret | Rotate, then update both (see below) | ❌ never expose |
| **Supabase Management API token** (`sbp_…`) | Used only from the CLI for migrations; not in the app | **Revoke** in Supabase account → [Access Tokens](https://supabase.com/dashboard/account/tokens). Mint a fresh one only if you run more migrations. | ❌ |
| **`GROQ_API_KEY`** | `.env.local` + Supabase function secret | Rotate in the [Groq console](https://console.groq.com/keys), then update both | ❌ |
| **`SPLITWISE_CLIENT_SECRET`** (consumer secret) | Supabase function secret only | Regenerate in your [Splitwise app settings](https://secure.splitwise.com/apps), then update the function secret | ❌ |
| **`SPLITWISE_API_KEY`** (personal token `B5730…`) | `.env.local` only — **no longer used** (per-user OAuth replaced it) | **Revoke** it in Splitwise and delete the line from `.env.local` | ❌ |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` + web bundle | Public by design — only rotate if you rotate the JWT secret (see note) | ✅ ok in bundle |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SPLITWISE_CLIENT_ID` | `.env.local` + web bundle | Public identifiers — no rotation needed | ✅ ok in bundle |
| **`CRON_SECRET`** | Supabase function secret + embedded in the pg_cron jobs | Rotate carefully — **the cron jobs must be re-scheduled with the new value** (see below) | ❌ |

### How to rotate the Supabase service_role key

Supabase derives `anon` and `service_role` from the project **JWT secret**.
In the dashboard: **Project Settings → API → JWT Settings → "Generate a new
secret."** This regenerates **both** keys, so afterward you must:

1. Update `.env.local`:
   - `SUPABASE_SERVICE_ROLE_KEY=<new service_role>`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY=<new anon>`
2. Update the function secret: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<new>`
   _(Note: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
   are auto-injected into edge functions by the platform — setting it explicitly
   is only needed if you ever overrode it.)_
3. **Rebuild + redeploy the web app** so the new anon key ships in the bundle.

> If you don't want to rotate the anon key (it's public anyway), you can leave
> the JWT secret alone and accept the service_role exposure risk only if the old
> key never left trusted hands. Safest is to rotate.

### Setting the other function secrets

```bash
supabase secrets set GROQ_API_KEY=<new groq key>
supabase secrets set SPLITWISE_CLIENT_SECRET=<new splitwise secret>
# Confirm what's set:
supabase secrets list
```

### Rotating CRON_SECRET (do this last — it has a moving part)

The scheduled jobs (`scheduled-alerts`, `generate-insights`) authenticate to the
edge functions by sending `x-cron-secret: <CRON_SECRET>`. That value is baked
into the pg_cron job definitions, so rotating the secret means **re-creating the
cron jobs too**, or they'll start getting 401s.

1. Generate a new value: `openssl rand -hex 16`
2. `supabase secrets set CRON_SECRET=<new value>`
3. Re-run the cron-scheduling SQL (migrations `0008` / the insights cron) with the
   new secret in the request header — i.e. `cron.unschedule(...)` the old jobs and
   re-`cron.schedule(...)` them with the new `x-cron-secret`. Send a browser
   `User-Agent` header on Management API calls or Cloudflare returns 403 (1010).
4. Verify: the next scheduled run should return 200, not 401.

---

## B. SMTP for login emails (OTP)

Pocket signs users in with an emailed one-time code. Supabase's **built-in**
email sender is rate-limited (a few per hour) and frequently lands in spam or is
dropped by Gmail — fine for testing, not for real users. Wire up a real SMTP
provider.

### Recommended: Resend

1. Create an account at [resend.com](https://resend.com).
2. **Add and verify your sending domain** (add the DNS records Resend shows).
   For a quick test you can send from `onboarding@resend.dev`, but verify a real
   domain before launch or you'll hit deliverability limits.
3. Create an API key (Resend → API Keys).
4. In **Supabase Dashboard → Project → Authentication → Emails → SMTP Settings**,
   enable **Custom SMTP** and fill in:
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) or `587` (STARTTLS)
   - Username: `resend`
   - Password: _your Resend API key_
   - Sender email: an address on your **verified domain** (e.g. `login@yourdomain.com`)
   - Sender name: `Pocket`
5. Raise the auth rate limits (Authentication → Rate Limits) above the tiny
   built-in defaults.

### Alternative: SendGrid

Same Supabase SMTP form, with:
- Host: `smtp.sendgrid.net` · Port: `587`
- Username: `apikey` (literally the word) · Password: _your SendGrid API key_
- Sender on a verified SendGrid sender identity / domain.

### Don't forget the templates

Both the **Magic Link** *and* **Confirm signup** email templates must contain
`{{ .Token }}` in the body — Supabase uses different templates for returning vs
first-time users, and the OTP screen reads the token from either. (This bit us
before; it's also noted in `AGENTS.md`.)

After switching SMTP, send yourself a code end-to-end and confirm it arrives in
the inbox (not spam) and logs you in.

---

## C. Register the deployed Splitwise callback URL

OAuth requires that the `redirect_uri` the app sends **exactly matches** the
callback URL registered on your Splitwise app. The app builds it like this
(`lib/splitwise.ts`):

- **Web:** `<origin>/splitwise-callback` → on your deploy this is
  `https://<your-site>.netlify.app/splitwise-callback`
- **Native (standalone build):** `pocket://splitwise-callback`

Steps:

1. Go to [secure.splitwise.com/apps](https://secure.splitwise.com/apps) and open
   your registered app.
2. Set the **Callback URL** to your production web URL:
   `https://<your-site>.netlify.app/splitwise-callback`
   (use your real Netlify/custom domain — must be `https`, no trailing slash).
3. Save.

> **Heads-up — Splitwise allows only ONE callback URL per app.** That means a
> single app can't simultaneously serve `localhost:8081` (local dev), your
> Netlify URL (web prod), and `pocket://…` (native). Options:
> - Keep one app per environment (e.g. "Pocket Dev" with localhost, "Pocket"
>   with the prod URL) and point `EXPO_PUBLIC_SPLITWISE_CLIENT_ID` at the right
>   one per build, **or**
> - Just swap the single callback URL when you switch between local and prod.
>
> For **native**, register `pocket://splitwise-callback` (a third app, or swap),
> since the deep link differs from the web URL.

After registering, do a real connect flow from the deployed site and confirm it
returns to `/splitwise-callback` and stores the token.
