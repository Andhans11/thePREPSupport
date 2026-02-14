export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TeamMemberRole = 'admin' | 'manager' | 'agent' | 'viewer';

export interface Database {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          phone: string | null;
          company: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          phone?: string | null;
          company?: string | null;
          notes?: string | null;
        };
        Update: {
          email?: string;
          name?: string | null;
          phone?: string | null;
          company?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
      };
      tickets: {
        Row: {
          id: string;
          ticket_number: string | null;
          customer_id: string | null;
          subject: string;
          status: string;
          priority: TicketPriority;
          category: string | null;
          assigned_to: string | null;
          gmail_thread_id: string | null;
          gmail_message_id: string | null;
          tags: string[] | null;
          due_date: string | null;
          resolved_at: string | null;
          first_response_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          ticket_number?: string | null;
          customer_id?: string | null;
          subject: string;
          status?: string;
          priority?: TicketPriority;
          category?: string | null;
          assigned_to?: string | null;
          gmail_thread_id?: string | null;
          gmail_message_id?: string | null;
          tags?: string[] | null;
          due_date?: string | null;
        };
        Update: {
          subject?: string;
          status?: string;
          priority?: TicketPriority;
          category?: string | null;
          assigned_to?: string | null;
          tags?: string[] | null;
          due_date?: string | null;
          resolved_at?: string | null;
          first_response_at?: string | null;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          ticket_id: string;
          from_email: string;
          from_name: string | null;
          content: string;
          html_content: string | null;
          is_customer: boolean;
          is_internal_note: boolean;
          gmail_message_id: string | null;
          attachments: Json | null;
          created_at: string;
        };
        Insert: {
          ticket_id: string;
          from_email: string;
          from_name?: string | null;
          content: string;
          html_content?: string | null;
          is_customer?: boolean;
          is_internal_note?: boolean;
          gmail_message_id?: string | null;
          attachments?: Json | null;
        };
        Update: Record<string, unknown>;
      };
      team_members: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          email: string;
          role: TeamMemberRole;
          is_active: boolean;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      gmail_sync: {
        Row: {
          id: string;
          user_id: string | null;
          email_address: string;
          is_active: boolean;
          last_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
  };
}
