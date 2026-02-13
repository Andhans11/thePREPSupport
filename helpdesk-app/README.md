# Support Helpdesk Application

A production-ready support helpdesk web application that integrates with Gmail for email management, uses Supabase as the backend, and provides ticket management for support teams.

## Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, React Router v6
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Integrations**: Gmail API via OAuth 2.0

## Quick start

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run migrations: in the Supabase dashboard, SQL Editor, run the files in `backend/supabase/migrations/` in order (001 through 007).
3. Copy `frontend/.env.example` to `frontend/.env` and set:
   - `VITE_SUPABASE_URL` – Project URL
   - `VITE_SUPABASE_ANON_KEY` – anon public key
4. In Authentication → Providers, enable Email and set site URL / redirect URLs as needed.

### 2. Google Cloud (Gmail OAuth)

1. Create a project in [Google Cloud Console](https://console.cloud.google.com).
2. Enable the **Gmail API**.
3. Create **OAuth 2.0 Client ID** (Web application).
4. Set authorized redirect URI to `http://localhost:5173/oauth/callback` (and your production URL when deploying).
5. Copy Client ID and Client Secret.
6. In `frontend/.env` set:
   - `VITE_GOOGLE_CLIENT_ID` – OAuth client ID
   - `VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/oauth/callback`

### 3. Edge Functions (optional for local Gmail flow)

Deploy and set secrets so the OAuth callback and Gmail sync work:

```bash
cd backend
supabase functions deploy oauth-gmail-callback
supabase functions deploy sync-gmail-emails
supabase functions deploy send-gmail-reply
supabase functions deploy archive-gmail-email
supabase secrets set GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx REDIRECT_URI=http://localhost:5173/oauth/callback
```

For production, set `REDIRECT_URI` to your production callback URL.

### 4. Team member (required for RLS)

After signing up, add yourself as a team member so you can read/write data. In Supabase SQL Editor:

```sql
INSERT INTO team_members (user_id, name, email, role)
VALUES (
  'YOUR_AUTH_USER_UUID',
  'Your Name',
  'your@email.com',
  'admin'
);
```

Get `YOUR_AUTH_USER_UUID` from Authentication → Users in the Supabase dashboard.

### 5. Run the app

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, sign up or log in, then go to **Settings → Gmail integration** to connect Gmail.

## Project structure

- `frontend/` – React app (Vite + TypeScript + Tailwind)
- `backend/supabase/migrations/` – PostgreSQL schema and RLS
- `backend/supabase/functions/` – Edge Functions (OAuth, Gmail sync, send reply, archive)
- `docs/` – SETUP.md, DEPLOYMENT.md, API.md

## Phase 1 MVP features

- Supabase project and database schema
- Email/password authentication
- Ticket list and detail views with search/filter
- Gmail OAuth integration and “Connect Gmail”
- Basic email sync (read unread inbox, create tickets)
- Send replies via Gmail (and store messages)
- Customer management and history
- Basic analytics dashboard

See `docs/SETUP.md` and `PRD.md` for full details.
