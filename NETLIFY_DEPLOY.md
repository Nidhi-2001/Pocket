# Deploying Pocket (web) to Netlify — GitHub-connected

Auto-deploys on every push to `main`. One-time setup, ~10 minutes.

Repo: `Nidhi-2001/Pocket` · `netlify.toml` is at the repo root, so build settings
are auto-detected (build `npx expo export --platform web`, publish `dist`,
Node 22). No base directory needed.

## Steps

1. **Sign in** at https://app.netlify.com (use "Log in with GitHub" — simplest).
2. **Add new site → Import an existing project → Deploy with GitHub.**
3. **Authorize Netlify** to access GitHub if prompted, and grant it access to the
   `Nidhi-2001/Pocket` repository (or all repos).
4. **Pick the `Nidhi-2001/Pocket` repo.**
5. **Build settings** — Netlify reads `netlify.toml`, so leave them as detected:
   - Base directory: *(blank)*
   - Build command: `npx expo export --platform web`
   - Publish directory: `dist`
6. **Add environment variables** (Site configuration → Environment variables →
   "Add a variable" / "Import"). All three are public (they ship in the bundle):

   | Key | Value |
   | --- | --- |
   | `EXPO_PUBLIC_SUPABASE_URL` | `https://atmpunlkmpyccaudkxmt.supabase.co` |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0bXB1bmxrbXB5Y2NhdWRreG10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MDM0OTQsImV4cCI6MjA5NDk3OTQ5NH0.8MdugqrHo2F-DigGi_3tQEhAS07kQPMjyefTtmxTAJo` |
   | `EXPO_PUBLIC_SPLITWISE_CLIENT_ID` | `i5XosTcJ9bxzzFhglGDnfW7CbV1wU9vw1G0647ln` |

7. **Deploy site.** First build takes ~3–5 min. You'll get a URL like
   `https://<random-name>.netlify.app` (rename it under Site configuration →
   Change site name).

## After it's live

- **Note your site URL** — you'll need it for the Splitwise callback.
- **Register the Splitwise callback** = `https://<your-site>.netlify.app/splitwise-callback`
  (see [PRE_DEPLOY.md](PRE_DEPLOY.md) §C). Until then, "Connect Splitwise" breaks
  on the live site.
- **Set up SMTP** for login OTP ([PRE_DEPLOY.md](PRE_DEPLOY.md) §B) before sharing
  with new users — the built-in email gets dropped by Gmail.
- Future changes deploy automatically: just `git push`.

## If a build ever fails

- Check the Netlify deploy log. Most common cause: a missing env var (the build
  succeeds but the live app can't reach Supabase) — re-check step 6.
- Node version mismatch is already pinned to 22 in `netlify.toml`.
