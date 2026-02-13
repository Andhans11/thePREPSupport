import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useMasterData } from '../contexts/MasterDataContext';
import { BarChart3, TrendingUp, Inbox, Clock } from 'lucide-react';

const STATUS_BAR_COLOR: Record<string, string> = {
  new: 'bg-[var(--status-new)]',
  pending: 'bg-[var(--status-pending)]',
  resolved: 'bg-[var(--status-resolved)]',
  closed: 'bg-[var(--status-closed)]',
  neutral: 'bg-[var(--hiver-text-muted)]',
};

export function AnalyticsPage() {
  const { currentTenantId } = useTenant();
  const { statuses } = useMasterData();
  const [countByStatus, setCountByStatus] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenantId) {
      setCountByStatus({});
      setTotal(0);
      setLoading(false);
      return;
    }
    async function load() {
      const { data } = await supabase.from('tickets').select('status').eq('tenant_id', currentTenantId);
      const list = (data ?? []) as { status: string }[];
      setTotal(list.length);
      const byStatus: Record<string, number> = {};
      statuses.forEach((s) => {
        byStatus[s.code] = list.filter((t) => t.status === s.code).length;
      });
      setCountByStatus(byStatus);
      setLoading(false);
    }
    load();
  }, [statuses, currentTenantId]);

  const items = statuses.map((s) => ({
    label: s.label,
    value: countByStatus[s.code] ?? 0,
    color: STATUS_BAR_COLOR[s.color] ?? STATUS_BAR_COLOR.neutral,
  }));
  const max = Math.max(...items.map((i) => i.value), 1);
  const resolvedCount = countByStatus['resolved'] ?? 0;
  const closedCount = countByStatus['closed'] ?? 0;
  const resolutionRate = total ? Math.round((resolvedCount + closedCount) / total * 100) : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="w-6 h-6 text-[var(--hiver-accent)]" />
        <h1 className="text-2xl font-semibold text-[var(--hiver-text)]">Analyse</h1>
      </div>
      <p className="text-sm text-[var(--hiver-text-muted)] mb-8">
        Fordeling og oversikt over sakstatus.
      </p>

      {loading ? (
        <div className="text-[var(--hiver-text-muted)] text-sm">Laster…</div>
      ) : (
        <div className="space-y-8">
          <div className="card-panel p-6">
            <h2 className="text-sm font-semibold text-[var(--hiver-text-muted)] uppercase tracking-wider mb-4">
              Saker etter status
            </h2>
            <div className="flex items-end gap-4 h-48">
              {items.map(({ label, value, color }) => (
                <div key={label} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <div className="w-full flex-1 flex flex-col justify-end min-h-[2rem]">
                    <div
                      className={`w-full rounded-t ${color} transition-all`}
                      style={{ height: `${(value / max) * 100}%`, minHeight: value ? 8 : 0 }}
                    />
                  </div>
                  <span className="text-xs font-medium text-[var(--hiver-text-muted)]">{label}</span>
                  <span className="text-sm font-semibold text-[var(--hiver-text)]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card-panel p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--hiver-accent-light)] flex items-center justify-center">
                <Inbox className="w-6 h-6 text-[var(--hiver-accent)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--hiver-text-muted)]">Totalt antall saker</p>
                <p className="text-2xl font-semibold text-[var(--hiver-text)]">{total}</p>
              </div>
            </div>
            <div className="card-panel p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--hiver-accent-light)] flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-[var(--hiver-accent)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--hiver-text-muted)]">Løsningsrate</p>
                <p className="text-2xl font-semibold text-[var(--hiver-text)]">
                  {resolutionRate}%
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to="/tickets"
              className="text-sm font-medium text-[var(--hiver-accent)] hover:underline inline-flex items-center gap-1"
            >
              <Clock className="w-4 h-4" />
              Se saker
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
