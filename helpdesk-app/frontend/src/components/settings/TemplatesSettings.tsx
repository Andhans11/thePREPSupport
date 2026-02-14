import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, FileText, MailCheck } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { compileTemplate, TEMPLATE_VARIABLES_PREVIEW } from '../../utils/templateHandlebars';
import { SaveButton } from '../ui/SaveButton';

interface TemplateRow {
  id: string;
  name: string;
  subject: string | null;
  content: string;
  category: string | null;
  is_active: boolean;
}

export function TemplatesSettings() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const toast = useToast();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [ticketReceivedSubject, setTicketReceivedSubject] = useState('');
  const [ticketReceivedContent, setTicketReceivedContent] = useState('');
  const [ticketReceivedSaving, setTicketReceivedSaving] = useState(false);

  const fetchTemplates = async () => {
    if (!currentTenantId) return;
    setLoading(true);
    const { data, error: e } = await supabase
      .from('templates')
      .select('id, name, subject, content, category, is_active')
      .eq('tenant_id', currentTenantId)
      .order('name');
    if (e) {
      setError(e.message);
      setTemplates([]);
    } else {
      setError(null);
      setTemplates((data as TemplateRow[]) || []);
    }
    setLoading(false);
  };

  const fetchTicketReceivedSettings = async () => {
    if (!currentTenantId) return;
    const { data } = await supabase
      .from('company_settings')
      .select('key, value')
      .eq('tenant_id', currentTenantId)
      .in('key', ['ticket_received_subject', 'ticket_received_content']);
    const rows = (data ?? []) as { key: string; value: unknown }[];
    rows.forEach((r) => {
      const v = r.value != null ? (typeof r.value === 'string' ? r.value : String(r.value)) : '';
      if (r.key === 'ticket_received_subject') setTicketReceivedSubject(v);
      if (r.key === 'ticket_received_content') setTicketReceivedContent(v);
    });
  };

  useEffect(() => {
    fetchTemplates();
  }, [currentTenantId]);

  useEffect(() => {
    fetchTicketReceivedSettings();
  }, [currentTenantId]);

  const resetForm = () => {
    setFormName('');
    setFormSubject('');
    setFormContent('');
    setFormCategory('');
    setEditingId(null);
    setCreating(false);
  };

  const startEdit = (t: TemplateRow) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormSubject(t.subject ?? '');
    setFormContent(t.content);
    setFormCategory(t.category ?? '');
    setCreating(false);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) {
      setError('Navn er påkrevd.');
      return;
    }
    setError(null);
    setSaving(true);
    const payload = {
      name,
      subject: formSubject.trim() || null,
      content: formContent,
      category: formCategory.trim() || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    if (editingId) {
      if (!currentTenantId) return;
      const { error: e } = await supabase
        .from('templates')
        .update(payload)
        .eq('id', editingId)
        .eq('tenant_id', currentTenantId);
      if (e) {
        setError(e.message);
        toast.error(e.message);
      } else {
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? { ...t, ...payload } : t)));
        resetForm();
        toast.success('Mal er oppdatert');
      }
    } else {
      if (!currentTenantId) return;
      const { error: e } = await supabase.from('templates').insert({
        ...payload,
        tenant_id: currentTenantId,
        created_by: user?.id ?? null,
      });
      if (e) {
        setError(e.message);
        toast.error(e.message);
      } else {
        await fetchTemplates();
        resetForm();
        toast.success('Mal er opprettet');
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Slette denne malen?')) return;
    setError(null);
    if (!currentTenantId) return;
    const { error: e } = await supabase
      .from('templates')
      .delete()
      .eq('id', id)
      .eq('tenant_id', currentTenantId);
    if (e) setError(e.message);
    else setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSaveTicketReceived = async () => {
    if (!currentTenantId) return;
    setError(null);
    setTicketReceivedSaving(true);
    const { error: e1 } = await supabase
      .from('company_settings')
      .upsert(
        { tenant_id: currentTenantId, key: 'ticket_received_subject', value: ticketReceivedSubject },
        { onConflict: 'tenant_id,key' }
      );
    const { error: e2 } = await supabase
      .from('company_settings')
      .upsert(
        { tenant_id: currentTenantId, key: 'ticket_received_content', value: ticketReceivedContent },
        { onConflict: 'tenant_id,key' }
      );
    if (e1 || e2) {
      const msg = e1?.message || e2?.message || 'Kunne ikke lagre';
      setError(msg);
      toast.error(msg);
    } else {
      toast.success('Mottaksbekreftelse er lagret');
    }
    setTicketReceivedSaving(false);
  };

  const previewContent = formContent
    ? compileTemplate(formContent, TEMPLATE_VARIABLES_PREVIEW)
    : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--hiver-text-muted)]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const ticketReceivedPreview = ticketReceivedContent
    ? compileTemplate(ticketReceivedContent, TEMPLATE_VARIABLES_PREVIEW)
    : '';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="card-panel p-6 space-y-4">
        <h3 className="text-sm font-semibold text-[var(--hiver-text)] flex items-center gap-2">
          <MailCheck className="w-4 h-4 text-[var(--hiver-accent)]" />
          Mottaksbekreftelse (e-post ved ny sak)
        </h3>
        <p className="text-sm text-[var(--hiver-text-muted)]">
          Denne e-posten sendes automatisk til avsender når en ny sak opprettes fra innkommende e-post.
          La innholdet stå tomt for å slå av. Variabler:{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{ticket_number}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{customer.name}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{customer.email}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{ticket.subject}}'}</code>.
        </p>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-[var(--hiver-text)]">Emne (valgfritt)</label>
          <input
            type="text"
            value={ticketReceivedSubject}
            onChange={(e) => setTicketReceivedSubject(e.target.value)}
            placeholder="Vi har mottatt din henvendelse – {{ticket_number}}"
            className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-[var(--hiver-text)]">Innhold</label>
          <textarea
            value={ticketReceivedContent}
            onChange={(e) => setTicketReceivedContent(e.target.value)}
            placeholder={`Hei {{customer.name}},\n\nVi har mottatt din henvendelse. Din saksnummer er: {{ticket_number}}.\n\nVi kommer tilbake til deg så snart vi kan.\n\nMed vennlig hilsen,\nSupport`}
            rows={6}
            className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm font-mono text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-y"
          />
        </div>
        {ticketReceivedContent && (
          <div className="rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)] p-3">
            <p className="text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Forhåndsvisning</p>
            <div className="text-sm text-[var(--hiver-text)] whitespace-pre-wrap">{ticketReceivedPreview}</div>
          </div>
        )}
        <SaveButton
          onClick={handleSaveTicketReceived}
          loading={ticketReceivedSaving}
        >
          Lagre mottaksbekreftelse
        </SaveButton>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Svarmaler
        </h2>
        {!creating && !editingId && (
          <button
            type="button"
            onClick={() => { setCreating(true); resetForm(); setFormContent(''); setFormName(''); setFormSubject(''); setFormCategory(''); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
          >
            <Plus className="w-4 h-4" />
            Legg til mal
          </button>
        )}
      </div>

      <p className="text-sm text-[var(--hiver-text-muted)]">
        Bruk Handlebars for variabler: f.eks. <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{customer.name}}'}</code>,{' '}
        <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{ticket.subject}}'}</code>,{' '}
        <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{agent.name}}'}</code>.
      </p>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {(creating || editingId) && (
        <div className="card-panel p-6 space-y-4">
          <h3 className="text-sm font-medium text-[var(--hiver-text)]">
            {editingId ? 'Rediger mal' : 'Ny mal'}
          </h3>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-[var(--hiver-text)]">Navn</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Welcome reply"
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-[var(--hiver-text)]">Emne (valgfritt)</label>
            <input
              type="text"
              value={formSubject}
              onChange={(e) => setFormSubject(e.target.value)}
              placeholder="Re: {{ticket.subject}}"
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-[var(--hiver-text)]">Kategori (valgfritt)</label>
            <input
              type="text"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="e.g. onboarding"
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-[var(--hiver-text)]">Innhold (Handlebars støttes)</label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder={`Hi {{customer.name}},\n\nThanks for reaching out about {{ticket.subject}}.\n\nBest,\n{{agent.name}}`}
              rows={8}
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm font-mono text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-y"
            />
          </div>
          {formContent && (
            <div className="rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)] p-3">
              <p className="text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Forhåndsvisning med eksempeldata</p>
              <div className="text-sm text-[var(--hiver-text)] whitespace-pre-wrap">{previewContent}</div>
            </div>
          )}
          <div className="flex gap-2">
            <SaveButton onClick={handleSave} loading={saving}>
              {editingId ? 'Lagre endringer' : 'Opprett mal'}
            </SaveButton>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      <div className="card-panel overflow-hidden">
        {templates.length === 0 ? (
          <div className="p-8 text-center text-[var(--hiver-text-muted)] text-sm">
            Ingen maler ennå. Legg til en for å bruke Handlebars i raske svar.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--hiver-border)]">
            {templates.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--hiver-text)]">{t.name}</p>
                  {t.subject && (
                    <p className="text-sm text-[var(--hiver-text-muted)]">Emne: {t.subject}</p>
                  )}
                  <p className="text-sm text-[var(--hiver-text-muted)] mt-1 line-clamp-2">{t.content}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
                    aria-label="Rediger"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-red-50 hover:text-red-600"
                    aria-label="Slett"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
