# Step-by-step: OAuth redirect URI for production (Vercel)

After deploying the frontend to Vercel, OAuth (e.g. Gmail) must redirect users back to your **production** URL, not `localhost`. Follow these steps in order.

---

## Step 1: Get your production frontend URL

1. Open [vercel.com](https://vercel.com) and go to your project.
2. Look at the **Domains** section (or the URL at the top when you open a deployment).
3. Your URL looks like: `https://your-project-name.vercel.app` (or a custom domain like `https://support.yourcompany.com`).
4. The **callback URL** you will use everywhere is:  
   **`https://your-project-name.vercel.app/oauth/callback`**  
   Replace with your real domain. Example: `https://theprep-support.vercel.app/oauth/callback`.

Write it down: **_________________________________________________/oauth/callback**

---

## Step 2: Set the redirect in Vercel (frontend)

1. In Vercel: open your project → **Settings** → **Environment Variables**.
2. Find **`VITE_GOOGLE_REDIRECT_URI`**.
   - If it’s missing, click **Add New**.
   - **Name:** `VITE_GOOGLE_REDIRECT_URI`
   - **Value:** your callback URL from Step 1 (e.g. `https://your-project.vercel.app/oauth/callback`).
   - **Environment:** Production (and Preview if you use preview deployments).
3. Save.
4. **Redeploy** the frontend (Deployments → ⋯ on latest → Redeploy) so the new value is baked into the build.

---

## Step 3: Set the redirect in Supabase (backend Edge Function)

The backend uses **Supabase Edge Functions**. They read `REDIRECT_URI` from **Supabase secrets**, not from your local `.env` file.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Edge Functions** (left sidebar).
3. Open **Secrets** (or **Project Settings** → **Edge Functions** → **Secrets**).
4. Set:
   - **Name:** `REDIRECT_URI`
   - **Value:** the same callback URL from Step 1 (e.g. `https://your-project.vercel.app/oauth/callback`).

   Or via CLI from your machine:

   ```bash
   cd helpdesk-app/backend
   npx supabase secrets set REDIRECT_URI=https://your-project.vercel.app/oauth/callback
   ```

5. Redeploy the OAuth-related Edge Function so it picks up the new secret:

   ```bash
   npx supabase functions deploy oauth-gmail-callback
   ```

Your **local** `helpdesk-app/backend/.env` can keep `REDIRECT_URI=http://localhost:5173/oauth/callback` for local development. Production uses the secret you just set.

---

## Step 4: Add the redirect in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → your project.
2. Open **APIs & Services** → **Credentials**.
3. Click your **OAuth 2.0 Client ID** (Web application).
4. Under **Authorized redirect URIs**, click **Add URI**.
5. Add exactly: your callback URL from Step 1 (e.g. `https://your-project.vercel.app/oauth/callback`).
   - Keep `http://localhost:5173/oauth/callback` if you still develop locally.
5. Click **Save**.

---

## Step 5: Add the URL in Supabase Auth (if you use Supabase Auth redirects)

1. In Supabase Dashboard go to **Authentication** → **URL Configuration**.
2. **Site URL:** set to your production frontend URL (e.g. `https://your-project.vercel.app`).
3. **Redirect URLs:** add:
   - `https://your-project.vercel.app/**`
   - `https://your-project.vercel.app/oauth/callback`  
   (Use your real domain.)
4. Save.

---

## Checklist

- [ ] Step 1: I know my production callback URL: `https://______/oauth/callback`
- [ ] Step 2: `VITE_GOOGLE_REDIRECT_URI` set in Vercel and frontend redeployed
- [ ] Step 3: `REDIRECT_URI` set in Supabase Edge Function secrets and `oauth-gmail-callback` redeployed
- [ ] Step 4: Same callback URL added in Google Cloud Console → Credentials → Authorized redirect URIs
- [ ] Step 5: Supabase Auth → URL Configuration has the production URL and redirect URLs

After this, sign-in and Gmail OAuth from the production site should redirect back to your Vercel app correctly.
