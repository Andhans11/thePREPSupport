-- Dummy data for helpdesk app. Run in Supabase Dashboard → SQL Editor.
-- Uses fixed UUIDs so references work. Safe to run once; duplicate emails will error on re-run.

-- ========== Customers ==========
INSERT INTO customers (id, email, name, phone, company, notes) VALUES
  ('a1000001-0000-4000-8000-000000000001', 'sarah.jones@acme.io', 'Sarah Jones', '+1 555-0101', 'Acme Inc', 'VIP account'),
  ('a1000001-0000-4000-8000-000000000002', 'mike.chen@startup.co', 'Mike Chen', '+1 555-0102', 'Startup Co', NULL),
  ('a1000001-0000-4000-8000-000000000003', 'emma.wilson@techcorp.com', 'Emma Wilson', NULL, 'TechCorp', 'Prefers email'),
  ('a1000001-0000-4000-8000-000000000004', 'james.brown@freelance.dev', 'James Brown', '+1 555-0104', NULL, NULL),
  ('a1000001-0000-4000-8000-000000000005', 'lisa.davis@bigco.com', 'Lisa Davis', '+1 555-0105', 'BigCo', 'Enterprise plan')
ON CONFLICT (id) DO NOTHING;

-- ========== Tickets ==========
INSERT INTO tickets (id, ticket_number, customer_id, subject, status, priority, category) VALUES
  ('b2000001-0000-4000-8000-000000000001', 'TKT-0001', 'a1000001-0000-4000-8000-000000000001', 'Login not working after password reset', 'resolved', 'high', 'Technical'),
  ('b2000001-0000-4000-8000-000000000002', 'TKT-0002', 'a1000001-0000-4000-8000-000000000001', 'Invoice for Q1 subscription', 'open', 'medium', 'Billing'),
  ('b2000001-0000-4000-8000-000000000003', 'TKT-0003', 'a1000001-0000-4000-8000-000000000002', 'API rate limit errors', 'pending', 'high', 'Technical'),
  ('b2000001-0000-4000-8000-000000000004', 'TKT-0004', 'a1000001-0000-4000-8000-000000000003', 'Request for feature: bulk export', 'open', 'low', 'Feature request'),
  ('b2000001-0000-4000-8000-000000000005', 'TKT-0005', 'a1000001-0000-4000-8000-000000000004', 'Account cancellation', 'closed', 'medium', 'Account'),
  ('b2000001-0000-4000-8000-000000000006', 'TKT-0006', 'a1000001-0000-4000-8000-000000000005', 'Urgent: payment failed for renewal', 'open', 'urgent', 'Billing')
ON CONFLICT (id) DO NOTHING;

-- ========== Messages (conversation threads) ==========
-- TKT-0001
INSERT INTO messages (ticket_id, from_email, from_name, content, is_customer) VALUES
  ('b2000001-0000-4000-8000-000000000001', 'sarah.jones@acme.io', 'Sarah Jones', 'Hi, I reset my password yesterday but I still cannot log in. It says "Invalid credentials". I am sure I am using the new password.', true),
  ('b2000001-0000-4000-8000-000000000001', 'support@yourproduct.com', 'Support', 'Hi Sarah, we have cleared the session cache on our side. Please try logging in again in an incognito/private window. If it still fails, use "Forgot password" to trigger a new reset link.', false),
  ('b2000001-0000-4000-8000-000000000001', 'sarah.jones@acme.io', 'Sarah Jones', 'That worked, thanks!', true);

-- TKT-0002
INSERT INTO messages (ticket_id, from_email, from_name, content, is_customer) VALUES
  ('b2000001-0000-4000-8000-000000000002', 'sarah.jones@acme.io', 'Sarah Jones', 'We need the Q1 invoice for our accounting team. Can you send it to finance@acme.io?', true);

-- TKT-0003
INSERT INTO messages (ticket_id, from_email, from_name, content, is_customer) VALUES
  ('b2000001-0000-4000-8000-000000000003', 'mike.chen@startup.co', 'Mike Chen', 'We are getting 429 rate limit errors on the /v2/users endpoint. Our app makes about 100 req/min. What is the limit and can we get an increase?', true),
  ('b2000001-0000-4000-8000-000000000003', 'support@yourproduct.com', 'Support', 'Hi Mike, the default limit is 60/min. I have requested a limit increase for your API key. You should see 200/min within the next hour.', false);

-- TKT-0004
INSERT INTO messages (ticket_id, from_email, from_name, content, is_customer) VALUES
  ('b2000001-0000-4000-8000-000000000004', 'emma.wilson@techcorp.com', 'Emma Wilson', 'Would be great to have a bulk export of all our project data (CSV or JSON). Is this on the roadmap?', true);

-- TKT-0005
INSERT INTO messages (ticket_id, from_email, from_name, content, is_customer) VALUES
  ('b2000001-0000-4000-8000-000000000005', 'james.brown@freelance.dev', 'James Brown', 'I would like to cancel my account at the end of the current billing period. Please confirm.', true),
  ('b2000001-0000-4000-8000-000000000005', 'support@yourproduct.com', 'Support', 'Hi James, we have scheduled your cancellation for the end of the billing period. You will receive a confirmation email.', false);

-- TKT-0006
INSERT INTO messages (ticket_id, from_email, from_name, content, is_customer) VALUES
  ('b2000001-0000-4000-8000-000000000006', 'lisa.davis@bigco.com', 'Lisa Davis', 'Our renewal payment failed and our team lost access. This is urgent — we need access restored today.', true);

-- ========== Templates ==========
INSERT INTO templates (name, subject, content, category) VALUES
  ('Welcome', 'Welcome to support', 'Hi {{customer_name}},\n\nThank you for reaching out. We have received your request and will get back to you shortly.\n\nBest regards,\nSupport Team', 'General'),
  ('Issue resolved', NULL, 'Hi {{customer_name}},\n\nWe are glad we could help. If you have any other questions, feel free to reply to this email.\n\nBest regards,\nSupport Team', 'General'),
  ('Waiting for info', 'Re: Your support request', 'Hi {{customer_name}},\n\nTo move forward we need a bit more information:\n\n- [Please describe what you need]\n\nReply when you can and we will continue from there.\n\nBest regards,\nSupport Team', 'General');
