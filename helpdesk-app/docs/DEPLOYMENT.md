# Deployment

## Frontend (Vercel / Netlify)

1. Build command: `npm run build`
2. Output directory: `dist`
3. Root: `frontend`
4. Environment variables: add all `VITE_*` from `.env.example` with production values.
5. For production, set:
   - `VITE_GOOGLE_REDIRECT_URI` to `https://yourdomain.com/oauth/callback`
   - Add `https://yourdomain.com` and `https://yourdomain.com/oauth/callback` to Supabase Auth redirect URLs and Google OAuth redirect URIs.

## Supabase

- Migrations: run the same migrations on the production Supabase project (SQL Editor or `supabase db push` if using CLI).
- Edge Functions: deploy with `supabase functions deploy ...` and set production secrets:
  - `REDIRECT_URI=https://yourdomain.com/oauth/callback`
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (can be same as dev or a separate OAuth client for production).

## Checklist

- [ ] Production Supabase project created and migrations applied
- [ ] Production environment variables set in hosting (Vercel/Netlify)
- [ ] Google OAuth redirect URI updated for production URL
- [ ] Supabase Auth redirect URLs include production app URL and `/oauth/callback`
- [ ] Edge Functions deployed with production `REDIRECT_URI`
- [ ] Team members added in production DB for real users
