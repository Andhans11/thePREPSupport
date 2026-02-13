export interface MessageAttachment {
  storage_path: string;
  filename: string;
  mime_type: string;
  size?: number;
}

export interface Message {
  id: string;
  ticket_id: string;
  from_email: string;
  from_name: string | null;
  content: string;
  html_content: string | null;
  is_customer: boolean;
  is_internal_note: boolean;
  gmail_message_id: string | null;
  /** Stored in Supabase Storage; each item: { storage_path, filename, mime_type, size? } */
  attachments: MessageAttachment[] | null;
  created_at: string;
}

export interface MessageInsert {
  ticket_id: string;
  from_email: string;
  from_name?: string | null;
  content: string;
  html_content?: string | null;
  is_customer?: boolean;
  is_internal_note?: boolean;
  gmail_message_id?: string | null;
  attachments?: MessageAttachment[] | null;
}
