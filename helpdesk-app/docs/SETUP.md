# Setup Guide

## Prerequisites

- Node.js 18+
- Supabase account
- Google Cloud account (for Gmail API)

## 1. Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Wait for the database to be ready, then open **SQL Editor**.
3. Run each migration in order:
   - `001_create_customers.sql`
   - `002_create_tickets.sql`
   - `003_create_messages.sql`
   - `004_create_team_members.sql`
   - `005_create_templates.sql`
   - `006_create_gmail_sync.sql`
   - `007_setup_rls.sql`
4. In **Authentication → URL Configuration**, set:
   - Site URL: `http://localhost:5173` (or your app URL)
   - Redirect URLs: include `http://localhost:5173/oauth/callback`
5. In **Project Settings → API**, copy:
   - Project URL → `VITE_SUPABASE_URL`
   - anon public key → `VITE_SUPABASE_ANON_KEY`

## 2. Frontend environment

In `frontend/`:

```bash
cp .env.example .env
```

Edit `.env`:

- `VITE_SUPABASE_URL` – Supabase project URL
- `VITE_SUPABASE_ANON_KEY` – Supabase anon key
- `VITE_GOOGLE_CLIENT_ID` – Google OAuth client ID (from step 3)
- `VITE_GOOGLE_REDIRECT_URI` – `http://localhost:5173/oauth/callback` (must match Google Console)

## 3. Google Cloud & Gmail API

1. [Google Cloud Console](https://console.cloud.google.com) → create or select a project.
2. **APIs & Services → Library** → search “Gmail API” → Enable.
3. **APIs & Services → Credentials** → Create credentials → OAuth client ID.
4. Application type: **Web application**.
5. Authorized redirect URIs: add `http://localhost:5173/oauth/callback`.
6. Copy **Client ID** and **Client secret** (you’ll use Client ID in frontend, both in Edge Function secrets).

## 4. Supabase Edge Functions (Gmail flow)

Install Supabase CLI and link the project (or use the dashboard to deploy):

```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set secrets (Dashboard → Edge Functions → Secrets, or CLI):

- `GOOGLE_CLIENT_ID` – same as in frontend
- `GOOGLE_CLIENT_SECRET` – from Google Console
- `REDIRECT_URI` – `http://localhost:5173/oauth/callback` (must match frontend and Google)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are usually set automatically; if not, add them.

Deploy functions:

```bash
supabase functions deploy oauth-gmail-callback
supabase functions deploy sync-gmail-emails
supabase functions deploy send-gmail-reply
supabase functions deploy archive-gmail-email
```

## 5. First user and team member

1. Run the frontend: `cd frontend && npm install && npm run dev`.
2. Open http://localhost:5173 and **Sign up** with your email and password.
3. In Supabase **Authentication → Users**, copy your user’s UUID.
4. In **SQL Editor** run:

```sql
INSERT INTO team_members (user_id, name, email, role)
VALUES (
  'PASTE_YOUR_USER_UUID_HERE',
  'Your Name',
  'your@email.com',
  'admin'
);
```

5. Refresh the app; you should see the dashboard and be able to create tickets and connect Gmail.

## 6. Connect Gmail

1. Log in to the app.
2. Go to **Settings**.
3. Under **Gmail integration**, click **Connect Gmail account**.
4. Authorize with Google (Gmail read/send/modify).
5. You’ll be redirected back; “Sync now” will pull unread inbox emails into tickets.

## Troubleshooting

- **RLS / “permission denied”**: Ensure your user has a row in `team_members` with `is_active = true`.
- **OAuth “redirect_uri_mismatch”**: Ensure `VITE_GOOGLE_REDIRECT_URI` and Google Console redirect URI match exactly (including trailing slash or not).
- **Edge Function “Gmail not connected”**: Complete the Gmail OAuth flow in Settings first; the Edge Function needs a row in `gmail_sync` for your user.
