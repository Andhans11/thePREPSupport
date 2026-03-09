# Security Fix Plan

This file contains step-by-step instructions for fixing all security issues found during the audit. Each task is self-contained and can be run as a Cursor prompt.

---

## Phase 1: CRITICAL — Self-Promotion & Cross-Tenant Data Leaks

### Task 1: Fix agent self-promotion to admin

**Prompt for Cursor:**

> In `helpdesk-app/backend/supabase/migrations/`, create a new migration that fixes the `team_members` UPDATE RLS policy so that only admins can change the `role` column. Currently any team member can PATCH their own row and set `role='admin'`. The fix should:
>
> 1. DROP the existing "Team members can update team_members" policy
> 2. Create two new policies:
>    - "Team members can update own profile" — allows any member to update their own row (where `user_id = auth.uid()`) BUT only if `role` remains unchanged (use a subquery: `role = (SELECT tm.role FROM team_members tm WHERE tm.id = team_members.id)`)
>    - "Admins can update any team member" — allows admins (`EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = team_members.tenant_id AND tm.role = 'admin' AND tm.is_active = true)`) to update any row in their tenant
> 3. Both policies must include `user_has_tenant_access(tenant_id)` in the USING clause
>
> Name the migration file with the next available number prefix. Test by verifying an agent cannot PATCH their role to admin.

---

### Task 2: Fix `planning_slots` cross-tenant RLS

**Prompt for Cursor:**

> In `helpdesk-app/backend/supabase/migrations/`, create a new migration that fixes ALL RLS policies on the `planning_slots` table. Currently they use `is_team_member()` which allows cross-tenant access. The migration should:
>
> 1. DROP these policies: "Team members can read planning_slots", "Team members can insert planning_slots", "Team members can update planning_slots", "Team members can delete planning_slots"
> 2. Recreate all four with `user_has_tenant_access(tenant_id)` instead of `is_team_member()`:
>    - SELECT: `USING (user_has_tenant_access(tenant_id))`
>    - INSERT: `WITH CHECK (user_has_tenant_access(tenant_id))`
>    - UPDATE: `USING (user_has_tenant_access(tenant_id))`
>    - DELETE: `USING (user_has_tenant_access(tenant_id))`
>
> Test by confirming a user from Tenant B cannot read or delete Tenant A's planning slots via the REST API.

---

### Task 3: Fix `planning_slot_requests` cross-tenant RLS

**Prompt for Cursor:**

> In `helpdesk-app/backend/supabase/migrations/`, create a new migration that fixes ALL RLS policies on the `planning_slot_requests` table. Replace `is_team_member()` with `user_has_tenant_access(tenant_id)` in all policies (SELECT, INSERT, UPDATE). Keep any additional checks that already exist (e.g. `requested_by` ownership checks for INSERT, admin/manager checks for UPDATE) — only replace the `is_team_member()` part.

---

### Task 4: Fix `company-logos` storage cross-tenant access

**Prompt for Cursor:**

> In `helpdesk-app/backend/supabase/migrations/`, create a new migration that fixes the storage policies on the `company-logos` bucket. Currently ANY authenticated user can upload, update, or delete logos for ANY tenant because the policies only check `bucket_id = 'company-logos'`. The migration should:
>
> 1. DROP existing policies on `storage.objects` that reference `company-logos`
> 2. Recreate them with tenant scoping: the first folder segment of the object name is the `tenant_id`, so add a check like `user_has_tenant_access(((storage.foldername(name))[1])::uuid)` to all policies (SELECT, INSERT, UPDATE, DELETE)
>
> Use the same pattern as the `ticket-attachments` bucket in migration `027_ticket_attachments_storage.sql` for reference.

---

### Task 5: Fix OAuth callback tenant membership check

**Prompt for Cursor:**

