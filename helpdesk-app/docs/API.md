# API Reference

The app uses Supabase for data and custom Edge Functions for Gmail.

## Supabase (client)

- **Auth**: `supabase.auth.signInWithPassword`, `signUp`, `signOut`, `getSession`, `getUser`.
- **Tables**: `customers`, `tickets`, `messages`, `team_members`, `templates`, `gmail_sync` (RLS applied). Use `supabase.from('table').select/insert/update/delete` with the anon key; RLS enforces access.

## Edge Functions

Base URL: `https://<project-ref>.supabase.co/functions/v1/<function-name>`

All functions require `Authorization: Bearer <supabase_jwt>` (user’s session access token).

### POST /functions/v1/oauth-gmail-callback

Exchanges Google OAuth code for tokens and stores them in `gmail_sync`.

**Body:** `{ "code": "..." }`

**Response:** `{ "success": true }` or `{ "error": "..." }`

---

### POST /functions/v1/sync-gmail-emails

Fetches unread emails from Gmail inbox, creates customers/tickets/messages, updates `gmail_sync.last_sync_at`.

**Body:** none

**Response:** `{ "success": true, "created": number }` or `{ "error": "..." }`

---

### POST /functions/v1/send-gmail-reply

Sends a reply via Gmail (or stores an internal note).

**Body:**  
`{ "ticketId": "uuid", "message": "text", "to": "email", "isInternalNote": false }`

**Response:** `{ "success": true }` or `{ "error": "..." }`

---

### POST /functions/v1/archive-gmail-email

Removes INBOX label from a Gmail message.

**Body:** `{ "gmailMessageId": "..." }` or `{ "threadId": "..." }`

**Response:** `{ "success": true }` or `{ "error": "..." }`
