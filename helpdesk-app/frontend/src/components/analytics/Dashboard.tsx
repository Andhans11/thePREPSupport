import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { StatsCard } from './StatsCard';
import { Inbox, Clock, CheckCircle, XCircle } from 'lucide-react';

interface Counts {
  total: number;
  open: number;
  pending: number;
  resolved: number;
  closed: number;
}

export function Dashboard() {
  const [counts, setCounts] = useState<Counts>({
    total: 0,
    open: 0,
    pending: 0,
    resolved: 0,
    closed: 0,
  });

  useEffect(() => {
    async function load() {
      const { data: tickets } = await supabase
        .from('tickets')
        .select('status')
        .neq('status', 'archived');
      const list = (tickets ?? []) as { status: string }[];
      const total = list.length;
      const open = list.filter((t) => t.status === 'open').length;
      const pending = list.filter((t) => t.status === 'pending').length;
      const resolved = list.filter((t) => t.status === 'resolved').length;
      const closed = list.filter((t) => t.status === 'closed').length;
      setCounts({ total, open, pending, resolved, closed });
    }
    load();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Dashbord</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Totalt antall saker" value={counts.total} icon={<Inbox className="w-8 h-8" />} />
        <StatsCard title="Åpne" value={counts.open} icon={<Clock className="w-8 h-8" />} />
        <StatsCard title="Løst" value={counts.resolved} icon={<CheckCircle className="w-8 h-8" />} />
        <StatsCard title="Lukket" value={counts.closed} icon={<XCircle className="w-8 h-8" />} />
      </div>
    </div>
  );
}
