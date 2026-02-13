# Deploying the Helpdesk App

The app has two parts:

- **Frontend** (React + Vite) → deploy to **Vercel**
- **Backend** (Supabase: DB, Auth, Storage, Edge Functions) → already on **Supabase**; you run migrations and deploy functions from your machine or CI

---

## 1. Deploy frontend to Vercel

### Option A: Vercel Dashboard (recommended)

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
   | `VITE_GOOGLE_CLIENT_ID`  | Your Google OAuth client ID | From Google Cloud Console  |
   | `VITE_GOOGLE_REDIRECT_URI` | `https://your-app.vercel.app/oauth/callback` | Your Vercel URL + `/oauth/callback` |

7. **Deploy.** After the first deploy, set `VITE_GOOGLE_REDIRECT_URI` to the real URL (e.g. `https://your-project.vercel.app/oauth/callback`) and redeploy if you changed it.

### Option B: Vercel CLI

```bash
cd helpdesk-app/frontend
npm i -g vercel
vercel
# Follow prompts; set Root to . when asked
# Add env vars: vercel env add VITE_SUPABASE_URL (etc.)
```

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
npx supabase functions deploy send-gmail-reply
npx supabase functions deploy send-gmail-forward
npx supabase functions deploy send-invitation-email
npx supabase functions deploy sync-gmail-emails
# Or deploy all: npx supabase functions deploy
```

Set secrets (Dashboard → Edge Functions → Secrets or CLI):

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
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
