import type { Customer } from '../../types/customer';
import { formatDateTime } from '../../utils/formatters';
import { Mail, Building2, Phone, FileText } from 'lucide-react';

function getInitial(customer: Customer): string {
  const s = (customer.name || customer.email || '?').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return s.slice(0, 2).toUpperCase();
}

interface CustomerInfoProps {
  customer: Customer;
}

export function CustomerInfo({ customer }: CustomerInfoProps) {
  return (
    <div className="card-panel overflow-hidden">
      <div className="flex items-start gap-4 p-5">
        <div className="shrink-0 w-12 h-12 rounded-full bg-[var(--hiver-accent)]/15 text-[var(--hiver-accent)] text-lg font-semibold flex items-center justify-center">
          {getInitial(customer)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-[var(--hiver-text)]">
            {customer.name || 'Ingen navn'}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-[var(--hiver-text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              {customer.email}
            </span>
            {customer.company && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                {customer.company}
              </span>
            )}
            {customer.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {customer.phone}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--hiver-text-muted)] mt-2">
            Lagt til {formatDateTime(customer.created_at)}
          </p>
        </div>
      </div>
      {customer.notes && (
        <div className="px-5 pb-5 pt-0">
          <div className="flex gap-2 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)]/50 p-3">
            <FileText className="w-4 h-4 text-[var(--hiver-text-muted)] shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--hiver-text)]">{customer.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}
