# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a **Support Helpdesk** application ("thePREP Support") — a ticket management system with Gmail integration. The frontend is a React 18 + Vite + TypeScript + Tailwind CSS SPA; the backend is Supabase (PostgreSQL, Auth, Edge Functions in Deno).

### Services

| Service | How to run | Port |
|---|---|---|
| **Vite dev server** (frontend) | `cd helpdesk-app/frontend && npm run dev` | 5173 |
| **Supabase (local)** | `cd helpdesk-app/backend && npx supabase start` | API: 54321, DB: 54322, Studio: 54323 |

### Running locally

1. **Docker must be running** before `supabase start`. Start the daemon with `sudo dockerd &>/tmp/dockerd.log &` then `sudo chmod 666 /var/run/docker.sock`.
2. `npx supabase start` (from `helpdesk-app/backend`) pulls containers on first run (~60 s) and auto-applies all 50 migrations.
3. After Supabase is up, `npx supabase status` prints the local API URL and keys (Publishable = anon key, Secret = service_role key).
4. Copy those into `helpdesk-app/frontend/.env` (see `.env.example`).
5. `cd helpdesk-app/frontend && npm run dev` starts the Vite dev server on http://localhost:5173.

### Lint / Build / Test

- **Lint**: `npm run lint` — **NOTE**: the repo is currently missing an `eslint.config.js` file required by ESLint 9. The lint script will fail until that file is added.
- **Type-check**: `npx tsc -b` (from `helpdesk-app/frontend`)
- **Build**: `npm run build` (from `helpdesk-app/frontend`)
- No automated test suite exists in the repo.

### Caveats

- The app UI is in Norwegian.
- Gmail integration (OAuth) requires external Google Cloud credentials and is optional for core ticket management.
- Supabase Edge Functions (Deno) are in `helpdesk-app/backend/supabase/functions/`; they are deployed to Supabase Cloud or served locally with `npx supabase functions serve`.
