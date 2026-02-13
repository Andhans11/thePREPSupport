# Gmail sync cron – one-time setup

This guide sets up the **5-minute Gmail sync** that runs on the server (so emails are synced even when nobody has the app open).

---

## Step 1: Find your Supabase project URL

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) and open your project.
2. In the left sidebar, click **Project Settings** (gear icon).
3. Under **General**, find **Reference ID** or look at the browser URL:  
   `https://supabase.com/dashboard/project/**xxxxxxxxxxxxxxxxxxxx**`  
   The `xxxxxxxxxxxxxxxxxxxx` part is your **project ref** (about 20 characters).
4. Your **project URL** is:  
   `https://xxxxxxxxxxxxxxxxxxxx.supabase.co`  
   (Replace `xxxxxxxxxxxxxxxxxxxx` with your actual ref.)

---

## Step 2: Create Vault secrets (in Supabase)

1. In the Supabase Dashboard, open **SQL Editor**.
2. Run these two statements **one at a time** (replace the project URL in the first with yours):

**2a. Project URL**

```sql
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'project_url',
  'Supabase project URL for cron'
);
```

Example if your ref is `abcdefghijklmnopqrst`:

```sql
select vault.create_secret(
  'https://abcdefghijklmnopqrst.supabase.co',
  'project_url',
  'Supabase project URL for cron'
);
```

**2b. Cron secret** (used to authenticate the cron request to the Edge Function)

```sql
select vault.create_secret(
  'gmail-sync-cron-5min-secret',
  'gmail_sync_cron_secret',
  'Cron auth for Gmail sync'
);
```

You can change `gmail-sync-cron-5min-secret` to a different random string if you prefer; if you do, use that same value in Step 3.

---

## Step 3: Add Edge Function secret

1. In the Supabase Dashboard, go to **Edge Functions**.
2. Open the **sync-gmail-emails** function.
3. Go to the **Secrets** (or **Settings**) section for that function.
4. Add a secret:
   - **Name:** `CRON_SECRET`
   - **Value:** `gmail-sync-cron-5min-secret` (must match the value you used in Step 2b)

Save.

---

## Step 4: Run the migration

From your machine, in the backend folder:

```bash
cd helpdesk-app/backend
supabase db push
```

If you prefer to run the migration SQL by hand:

1. In the Dashboard, open **SQL Editor**.
2. Copy the contents of `supabase/migrations/028_gmail_sync_cron.sql`.
3. Paste and run it.

---

## Verify

- In the Dashboard, go to **Database** → **Cron Jobs** (or **Integrations** → **Cron**). You should see **sync-gmail-emails-every-5-min** scheduled every 5 minutes.
- After a few minutes, check that new emails still create tickets and that the **Last sync** time for Gmail in your app’s settings updates.

If the cron fails (e.g. 401), double-check:

- `project_url` in Vault has no typo and no trailing slash.
- `CRON_SECRET` for the Edge Function exactly matches the value stored in Vault for `gmail_sync_cron_secret`.