> In `helpdesk-app/backend/supabase/functions/oauth-gmail-callback/index.ts`, add a tenant membership check BEFORE the OAuth code exchange. After the `tenantId` is extracted from the request body (around line 60-68) and after the user is authenticated, add a check using the service role client:
>
> ```typescript
> const { data: member } = await serviceSupabaseForOAuth
>   .from('team_members')
>   .select('id')
>   .eq('tenant_id', tenantId)
>   .eq('user_id', user.id)
>   .eq('is_active', true)
>   .maybeSingle();
> if (!member) {
>   return new Response(JSON.stringify({ error: 'Access denied to this tenant' }), {
>     status: 403,
>     headers: { ...corsHeaders, 'Content-Type': 'application/json' },
>   });
> }
> ```
>
> Place this check right after `if (!tenantId)` and before the `serviceSupabaseForOAuth.from('tenant_google_oauth')` query. Create the `serviceSupabaseForOAuth` client earlier if needed so it's available at that point.

---

## Phase 2: HIGH — Cross-Tenant Reads, XSS, Auth Hardening

### Task 6: Fix time registration tables cross-tenant RLS

**Prompt for Cursor:**

> In `helpdesk-app/backend/supabase/migrations/`, create a new migration that fixes the READ policies on these four tables:
>
> - `time_registration_work_types`
> - `time_registration_projects`
> - `time_registration_absence_types`
> - `time_registration_approvers`
>
> For each table, DROP the existing "Team members can read ..." policy and recreate it using `user_has_tenant_access(tenant_id)` instead of `is_team_member()`.
>
> Also fix `time_entries` INSERT, UPDATE, and DELETE policies to use `user_has_tenant_access(tenant_id)` instead of `is_team_member()`. Keep all other existing checks (ownership, admin/manager, status checks) intact — only replace the `is_team_member()` part.

---

### Task 7: Fix Handlebars XSS vulnerability

**Prompt for Cursor:**

> Fix the stored XSS vulnerability in the Handlebars template system. The issue is that `compileTemplate()` in `helpdesk-app/frontend/src/utils/templateHandlebars.ts` uses `noEscape: true`, and the result is injected via `innerHTML` in `ReplyBox.tsx` (line ~267). Customer data (name, email, company) flows into the template context, so malicious customer names like `<img src=x onerror=alert(1)>` execute as HTML.
>
> Fix approach:
> 1. In `ReplyBox.tsx`, import `sanitizeMessageHtml` from `../utils/sanitizeHtml`
> 2. In the `insertTemplate` function (~line 264-268), sanitize the compiled output before injecting:
>    ```tsx
>    const compiled = compileTemplate(t.content, templateContext);
>    const html = sanitizeMessageHtml(compiled.replace(/\n/g, '<br>'));
>    editorRef.current.innerHTML += (editorRef.current.innerHTML ? '<br><br>' : '') + html;
>    ```
> 3. Also do the same in `ForwardBox.tsx` if it has a similar `insertTemplate` function
>
> Do NOT change the `noEscape: true` in `templateHandlebars.ts` — templates legitimately contain HTML formatting. The fix is to sanitize the output before DOM insertion.

---

### Task 8: Fix `.env` gitignore and error response leaks

**Prompt for Cursor:**

> 1. Add `.env` to `helpdesk-app/frontend/.gitignore` (currently only `.env*.local` is excluded)
>
> 2. In ALL Edge Functions under `helpdesk-app/backend/supabase/functions/`, replace raw error detail leakage with generic messages. Specifically:
>    - `oauth-gmail-callback/index.ts` line ~140: Change `{ error: message, details: errText }` to `{ error: message }` (remove `details`)
>    - `sync-gmail-emails/index.ts` line ~257: Change `{ error: 'Gmail list failed', details: await listRes.text() }` to `{ error: 'Gmail sync failed' }`
>    - `sync-gmail-emails/index.ts` line ~541: Change `{ error: error.message }` to `{ error: 'Internal sync error' }`
>    - `send-gmail-reply/index.ts` line ~162: Change `{ error: insertErr.message }` to `{ error: 'Failed to save message' }`
>    - `send-gmail-forward/index.ts` line ~212: Change `{ error: await sendRes.text() }` to `{ error: 'Failed to send email' }`
>
> Keep the detailed error messages in `console.error()` calls for server-side logging — just don't return them to the client.

---

## Phase 3: MEDIUM — CORS, OAuth, Input Validation

### Task 9: Restrict CORS and add URL validation

**Prompt for Cursor:**

