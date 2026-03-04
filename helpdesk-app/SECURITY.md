# Security

## Multi-tenant isolation (due diligence, March 2026)

A security due diligence (March 2026) identified and fixed **four critical** cross-tenant issues:

1. **`planning_slots`** — RLS used `is_team_member()` (any tenant). Fixed in migration **054**: policies now use `user_has_tenant_access(tenant_id)` so access is scoped to the row’s tenant.

2. **`planning_slot_requests`** — Same pattern. Fixed in migration **055**: SELECT, INSERT, and UPDATE policies use `user_has_tenant_access(tenant_id)`.

3. **`company-logos` storage** — Policies only checked `bucket_id`. Fixed in migration **056**: INSERT, UPDATE, and DELETE now require the object path’s first segment (tenant ID) to match a tenant the user belongs to via `user_has_tenant_access`.

4. **OAuth Gmail callback** — Callback accepted `tenant_id` from the client without verifying membership. Fixed in **`oauth-gmail-callback`** Edge Function: before exchanging the OAuth code, the function checks that the authenticated user is an active member of the given tenant via `team_members`; otherwise it returns 403.

When adding new tables or storage buckets, use **tenant-scoped RLS**: `user_has_tenant_access(tenant_id)` (or path-based tenant ID for storage), not only `is_team_member()`.
