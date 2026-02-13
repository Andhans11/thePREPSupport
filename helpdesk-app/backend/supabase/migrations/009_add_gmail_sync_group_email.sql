-- Group / shared inbox email to mirror (e.g. support@company.com from Google Workspace)
ALTER TABLE gmail_sync
  ADD COLUMN IF NOT EXISTS group_email VARCHAR(255) NULL;

COMMENT ON COLUMN gmail_sync.group_email IS 'When set, sync pulls messages sent TO this address (e.g. Google Workspace group/shared inbox).';
