export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Ticket {
  id: string;
  ticket_number: string;
  customer_id: string | null;
  subject: string;
  status: string;
  priority: TicketPriority;
  category: string | null;
  assigned_to: string | null;
  team_id: string | null;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  tags: string[] | null;
  due_date: string | null;
  resolved_at: string | null;
  first_response_at: string | null;
  created_at: string;
  updated_at: string;
  customer?: { email: string; name: string | null } | null;
  team?: { id: string; name: string } | null;
}

export interface TicketInsert {
  ticket_number?: string;
  customer_id?: string | null;
  subject: string;
  status?: string;
  priority?: TicketPriority;
  category?: string | null;
  assigned_to?: string | null;
  team_id?: string | null;
  gmail_thread_id?: string | null;
  gmail_message_id?: string | null;
  tags?: string[] | null;
  due_date?: string | null;
}

export interface TicketUpdate {
  subject?: string;
  status?: string;
  priority?: TicketPriority;
  category?: string | null;
  assigned_to?: string | null;
  team_id?: string | null;
  tags?: string[] | null;
  due_date?: string | null;
  resolved_at?: string | null;
  first_response_at?: string | null;
}
