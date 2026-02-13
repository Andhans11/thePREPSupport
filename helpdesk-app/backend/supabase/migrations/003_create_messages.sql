CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  content TEXT NOT NULL,
  html_content TEXT,
  is_customer BOOLEAN DEFAULT true,
  is_internal_note BOOLEAN DEFAULT false,
  gmail_message_id VARCHAR(255),
  attachments JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_ticket ON messages(ticket_id);
CREATE INDEX idx_messages_created ON messages(created_at);
