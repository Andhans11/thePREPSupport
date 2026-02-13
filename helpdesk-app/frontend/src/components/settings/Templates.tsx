import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface TemplateRow {
  id: string;
  name: string;
  subject: string | null;
  content: string;
  category: string | null;
}

export function Templates() {
  const { currentTenantId } = useTenant();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  useEffect(() => {
    if (!currentTenantId) return;
    supabase.from('templates').select('id, name, subject, content, category').eq('tenant_id', currentTenantId).eq('is_active', true).then(({ data }) => {
      setTemplates((data as TemplateRow[]) || []);
    });
  }, [currentTenantId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Response templates</h2>
      {templates.length === 0 ? (
        <p className="text-slate-500 text-sm">No templates yet. Add templates in the database for canned responses.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {templates.map((t) => (
            <li key={t.id} className="py-3">
              <p className="font-medium text-slate-800">{t.name}</p>
              {t.subject && <p className="text-sm text-slate-500">{t.subject}</p>}
              <p className="text-sm text-slate-600 mt-1 line-clamp-2">{t.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
