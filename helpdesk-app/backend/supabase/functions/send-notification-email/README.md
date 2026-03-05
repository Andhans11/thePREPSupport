# send-notification-email

Sends an email to the notification recipient when they have **E-post ved varsler** (email on notifications) enabled in Settings → Brukere.

## When emails are sent

- User is assigned to a ticket (by someone else)
- Another user adds a note/reply on a ticket assigned to you
- A customer replies on a ticket assigned to you

## Setup: Database Webhook

To trigger this function when a new notification is inserted:

1. In **Supabase Dashboard** go to **Database** → **Webhooks**.
2. Click **Create a new webhook**.
3. Name: e.g. `Send notification email`.
4. Table: `notifications`.
5. Events: tick **Insert**.
6. Type: **Supabase Edge Functions**.
7. Function: `send-notification-email`.
8. Create.

The webhook will POST the new row as `record` in the body; the function reads `record.user_id`, `record.tenant_id`, `record.title`, `record.body`, `record.link` and sends email via the tenant’s Gmail if the user has `email_on_notifications = true`.

## User setting

Users enable **E-post ved varsler** in **Innstillinger** → **Brukere** (toggle per user). The column `team_members.email_on_notifications` must exist (migration `055_team_members_email_on_notifications.sql`).
