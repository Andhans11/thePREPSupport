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
  const [formContentHtml, setFormContentHtml] = useState('');
  const [formEditorMode, setFormEditorMode] = useState<'text' | 'html' | 'preview'>('text');
  const [formCategory, setFormCategory] = useState('');
  const [ticketReceivedSubject, setTicketReceivedSubject] = useState('');
  const [ticketReceivedContentText, setTicketReceivedContentText] = useState('');
  const [ticketReceivedContentHtml, setTicketReceivedContentHtml] = useState('');
  const [ticketReceivedEditorMode, setTicketReceivedEditorMode] = useState<'text' | 'html' | 'preview'>('text');
  const [newTicketNotificationSubject, setNewTicketNotificationSubject] = useState('');
  const [newTicketNotificationContentText, setNewTicketNotificationContentText] = useState('');
  const [newTicketNotificationContentHtml, setNewTicketNotificationContentHtml] = useState('');
  const [newTicketNotificationEditorMode, setNewTicketNotificationEditorMode] = useState<'text' | 'html' | 'preview'>('text');
  const [emailSenderOnNewTicket, setEmailSenderOnNewTicket] = useState(false);
  const [ticketReceivedSaving, setTicketReceivedSaving] = useState(false);
  const [newTicketNotificationSaving, setNewTicketNotificationSaving] = useState(false);

  const getStandardEmailHtml = (bodyInnerHtml: string) =>
    `<!DOCTYPE html>
<html lang="no">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f6f7fb;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#fafafa;">
        <img src="{{company.logo_url}}" alt="{{company.name}}" style="max-height:42px;width:auto;display:block;" />
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        ${bodyInnerHtml}
      </td>
    </tr>
  </table>
</body>
</html>`;

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
    const [settingsRes, ticketReceivedTemplateRes] = await Promise.all([
      supabase
        .from('company_settings')
        .select('key, value')
        .eq('tenant_id', currentTenantId)
        .in('key', ['ticket_received_subject', 'ticket_received_content', 'ticket_received_content_html', 'email_sender_on_new_ticket']),
      supabase
        .from('templates')
        .select('subject, content')
        .eq('tenant_id', currentTenantId)
        .eq('category', 'ticket_received')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const rows = (settingsRes.data ?? []) as { key: string; value: unknown }[];
    rows.forEach((r) => {
      if (r.key === 'email_sender_on_new_ticket') {
        setEmailSenderOnNewTicket(r.value === true || r.value === 'true');
      } else {
        const v = r.value != null ? (typeof r.value === 'string' ? r.value : String(r.value)) : '';
        if (r.key === 'ticket_received_subject') setTicketReceivedSubject(v);
        if (r.key === 'ticket_received_content') setTicketReceivedContentText(v);
        if (r.key === 'ticket_received_content_html') setTicketReceivedContentHtml(v);
      }
    });
    const ticketReceivedTemplate = (ticketReceivedTemplateRes.data as { subject?: string | null; content?: string | null } | null) ?? null;
    if (ticketReceivedTemplate?.subject != null) {
      setTicketReceivedSubject(ticketReceivedTemplate.subject);
    }
    if (ticketReceivedTemplate?.content != null) {
      setTicketReceivedContentText(ticketReceivedTemplate.content);
    }
    const { data: newTicketTemplate } = await supabase
      .from('templates')
      .select('subject, content')
      .eq('tenant_id', currentTenantId)
      .eq('category', 'new_ticket_notification')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = (newTicketTemplate as { subject?: string | null; content?: string | null } | null) ?? null;
    setNewTicketNotificationSubject(row?.subject ?? '');
    setNewTicketNotificationContentHtml(row?.content ?? '');
    setNewTicketNotificationContentText('');
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
    setFormContentHtml('');
    setFormEditorMode('text');
    setFormCategory('');
    setEditingId(null);
    setCreating(false);
  };

  const startEdit = (t: TemplateRow) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormSubject(t.subject ?? '');
    setFormContent(t.content);
    setFormContentHtml('');
    setFormEditorMode('text');
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
      content: (formEditorMode === 'html' ? formContentHtml : formContent).trim(),
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
    const [settingsSubjectRes, settingsContentRes, templateLookupRes] = await Promise.all([
      supabase
        .from('company_settings')
        .upsert(
          { tenant_id: currentTenantId, key: 'ticket_received_subject', value: ticketReceivedSubject },
          { onConflict: 'tenant_id,key' }
        ),
      supabase
        .from('company_settings')
        .upsert(
          { tenant_id: currentTenantId, key: 'ticket_received_content', value: ticketReceivedContentText },
          { onConflict: 'tenant_id,key' }
        ),
      supabase
        .from('company_settings')
        .upsert(
          { tenant_id: currentTenantId, key: 'ticket_received_content_html', value: ticketReceivedContentHtml },
          { onConflict: 'tenant_id,key' }
        ),
      supabase
        .from('templates')
        .select('id')
        .eq('tenant_id', currentTenantId)
        .eq('category', 'ticket_received')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    let templateError: string | null = null;
    const existingTemplateId = (templateLookupRes.data as { id?: string } | null)?.id;
    if (existingTemplateId) {
      const { error } = await supabase
        .from('templates')
        .update({
          name: 'Mottaksbekreftelse (auto)',
          subject: ticketReceivedSubject.trim() || null,
          content: ticketReceivedContentText.trim() || '',
          category: 'ticket_received',
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingTemplateId)
        .eq('tenant_id', currentTenantId);
      templateError = error?.message ?? null;
    } else {
      const { error } = await supabase
        .from('templates')
        .insert({
          tenant_id: currentTenantId,
          name: 'Mottaksbekreftelse (auto)',
          subject: ticketReceivedSubject.trim() || null,
          content: ticketReceivedContentText.trim() || '',
          category: 'ticket_received',
          is_active: true,
          created_by: user?.id ?? null,
        });
      templateError = error?.message ?? null;
    }

    if (settingsSubjectRes.error || settingsContentRes.error || templateError) {
      const msg =
        settingsSubjectRes.error?.message ||
        settingsContentRes.error?.message ||
        templateError ||
        'Kunne ikke lagre';
      setError(msg);
      toast.error(msg);
    } else {
      toast.success('Mottaksbekreftelse er lagret');
    }
    setTicketReceivedSaving(false);
  };

  const handleSaveNewTicketNotification = async () => {
    if (!currentTenantId) return;
    setError(null);
    setNewTicketNotificationSaving(true);
    const { data: existing } = await supabase
      .from('templates')
      .select('id')
      .eq('tenant_id', currentTenantId)
      .eq('category', 'new_ticket_notification')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const existingId = (existing as { id?: string } | null)?.id;
    const payload = {
      name: 'Varsel ved ny sak (team/brukere)',
      subject: newTicketNotificationSubject.trim() || null,
      content: (newTicketNotificationEditorMode === 'html' ? newTicketNotificationContentHtml : newTicketNotificationContentText).trim(),
      category: 'new_ticket_notification',
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    const { error: e } = existingId
      ? await supabase.from('templates').update(payload).eq('id', existingId).eq('tenant_id', currentTenantId)
      : await supabase.from('templates').insert({
          ...payload,
          tenant_id: currentTenantId,
          created_by: user?.id ?? null,
        });
    if (e) {
      setError(e.message || 'Kunne ikke lagre');
      toast.error(e.message || 'Kunne ikke lagre');
    } else {
      toast.success('Varselmal for ny sak er lagret');
    }
    setNewTicketNotificationSaving(false);
  };

  const previewContent = formContent
    ? compileTemplate(formContent, TEMPLATE_VARIABLES_PREVIEW)
    : '';
  const previewHtmlContent = formContentHtml
    ? compileTemplate(formContentHtml, TEMPLATE_VARIABLES_PREVIEW)
    : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--hiver-text-muted)]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const ticketReceivedTextPreview = ticketReceivedContentText
    ? compileTemplate(ticketReceivedContentText, TEMPLATE_VARIABLES_PREVIEW)
    : '';
  const ticketReceivedHtmlPreview = ticketReceivedContentHtml
    ? compileTemplate(ticketReceivedContentHtml, TEMPLATE_VARIABLES_PREVIEW)
    : '';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="card-panel p-6 space-y-4">
        <h3 className="text-sm font-semibold text-[var(--hiver-text)] flex items-center gap-2">
          <MailCheck className="w-4 h-4 text-[var(--hiver-accent)]" />
          Mottaksbekreftelse (e-post ved ny sak)
        </h3>
        <div className="flex items-center gap-3 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={emailSenderOnNewTicket}
            onClick={async () => {
              if (!currentTenantId) return;
              const next = !emailSenderOnNewTicket;
              setEmailSenderOnNewTicket(next);
              await supabase
                .from('company_settings')
                .upsert(
                  { tenant_id: currentTenantId, key: 'email_sender_on_new_ticket', value: next },
                  { onConflict: 'tenant_id,key' }
                );
              toast.success(next ? 'Mottaksbekreftelse er aktivert' : 'Mottaksbekreftelse er deaktivert');
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/40 focus:ring-offset-2 ${emailSenderOnNewTicket ? 'bg-[var(--hiver-accent)]' : 'bg-[var(--hiver-border)]'}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${emailSenderOnNewTicket ? 'translate-x-5' : 'translate-x-0.5'}`}
              style={{ marginTop: 2 }}
            />
          </button>
          <span className="text-sm text-[var(--hiver-text)]">
            Send e-post til avsender når ny henvendelse kommer inn på e-post (f.eks. aktiver i prod)
          </span>
        </div>
        <p className="text-sm text-[var(--hiver-text-muted)]">
          Når aktivert sendes e-posten under til avsender når en ny sak opprettes fra innkommende e-post.
          Variabler:{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{ticket_number}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{customer.name}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{customer.email}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{ticket.subject}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{company.name}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{company.logo_url}}'}</code>.
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
          <div className="inline-flex w-fit rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)] p-1">
            <button
              type="button"
              onClick={() => setTicketReceivedEditorMode('text')}
              className={`px-3 py-1.5 text-xs rounded-md ${ticketReceivedEditorMode === 'text' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)]'}`}
            >
              Tekst
            </button>
            <button
              type="button"
              onClick={() => setTicketReceivedEditorMode('html')}
              className={`px-3 py-1.5 text-xs rounded-md ${ticketReceivedEditorMode === 'html' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)]'}`}
            >
              HTML
            </button>
            <button
              type="button"
              onClick={() => setTicketReceivedEditorMode('preview')}
              className={`px-3 py-1.5 text-xs rounded-md ${ticketReceivedEditorMode === 'preview' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)]'}`}
            >
              Preview
            </button>
          </div>
          {ticketReceivedEditorMode === 'text' && (
            <textarea
              value={ticketReceivedContentText}
              onChange={(e) => setTicketReceivedContentText(e.target.value)}
              placeholder={`Hei {{customer.name}},\n\nVi har mottatt din henvendelse. Din saksnummer er: {{ticket_number}}.\n\nVi kommer tilbake til deg så snart vi kan.\n\nMed vennlig hilsen,\nSupport`}
              rows={8}
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm font-mono text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-y"
            />
          )}
          {ticketReceivedEditorMode === 'html' && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setTicketReceivedContentHtml(
                      getStandardEmailHtml('<p>Hei {{customer.name}},</p><p>Vi har mottatt henvendelsen din. Saksnummeret ditt er <strong>{{ticket_number}}</strong>.</p><p>Vi kommer tilbake til deg sa snart vi kan.</p><p>Med vennlig hilsen,<br>{{company.name}}</p>')
                    )
                  }
                  className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--hiver-border)] text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                >
                  Sett inn standard HTML-mal
                </button>
              </div>
              <textarea
                value={ticketReceivedContentHtml}
                onChange={(e) => setTicketReceivedContentHtml(e.target.value)}
                placeholder={'<p>Hei {{customer.name}},</p><p>Vi har mottatt henvendelsen din. Saksnummeret ditt er <strong>{{ticket_number}}</strong>.</p><p>Vi kommer tilbake til deg sa snart vi kan.</p><p>Med vennlig hilsen,<br>{{company.name}}</p>'}
                rows={8}
                className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm font-mono text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-y"
              />
            </div>
          )}
          {ticketReceivedEditorMode === 'preview' && (
            <div className="rounded-lg border border-[var(--hiver-border)] bg-white p-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Tekst-forhåndsvisning</p>
                <div className="text-sm text-[var(--hiver-text)] whitespace-pre-wrap">{ticketReceivedTextPreview || 'Ingen tekstinnhold enda.'}</div>
              </div>
              <div className="border-t border-[var(--hiver-border)] pt-3">
                <p className="text-xs font-medium text-[var(--hiver-text-muted)] mb-1">HTML-forhåndsvisning</p>
                {ticketReceivedHtmlPreview ? (
                  <div className="text-sm text-[var(--hiver-text)]" dangerouslySetInnerHTML={{ __html: ticketReceivedHtmlPreview }} />
                ) : (
                  <div className="text-sm text-[var(--hiver-text-muted)]">Ingen HTML-innhold enda.</div>
                )}
              </div>
            </div>
          )}
        </div>
        <SaveButton
          onClick={handleSaveTicketReceived}
          loading={ticketReceivedSaving}
        >
          Lagre mottaksbekreftelse
        </SaveButton>
      </div>

      <div className="card-panel p-6 space-y-4">
        <h3 className="text-sm font-semibold text-[var(--hiver-text)] flex items-center gap-2">
          <MailCheck className="w-4 h-4 text-[var(--hiver-accent)]" />
          Varsel ved ny sak (til team/brukere)
        </h3>
        <p className="text-sm text-[var(--hiver-text-muted)]">
          Denne malen brukes for e-posten som sendes når ny sak opprettes. HTML er tillatt.
          Variabler:{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{ticket_number}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{ticket.subject}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{team.name}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{ticket_link}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{company.name}}'}</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--hiver-bg)] text-xs">{'{{company.logo_url}}'}</code>.
        </p>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-[var(--hiver-text)]">Emne</label>
          <input
            type="text"
            value={newTicketNotificationSubject}
            onChange={(e) => setNewTicketNotificationSubject(e.target.value)}
            placeholder="Ny sak: {{ticket_number}} - {{ticket.subject}}"
            className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-[var(--hiver-text)]">Innhold</label>
          <div className="inline-flex w-fit rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)] p-1">
            <button type="button" onClick={() => setNewTicketNotificationEditorMode('text')} className={`px-3 py-1.5 text-xs rounded-md ${newTicketNotificationEditorMode === 'text' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)]'}`}>Tekst</button>
            <button type="button" onClick={() => setNewTicketNotificationEditorMode('html')} className={`px-3 py-1.5 text-xs rounded-md ${newTicketNotificationEditorMode === 'html' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)]'}`}>HTML</button>
            <button type="button" onClick={() => setNewTicketNotificationEditorMode('preview')} className={`px-3 py-1.5 text-xs rounded-md ${newTicketNotificationEditorMode === 'preview' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)]'}`}>Preview</button>
          </div>
          {newTicketNotificationEditorMode === 'text' && (
            <textarea
              value={newTicketNotificationContentText}
              onChange={(e) => setNewTicketNotificationContentText(e.target.value)}
              placeholder={'Ny sak opprettet\nSaksnummer: {{ticket_number}}\nEmne: {{ticket.subject}}\nTeam: {{team.name}}\n{{ticket_link}}'}
              rows={8}
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm font-mono text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-y"
            />
          )}
          {newTicketNotificationEditorMode === 'html' && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setNewTicketNotificationContentHtml(
                      getStandardEmailHtml('<h2>Ny sak opprettet</h2><p><strong>Saksnummer:</strong> {{ticket_number}}</p><p><strong>Emne:</strong> {{ticket.subject}}</p><p><strong>Team:</strong> {{team.name}}</p><p><a href="{{ticket_link}}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;">Åpne saken</a></p>')
                    )
                  }
                  className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--hiver-border)] text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                >
                  Sett inn standard HTML-mal
                </button>
              </div>
              <textarea
                value={newTicketNotificationContentHtml}
                onChange={(e) => setNewTicketNotificationContentHtml(e.target.value)}
                placeholder={'<h2>Ny sak opprettet</h2>\n<p>Saksnummer: {{ticket_number}}</p>\n<p>Emne: {{ticket.subject}}</p>\n<p>Team: {{team.name}}</p>\n<p><a href="{{ticket_link}}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;">Åpne saken</a></p>'}
                rows={8}
                className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm font-mono text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-y"
              />
            </div>
          )}
          {newTicketNotificationEditorMode === 'preview' && (
            <div className="rounded-lg border border-[var(--hiver-border)] bg-white p-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Tekst-forhandsvisning</p>
                <div className="text-sm text-[var(--hiver-text)] whitespace-pre-wrap">
                  {newTicketNotificationContentText ? compileTemplate(newTicketNotificationContentText, TEMPLATE_VARIABLES_PREVIEW) : 'Ingen tekstinnhold enda.'}
                </div>
              </div>
              <div className="border-t border-[var(--hiver-border)] pt-3">
                <p className="text-xs font-medium text-[var(--hiver-text-muted)] mb-1">HTML-forhandsvisning</p>
                {newTicketNotificationContentHtml ? (
                  <div className="text-sm text-[var(--hiver-text)]" dangerouslySetInnerHTML={{ __html: compileTemplate(newTicketNotificationContentHtml, TEMPLATE_VARIABLES_PREVIEW) }} />
                ) : (
                  <div className="text-sm text-[var(--hiver-text-muted)]">Ingen HTML-innhold enda.</div>
                )}
              </div>
            </div>
          )}
        </div>
        <SaveButton
          onClick={handleSaveNewTicketNotification}
          loading={newTicketNotificationSaving}
        >
          Lagre varselmal
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
            <div className="inline-flex w-fit rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)] p-1">
              <button type="button" onClick={() => setFormEditorMode('text')} className={`px-3 py-1.5 text-xs rounded-md ${formEditorMode === 'text' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)]'}`}>Tekst</button>
              <button type="button" onClick={() => setFormEditorMode('html')} className={`px-3 py-1.5 text-xs rounded-md ${formEditorMode === 'html' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)]'}`}>HTML</button>
              <button type="button" onClick={() => setFormEditorMode('preview')} className={`px-3 py-1.5 text-xs rounded-md ${formEditorMode === 'preview' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)]'}`}>Preview</button>
            </div>
            {formEditorMode === 'text' && (
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder={`Hi {{customer.name}},\n\nThanks for reaching out about {{ticket.subject}}.\n\nBest,\n{{agent.name}}`}
                rows={8}
                className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm font-mono text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-y"
              />
            )}
            {formEditorMode === 'html' && (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setFormContentHtml(getStandardEmailHtml('<p>Hei {{customer.name}},</p><p>Takk for henvendelsen om <strong>{{ticket.subject}}</strong>.</p><p>Med vennlig hilsen,<br>{{agent.name}}</p>'))}
                    className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--hiver-border)] text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                  >
                    Sett inn standard HTML-mal
                  </button>
                </div>
                <textarea
                  value={formContentHtml}
                  onChange={(e) => setFormContentHtml(e.target.value)}
                  placeholder={'<p>Hei {{customer.name}},</p><p>Takk for henvendelsen om <strong>{{ticket.subject}}</strong>.</p><p>Med vennlig hilsen,<br>{{agent.name}}</p>'}
                  rows={8}
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm font-mono text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-y"
                />
              </div>
            )}
            {formEditorMode === 'preview' && (
              <div className="rounded-lg border border-[var(--hiver-border)] bg-white p-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Tekst-forhandsvisning</p>
                  <div className="text-sm text-[var(--hiver-text)] whitespace-pre-wrap">{previewContent || 'Ingen tekstinnhold enda.'}</div>
                </div>
                <div className="border-t border-[var(--hiver-border)] pt-3">
                  <p className="text-xs font-medium text-[var(--hiver-text-muted)] mb-1">HTML-forhandsvisning</p>
                  {previewHtmlContent ? (
                    <div className="text-sm text-[var(--hiver-text)]" dangerouslySetInnerHTML={{ __html: previewHtmlContent }} />
                  ) : (
                    <div className="text-sm text-[var(--hiver-text-muted)]">Ingen HTML-innhold enda.</div>
                  )}
                </div>
              </div>
            )}
          </div>
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
