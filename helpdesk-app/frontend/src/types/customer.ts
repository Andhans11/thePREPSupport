export interface Customer {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerInsert {
  email: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
}

export interface CustomerUpdate {
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
}
