CREATE TABLE gmail_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address VARCHAR(255) NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expiry TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  history_id VARCHAR(255),
  watch_expiration TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_gmail_sync_user_id ON gmail_sync(user_id);
CREATE INDEX idx_gmail_sync_email ON gmail_sync(email_address);

CREATE TRIGGER update_gmail_sync_updated_at
  BEFORE UPDATE ON gmail_sync
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