> 1. In ALL Edge Functions under `helpdesk-app/backend/supabase/functions/`, replace the hardcoded `'Access-Control-Allow-Origin': '*'` with a dynamic origin check. Read allowed origins from an environment variable:
>    ```typescript
>    const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map(s => s.trim());
>    function getCorsOrigin(req: Request): string {
>      const origin = req.headers.get('Origin') ?? '';
>      if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return origin || '*';
>      return ALLOWED_ORIGINS[0] ?? '';
>    }
>    ```
>    Then use `getCorsOrigin(req)` instead of `'*'` in the CORS headers. Extract this into `_shared/cors.ts` so all functions import it.
>
> 2. In `send-invitation-email/index.ts`, validate `inviteLink` is an `https://` or `http://` URL before injecting it into HTML:
>    ```typescript
>    if (!/^https?:\/\//i.test(inviteLink)) {
>      return new Response(JSON.stringify({ error: 'Invalid invite link URL' }), {
>        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
>      });
>    }
>    ```
>
> 3. In `sign-ticket-attachment-urls/index.ts`, reject paths containing `..`:
>    ```typescript
>    function normalizePath(p: string): string {
>      const cleaned = String(p).trim().replace(/^\/+|\/+$/g, '');
>      if (cleaned.includes('..')) throw new Error('Invalid path');
>      return cleaned;
>    }
>    ```

---

### Task 10: Fix Edge Function bugs (null pointer, unchecked responses, CORS)

**Prompt for Cursor:**

> Fix these bugs in the Edge Functions:
>
> 1. `send-gmail-reply/index.ts` (~line 152): Add a null check for `ticket` before accessing `ticket.tenant_id`. If `ticket` is null, return a 404 response.
>
> 2. `archive-gmail-email/index.ts` (~line 87-95): Check the Gmail API response after the `fetch` call. If `!res.ok`, return an error response instead of always returning `{ success: true }`.
>
> 3. `archive-gmail-email/index.ts`: Fix incomplete CORS headers. The OPTIONS handler only sets `Access-Control-Allow-Origin` — add the full CORS headers (`Allow-Methods`, `Allow-Headers`, `Max-Age`). Also add CORS headers to all other responses.
>
> 4. `send-invitation-email/index.ts` (~line 194): Replace the empty `catch {}` with `catch (err) { console.error('Failed to send invitation email via Gmail:', err); }`.

---

### Task 11: Fix inconsistent Edge Function OAuth credentials

**Prompt for Cursor:**

> `archive-gmail-email/index.ts` and `send-invitation-email/index.ts` use global environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) for OAuth credentials, while other functions (`oauth-gmail-callback`, `send-gmail-reply`, `send-gmail-forward`, `sync-gmail-emails`) correctly use per-tenant credentials from the `tenant_google_oauth` table.
>
> Update `archive-gmail-email/index.ts` and `send-invitation-email/index.ts` to:
> 1. Accept `tenant_id` from the request body or derive it from context
> 2. Look up `client_id` and `client_secret` from the `tenant_google_oauth` table (using the service role client) instead of env vars
> 3. Fall back to env vars only if the DB lookup returns nothing (for backward compatibility)
> 4. Update the `getAccessToken` function signature to accept `(refreshToken, clientId, clientSecret)` like the other functions

---

## Phase 4: Code Quality & Shared Modules

### Task 12: Extract shared Edge Function modules

**Prompt for Cursor:**

> Create shared modules for the Edge Functions to eliminate duplication:
>
> 1. Create `helpdesk-app/backend/supabase/functions/_shared/cors.ts`:
>    - Export `getCorsHeaders(req: Request): Record<string, string>` that returns the standard CORS headers with dynamic origin
>    - Export `handleCorsOptions(req: Request): Response` for preflight handling
>
> 2. Create `helpdesk-app/backend/supabase/functions/_shared/encoding.ts`:
>    - Move the `encodeBase64Url` function here (currently duplicated in 5 functions)
>
> 3. Create `helpdesk-app/backend/supabase/functions/_shared/auth.ts`:
>    - Export `getAuthenticatedUser(req: Request)` that extracts the Bearer token, creates a Supabase client, calls `getUser()`, and returns `{ user, token }` or throws
>    - Export `getServiceClient()` that creates and returns a Supabase service role client
>
> 4. Create `helpdesk-app/backend/supabase/functions/_shared/oauth.ts`:
>    - Move `getAccessToken(refreshToken, clientId, clientSecret)` here
>
> Then update all 8 Edge Functions to import from these shared modules instead of duplicating the code. Use Deno-style imports: `import { getCorsHeaders } from '../_shared/cors.ts'`.

