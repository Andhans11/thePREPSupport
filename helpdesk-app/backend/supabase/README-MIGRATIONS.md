# Running migrations (two options)

## Option A: Supabase CLI (then we can run them for you)

1. **Install the CLI** (one time):
   ```bash
   brew install supabase/tap/supabase
   ```
   Or with npm: `npm install -g supabase`

2. **Log in and link your project** (one time):
   ```bash
   cd helpdesk-app/backend
   supabase login
   supabase link
   ```
   When prompted, choose your Supabase project and enter your **database password** (Project Settings → Database in the dashboard).

3. **Apply migrations** (you or the assistant can run):
   ```bash
   cd helpdesk-app/backend
   supabase db push
   ```

After step 2, the assistant can run `supabase db push` for you from this repo.

---

## Option B: Paste SQL in the dashboard

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Open `helpdesk-app/backend/supabase/run-all-migrations.sql` in your editor.
3. Copy all contents, paste into a new query, and click **Run**.

Use Option A if you want migrations run from the terminal (or by the assistant). Use Option B if you prefer not to install the CLI.
