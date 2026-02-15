# Gmail sync – cost control (fewer invocations, still see all new mail)

The Gmail sync runs as one Edge Function invocation per cron tick: it syncs **all** connected tenants in that single run. Each run lists recent/unread messages and creates tickets for new ones, so you still see all new mail; the only lever is **how often** you run it.

---

## 1. **Cron interval (already applied)**

- **Default:** Cron runs every **15 minutes** (migration `041_gmail_sync_cron_15min.sql`).
- **Effect:** ~96 invocations/day instead of 288 (5‑min), so about **3× fewer** Edge Function invocations.
- **Trade-off:** New mail can be up to ~15 minutes old when it appears; “Sync now” in the app still gives immediate refresh when a user needs it.

To run **less often** (e.g. every 30 minutes), reschedule the same job in SQL:

```sql
SELECT cron.unschedule('sync-gmail-emails-every-5-min');
SELECT cron.schedule(
  'sync-gmail-emails-every-5-min',
  '*/30 * * * *',   -- every 30 min
  $$ ... same body as in 041_gmail_sync_cron_15min.sql ... $$
);
```

---

## 2. **Gmail Push (Watch) – invoke only when mail arrives (future)**

To cut invocations further while still seeing **all new** mail, you can switch to **Gmail Push**:

- **How it works:** You call Gmail’s `users.watch()` so Gmail sends an HTTP request to your endpoint when the mailbox changes. Your Edge Function (or webhook) then runs sync **only for that user/tenant** when a push is received.
- **Effect:** Invocations drop to roughly “number of sync-worthy events” (e.g. new mail) instead of a fixed 96/day. Quiet mailboxes cost almost no invocations.
- **Requirements:** A public HTTPS URL for the push endpoint, and (for Google Cloud) a Pub/Sub topic + subscription that forwards to that URL. The `gmail_sync` table already has `history_id` and `watch_expiration` for this.
- **Implementation outline:**
  1. New Edge Function (e.g. `gmail-push-webhook`) that accepts POSTs from Google Pub/Sub, decodes the push payload, finds the relevant `gmail_sync` row (e.g. by some tenant/user id in the topic or message), and calls the same sync logic for that row only.
  2. When connecting Gmail (or on cron as a fallback), call `users.watch()` with the Pub/Sub topic and store returned `historyId` and `expiration` in `gmail_sync`. Before `expiration`, renew watch.
  3. Optionally keep a **fallback cron** (e.g. every 1–2 hours) to catch missed pushes or watch expiry.

This is the most “smart” option: same “see all new” behavior, minimal invocations.

---

## 3. **Manual “Sync now”**

Users can always use **Sync now** in the app for immediate refresh. Relying on a 15–30 minute cron plus manual sync when needed is a good balance of cost vs freshness.

---

## Summary

| Approach              | Invocations (approx) | Freshness              |
|-----------------------|-----------------------|-------------------------|
| Cron every 5 min      | 288/day               | Up to 5 min delay       |
| **Cron every 15 min** | **96/day**            | Up to 15 min delay      |
| Cron every 30 min     | 48/day                | Up to 30 min delay      |
| Gmail Push + fallback | ~events only          | Near real-time on push  |

Recommendation: keep the current **15‑minute cron** and use **Sync now** when users need immediate results. Add **Gmail Push** later if you need both low cost and near real-time sync.