---

### Task 13: Extract `callEdgeFunction` helper in frontend

**Prompt for Cursor:**

> In `helpdesk-app/frontend/src/services/api.ts`, the token-refresh + fetch + error-parse pattern is repeated in every function. Extract a shared helper:
>
> ```typescript
> async function getAuthToken(): Promise<string | null> {
>   const { data, error } = await supabase.auth.refreshSession();
>   if (error || !data.session?.access_token) return null;
>   return data.session.access_token;
> }
>
> async function callEdgeFunction<T = unknown>(
>   functionName: string,
>   body: Record<string, unknown>,
> ): Promise<{ data?: T; error?: string }> {
>   const token = await getAuthToken();
>   if (!token) return { error: 'Ikke innlogget' };
>   const res = await fetch(
>     `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
>     {
>       method: 'POST',
>       headers: {
>         Authorization: `Bearer ${token}`,
>         'Content-Type': 'application/json',
>       },
>       body: JSON.stringify(body),
>     },
>   );
>   const json = await res.json().catch(() => null);
>   if (!res.ok) return { error: (json as any)?.error ?? `HTTP ${res.status}` };
>   return { data: json as T };
> }
> ```
>
> Then refactor `sendGmailReply`, `sendGmailForward`, `archiveGmailEmail`, `notifyNewTicket`, `sendInvitationEmail`, and `triggerGmailSync` to use `callEdgeFunction` instead of duplicating the pattern.

---

## Phase 5: Frontend Performance & Reliability

### Task 14: Memoize all context providers

**Prompt for Cursor:**

> Every React context provider in `helpdesk-app/frontend/src/contexts/` creates a new value object on every render, causing unnecessary re-renders of all consumers. Fix ALL of these:
>
> For each context file (`AuthContext.tsx`, `TenantContext.tsx`, `GmailContext.tsx`, `MasterDataContext.tsx`, `ToastContext.tsx`, `TicketContext.tsx`, `DashboardContext.tsx`):
> 1. Wrap every function passed through the context value in `useCallback` with appropriate dependencies
> 2. Wrap the context `value` object in `useMemo`
>
> Also fix these error handling issues while you're in each file:
> - `AuthContext.tsx`: Add `.catch(() => setLoading(false))` to the `getSession()` call
> - `TenantContext.tsx`: Wrap `refetchTenants` in `try/finally` so `setLoading(false)` always runs
> - `GmailContext.tsx`: Replace `.catch(() => {})` with `.catch((err) => console.warn('Gmail sync refresh failed:', err))`
> - `ToastContext.tsx`: Store timeout IDs in a ref and clear them on unmount
> - `MasterDataContext.tsx`: Wrap `refetch` in `try/finally`; throw in `useMasterData` when used outside provider (instead of returning no-op fallback)

---

### Task 15: Add React.memo and fix TicketList performance

**Prompt for Cursor:**

> Fix performance issues in the ticket list:
>
> 1. In `helpdesk-app/frontend/src/components/tickets/TicketList.tsx`:
>    - Wrap the `TicketRow` component (or its equivalent) in `React.memo`
>    - Replace inline arrow functions in the `.map()` callback (like `onSelect={() => selectTicket(ticket)}`) with memoized callbacks. Use a pattern like passing `ticketId` and a stable `onSelect` callback, or use `useCallback` for the handlers
>    - Add debouncing (300ms) to the search input using a `useRef` + `setTimeout` pattern or a `useDebouncedValue` hook
>
> 2. In `helpdesk-app/frontend/src/components/tickets/TicketMessage.tsx`:
>    - Wrap the component in `React.memo`
>
> 3. In `helpdesk-app/frontend/src/contexts/TicketContext.tsx`:
>    - Remove the unused `_searchResultIds` state (line ~56) that triggers re-renders without being read
>    - Use refs for `fetchTickets`/`fetchMessages` in the realtime subscription effect so the channel isn't recreated when these functions change

---

## Phase 6: Split Oversized Components

### Task 16: Split PlanningPage (2,257 lines)

**Prompt for Cursor:**

> Split `helpdesk-app/frontend/src/pages/PlanningPage.tsx` (2,257 lines) into smaller components. Extract:
>
> 1. `PlanningCalendarGrid` — the weekly calendar grid with time slots, drag selection, and slot blocks
> 2. `PlanningSlotBlock` — individual slot rendering within the calendar
> 3. `PlanningSelectionPopup` — the popup that appears when selecting time slots
> 4. `PlanningRightPanel` — the right sidebar with "Planlagt", "Godkjenn", "Søknader" tabs
> 5. `PlanningSlotDetailModal` — the modal for viewing/editing slot details
> 6. `PlanningRejectModal` — the rejection comment modal
>
> Place them in `helpdesk-app/frontend/src/components/planning/`. Keep shared state in `PlanningPage` and pass it down via props. Use TypeScript interfaces for all props.

---

### Task 17: Extract shared UI components

**Prompt for Cursor:**

> Extract these duplicated UI patterns into shared components in `helpdesk-app/frontend/src/components/ui/`:
>
> 1. `TrendlineChart` — the SVG trend chart duplicated in `AnalyticsPage.tsx` (lines 59-176) and `DashboardPage.tsx` (lines 39-161). Create a generic component with props: `data: { date: string; value: number }[]`, `color: string`, `height: number`, `label: string`
>
> 2. `MentionDropdown` — duplicated in `TicketDetail.tsx` (lines 509-523) and `ReplyBox.tsx` (lines 469-486). Props: `members: { id: string; name: string }[]`, `query: string`, `onSelect: (member) => void`, `position: { top: number; left: number }`
>
> 3. `ConfirmDialog` — replace `window.confirm()` calls throughout the app with an accessible dialog using `role="dialog"`, `aria-modal="true"`, and focus trapping. Props: `title: string`, `message: string`, `onConfirm: () => void`, `onCancel: () => void`, `confirmLabel?: string`, `variant?: 'danger' | 'default'`
>
> 4. `StatCard` — the repeated stat card pattern in `AnalyticsPage.tsx` (lines 469-531). Props: `label: string`, `value: string | number`, `icon: LucideIcon`, `color: string`
>
> Then update all files that use these patterns to import the shared components.

---

## Phase 7: Cleanup

### Task 18: Remove unused code and fix TypeScript

**Prompt for Cursor:**

> 1. In `helpdesk-app/frontend/src/utils/validators.ts`: The exports `isValidEmail` and `isNonEmptyString` are never imported anywhere. Either:
>    - Use `isValidEmail` in `LoginPage.tsx`, `SignupPage.tsx`, `ForwardBox.tsx`, and `ReplyBox.tsx` for email validation
>    - OR delete the file if validation is handled by HTML5 `type="email"` and Supabase
>
> 2. In `helpdesk-app/frontend/src/components/tickets/TicketDetail.tsx` (~line 59-67): Remove the local `extractMentionedUserIds` function and import it from `../../utils/sanitizeHtml` instead (it's already exported there)
>
> 3. In `helpdesk-app/frontend/src/utils/notificationIcons.tsx` (line ~15): Fix the null pointer — change `n.title.toLowerCase()` to `n.title?.toLowerCase()` with optional chaining
>
> 4. Run `npx supabase gen types typescript --local > helpdesk-app/frontend/src/types/supabase.ts` to generate TypeScript types from the database schema, then gradually replace `as` type assertions with proper types in contexts and hooks

---

## Quick Reference: All Migrations Needed

```
051_fix_team_members_role_escalation.sql    (Task 1)
052_fix_planning_slots_rls.sql              (Task 2)
053_fix_planning_slot_requests_rls.sql      (Task 3)
054_fix_company_logos_storage_rls.sql       (Task 4)
055_fix_time_registration_rls.sql           (Task 6)
```

Run `cd helpdesk-app/backend && npx supabase db reset` after creating all migrations to verify they apply cleanly.
