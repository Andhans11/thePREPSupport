import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useTenant } from '../contexts/TenantContext';
import type { Customer } from '../types/customer';
import { Link } from 'react-router-dom';
import { formatListTime } from '../utils/formatters';
import { Search, ArrowRight } from 'lucide-react';

function getInitial(c: Customer): string {
  const s = (c.name || c.email || '?').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return s.slice(0, 2).toUpperCase();
}

export function CustomersPage() {
  const { currentTenantId } = useTenant();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!currentTenantId) {
      setCustomers([]);
      setLoading(false);
      return;
    }
    supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setCustomers((data as Customer[]) || []);
        setLoading(false);
      });
  }, [currentTenantId]);

  const filtered = search.trim()
    ? customers.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(search.trim().toLowerCase()) ||
          (c.email || '').toLowerCase().includes(search.trim().toLowerCase()) ||
          (c.company || '').toLowerCase().includes(search.trim().toLowerCase())
      )
    : customers;

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col min-h-0">
      <div className="shrink-0 mb-6">
        <h1 className="text-2xl font-semibold text-[var(--hiver-text)]">Kunder</h1>
        <p className="text-sm text-[var(--hiver-text-muted)] mt-0.5">
          Oversikt over alle kunder i helpdesken
        </p>
      </div>

      <div className="card-panel overflow-hidden flex flex-col flex-1 min-h-0 flex-1">
        <div className="shrink-0 border-b border-[var(--hiver-border)]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--hiver-text)]">Alle kunder</h2>
          </div>
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--hiver-text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Søk på navn, e-post eller firma"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)] text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-[var(--hiver-text-muted)] text-sm">Laster…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-[var(--hiver-text-muted)] text-sm">
              {customers.length === 0 ? 'Ingen kunder ennå.' : 'Ingen treff for søket.'}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--hiver-border)]">
              {filtered.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/customers/${c.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--hiver-bg)] transition-colors"
                  >
                    <div className="shrink-0 w-9 h-9 rounded-full bg-[var(--hiver-accent)]/15 text-[var(--hiver-accent)] text-sm font-medium flex items-center justify-center">
                      {getInitial(c)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--hiver-text)] truncate">
                        {c.name || c.email || 'Ukjent'}
                      </p>
                      <p className="text-xs text-[var(--hiver-text-muted)] truncate">
                        {c.email}
                        {c.company ? ` · ${c.company}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--hiver-text-muted)] shrink-0">
                      Lagt til {formatListTime(c.created_at)}
                    </span>
                    <ArrowRight className="w-4 h-4 text-[var(--hiver-text-muted)] shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
