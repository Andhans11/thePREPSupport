import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export function TeamMembers() {
  const { currentTenantId } = useTenant();
  const [members, setMembers] = useState<TeamMemberRow[]>([]);

  useEffect(() => {
    if (!currentTenantId) return;
    supabase.from('team_members').select('id, name, email, role, is_active').eq('tenant_id', currentTenantId).then(({ data }) => {
      setMembers((data as TeamMemberRow[]) || []);
    });
  }, [currentTenantId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Team members</h2>
      {members.length === 0 ? (
        <p className="text-slate-500 text-sm">No team members yet. Add yourself in the database or via auth.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{m.name}</p>
                <p className="text-sm text-slate-500">{m.email}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">{m.role}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
