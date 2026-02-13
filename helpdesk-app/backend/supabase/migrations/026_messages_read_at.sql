-- Optional: mark when a message was read (null = unread). New customer replies from sync stay unread until viewed.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(ticket_id) WHERE read_at IS NULL;
