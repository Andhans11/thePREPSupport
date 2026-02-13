import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useTenant } from '../contexts/TenantContext';
import type { Customer } from '../types/customer';
import type { Ticket } from '../types/ticket';
import { CustomerInfo } from '../components/customers/CustomerInfo';
import { CustomerHistory } from '../components/customers/CustomerHistory';
import { ArrowLeft } from 'lucide-react';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentTenantId } = useTenant();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !currentTenantId) return;
    Promise.all([
      supabase.from('customers').select('*').eq('id', id).eq('tenant_id', currentTenantId).single(),
      supabase.from('tickets').select('*').eq('customer_id', id).eq('tenant_id', currentTenantId).order('created_at', { ascending: false }),
    ]).then(([cust, tix]) => {
      setCustomer(cust.data as Customer | null);
      setTickets((tix.data as Ticket[]) || []);
      setLoading(false);
    });
  }, [id, currentTenantId]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <p className="text-[var(--hiver-text-muted)] text-sm">Laster…</p>
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-[var(--hiver-text-muted)] text-sm">Kunden ble ikke funnet.</p>
        <Link
          to="/customers"
          className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-[var(--hiver-accent)] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Tilbake til kunder
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col min-h-0">
      <Link
        to="/customers"
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--hiver-accent)] hover:underline mb-6 shrink-0"
      >
        <ArrowLeft className="w-4 h-4" />
        Tilbake til kunder
      </Link>

      <div className="shrink-0 mb-6">
        <CustomerInfo customer={customer} />
      </div>

      <div className="card-panel overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--hiver-border)]">
          <h2 className="text-base font-semibold text-[var(--hiver-text)]">Saker</h2>
          {tickets.length > 0 && (
            <span className="text-sm text-[var(--hiver-text-muted)]">
              {tickets.length} {tickets.length === 1 ? 'sak' : 'saker'}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <CustomerHistory tickets={tickets} />
        </div>
      </div>
    </div>
  );
}
