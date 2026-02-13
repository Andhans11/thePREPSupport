import { useState, useEffect, useRef } from 'react';
import { Send, Bold, Italic, Underline, Image as ImageIcon, Link as LinkIcon, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Paperclip, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { sendGmailForward, type EmailAttachment } from '../../services/api';
import { supabase } from '../../services/supabase';
import type { Customer } from '../../types/customer';

interface ForwardBoxProps {
  ticketSubject: string;
  onSent?: () => void;
}

export function ForwardBox({ ticketSubject, onSent }: ForwardBoxProps) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [toQuery, setToQuery] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [subject, setSubject] = useState(`Fw: ${ticketSubject}`);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<EmailAttachment | null>(null);

  useEffect(() => {
    if (!currentTenantId) return;
    supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', currentTenantId)
      .order('email')
      .then(({ data }) => setCustomers((data as Customer[]) || []));
  }, [currentTenantId]);

  const q = toQuery.trim().toLowerCase();
  const suggestions = q
    ? customers.filter(
        (c) =>
          (c.email || '').toLowerCase().includes(q) ||
          (c.name || '').toLowerCase().includes(q) ||
          (c.company || '').toLowerCase().includes(q)
      ).slice(0, 8)
    : [];

  const resolveToEmail = (): string => {
    if (selectedCustomer?.email) return selectedCustomer.email;
    const trimmed = toEmail.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed;
    return '';
  };

  const format = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value ?? undefined);
    editorRef.current?.focus();
  };

  const insertImage = () => {
    fileInputRef.current?.click();
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.execCommand('insertImage', false, reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const readFileAsAttachment = (file: File): Promise<EmailAttachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1] ?? '';
        resolve({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64: b64,
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAttachment(await readFileAsAttachment(file));
    } catch {
      setError('Kunne ikke laste vedlegg');
    }
    e.target.value = '';
  };

  const handleSend = async () => {
    const email = resolveToEmail();
    if (!email || !user?.email) {
      setError('Velg eller skriv inn en gyldig mottaker-e-post.');
      return;
    }
    const raw = editorRef.current?.innerHTML ?? content;
    const trimmed = (raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') || '').trim();
    if (!trimmed) {
      setError('Skriv inn meldingstekst.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const htmlBody = editorRef.current?.innerHTML ?? null;
      const result = await sendGmailForward(email, subject.trim(), trimmed, htmlBody, attachment ?? undefined);
      if (!result.success) {
        setError(result.error || 'Kunne ikke sende');
        setSending(false);
        return;
      }
      const finalEmail = email.trim();
      const existing = customers.find((c) => (c.email || '').toLowerCase() === finalEmail.toLowerCase());
      if (!existing && currentTenantId) {
        await supabase
          .from('customers')
          .insert({ email: finalEmail, tenant_id: currentTenantId } as unknown as Record<string, unknown>);
      }
      if (editorRef.current) editorRef.current.innerHTML = '';
      setContent('');
      setToEmail('');
      setToQuery('');
      setSelectedCustomer(null);
      setAttachment(null);
      setSubject(`Fw: ${ticketSubject}`);
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke sende');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4">
      <div className="space-y-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Til</label>
          <div className="relative">
            <input
              ref={toInputRef}
              type="text"
              value={selectedCustomer ? selectedCustomer.email : toQuery || toEmail}
              onChange={(e) => {
                setToQuery(e.target.value);
                setToEmail(e.target.value);
                setSelectedCustomer(null);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Søk kunde eller skriv e-postadresse"
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm focus:border-[var(--hiver-accent)] focus:ring-1 focus:ring-[var(--hiver-accent)] outline-none"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full mt-1 py-1 bg-white border border-[var(--hiver-border)] rounded-lg shadow-lg z-20 max-h-48 overflow-auto">
                {suggestions.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedCustomer(c);
                        setToEmail(c.email);
                        setToQuery('');
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--hiver-bg)] flex flex-col"
                    >
                      <span className="font-medium text-[var(--hiver-text)]">{c.email}</span>
                      {c.name && <span className="text-xs text-[var(--hiver-text-muted)]">{c.name}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Emne</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm focus:border-[var(--hiver-accent)] focus:ring-1 focus:ring-[var(--hiver-accent)] outline-none"
            placeholder="Emne"
          />
        </div>
      </div>

      <div className="rounded-lg border border-[var(--hiver-border)] overflow-hidden bg-red-50/80">
        <div className="flex items-center gap-1 p-1.5 border-b border-[var(--hiver-border)] bg-white/60 flex-wrap">
          <button type="button" onClick={() => format('bold')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Fet">
            <Bold className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => format('italic')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Kursiv">
            <Italic className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => format('underline')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Understreket">
            <Underline className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => format('insertUnorderedList')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Punktliste">
            <List className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => format('insertOrderedList')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Nummerert liste">
            <ListOrdered className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => format('justifyLeft')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Venstre">
            <AlignLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => format('justifyCenter')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Sentrert">
            <AlignCenter className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => format('justifyRight')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Høyre">
            <AlignRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => { const u = prompt('URL:'); if (u) format('createLink', u); }} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Lenke">
            <LinkIcon className="w-4 h-4" />
          </button>
          <button type="button" onClick={insertImage} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Sett inn bilde">
            <ImageIcon className="w-4 h-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
          <button type="button" onClick={() => attachmentInputRef.current?.click()} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Vedlegg">
            <Paperclip className="w-4 h-4" />
          </button>
          <input ref={attachmentInputRef} type="file" accept="*/*" className="hidden" onChange={handleAttachmentChange} />
        </div>
        <div
          ref={editorRef}
          contentEditable
          onInput={() => editorRef.current && setContent(editorRef.current.innerHTML)}
          className="min-h-[120px] max-h-[280px] overflow-y-auto px-3 py-2 text-sm text-[var(--hiver-text)] focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--hiver-text-muted)]"
          data-placeholder="Skriv meldingen..."
          suppressContentEditableWarning
        />
      </div>
      {attachment && (
        <div className="flex items-center gap-2 mt-2 text-sm text-[var(--hiver-text-muted)]">
          <Paperclip className="w-4 h-4" />
          <span>{attachment.filename}</span>
          <button type="button" onClick={() => setAttachment(null)} className="p-0.5 rounded hover:bg-[var(--hiver-bg)]" aria-label="Fjern vedlegg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50 disabled:pointer-events-none"
        >
          <Send className="w-4 h-4" />
          {sending ? 'Sender…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
