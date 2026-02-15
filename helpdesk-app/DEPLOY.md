# Deploying the Helpdesk App

The app has two parts:

- **Frontend** (React + Vite) → deploy to **Vercel**
- **Backend** (Supabase: DB, Auth, Storage, Edge Functions) → already on **Supabase**; you run migrations and deploy functions from your machine or CI

---

## 1. Deploy frontend to Vercel

### One-command deploy (build + push → Vercel)

From the **repo root** (thePREPSupport):

```bash
npm run deploy
```

This builds the frontend, commits any uncommitted changes, and pushes to GitHub. If the repo is connected to Vercel, Vercel will deploy automatically from the new push.

### Option A: Vercel Dashboard (recommended for first-time setup)

1. **Push your code to GitHub** (if you haven’t already).
2. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**.
3. **Import** the repo (e.g. `thePREPSupport`).
4. **Root Directory:** set to `helpdesk-app/frontend` (or leave blank if the repo root is already `helpdesk-app/frontend`).
5. **Build & Output:** Vercel should detect Vite; if not:
   - Build Command: `npm run build`
   - Output Directory: `dist`
6. **Environment variables** (Project → Settings → Environment Variables). Add:

   | Name                     | Value                    | Notes                          |
   |--------------------------|--------------------------|--------------------------------|
   | `VITE_SUPABASE_URL`      | `https://xxx.supabase.co`| From Supabase → Settings → API |
   | `VITE_SUPABASE_ANON_KEY` | Your anon/public key     | Same place                     |
   | `VITE_GOOGLE_CLIENT_ID`  | Your Google OAuth client ID | From Google Cloud Console. If omitted, the app runs but “Koble til Gmail-konto” is disabled and shows an explanation. |
   | `VITE_GOOGLE_REDIRECT_URI` | `https://your-app.vercel.app/oauth/callback` | Your Vercel URL + `/oauth/callback` |

7. **Deploy.** Set `VITE_GOOGLE_REDIRECT_URI` to your production URL (e.g. `https://your-project.vercel.app/oauth/callback`).

### Option B: Vercel CLI

```bash
cd helpdesk-app/frontend
npx vercel login          # log in once (opens browser)
npx vercel                # first time: link to repo / create project; Root = . (current dir)
# Add env vars in Dashboard (Project → Settings → Environment Variables)
# or: npx vercel env add VITE_SUPABASE_URL
npx vercel --prod         # deploy to production
```

### 404 + “Ready Stale” + build finishes in ~100ms?

If the build logs show **“Build Completed in /vercel/output [100ms]”** and **“no files were prepared”**, Vercel is not building your app (it’s using the repo root, so nothing runs). Fix it in the dashboard:

1. Open the project on [vercel.com](https://vercel.com) → **Settings** → **General**.
2. **Root Directory:** Click **Edit**, set to **`helpdesk-app/frontend`** (no leading slash), then **Save**.
3. **Settings** → **Build & Development**: set **Build Command** to `npm run build` and **Output Directory** to `dist`. Save.
4. Go to **Deployments** → open the **⋯** menu on the latest → **Redeploy** (use “Redeploy with existing Build Cache” or without, both are fine).

After the redeploy, the build should take several seconds and the logs should show `npm install` and `vite build`. The new deployment will be **Current** (not Stale) and the site should load instead of 404.

### After deploy

- In **Google Cloud Console** (OAuth): add the production redirect URI, e.g.  
  `https://your-app.vercel.app/oauth/callback`
- In **Supabase** (Authentication → URL Configuration): set **Site URL** to your Vercel URL and add **Redirect URLs** (e.g. `https://your-app.vercel.app/**`).

---

## 2. Supabase (migrations + Edge Functions)

Your database and Edge Functions run on Supabase. You don’t deploy them to Vercel.

### Run migrations

From your machine (or a CI step):

```bash
cd helpdesk-app/backend
npx supabase link --project-ref YOUR_PROJECT_REF   # if not already linked
npx supabase db push
```

Or in **Supabase Dashboard** → **SQL Editor**: run the contents of each migration file under `backend/supabase/migrations/` in order (if you’re not using `db push`).

### Deploy Edge Functions

```bash
cd helpdesk-app/backend
npx supabase functions deploy oauth-gmail-callback
npx supabase functions deploy send-gmail-reply
npx supabase functions deploy send-gmail-forward
npx supabase functions deploy send-invitation-email
npx supabase functions deploy sync-gmail-emails
# Or deploy all: npx supabase functions deploy
```

Set **REDIRECT_URI** for `oauth-gmail-callback` (Supabase Dashboard → Edge Functions → oauth-gmail-callback → Secrets): e.g. `https://your-app.vercel.app/oauth/callback`.

Set secrets (Dashboard → Edge Functions → Secrets or CLI):

- **`REDIRECT_URI`** – **Required for Gmail OAuth.** Set to your production callback URL, e.g. `https://your-app.vercel.app/oauth/callback`. Must be identical to `VITE_GOOGLE_REDIRECT_URI` and to the URI in Google Console "Authorized redirect URIs". No default (do not use localhost in production).
- Google Client ID/Secret are configured **per tenant** in the app (E-post innbokser, admin). No global `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Edge Function env unless you add them for a fallback.
- For cron: `CRON_SECRET`, and vault secrets `project_url`, `gmail_sync_cron_secret` (see `scripts/create-vault-secrets-for-cron.sql`).

---

## 3. Summary

| Part              | Where it runs | How to deploy / update                          |
|-------------------|---------------|-------------------------------------------------|
| React frontend    | Vercel        | Git push → Vercel auto-deploy (or `vercel --prod`) |
| Database + RLS    | Supabase      | `supabase db push` or run migrations in SQL Editor |
| Edge Functions    | Supabase      | `supabase functions deploy <name>`              |
| Auth, Storage     | Supabase      | Configure in Supabase Dashboard                 |

After the first deploy, use the **production** frontend URL everywhere (Google OAuth redirect, Supabase redirect URLs, and `VITE_GOOGLE_REDIRECT_URI`).
