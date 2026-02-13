import { useState, useEffect, useRef } from 'react';
import { Send, StickyNote, FileText, Bold, Italic, Underline, Image as ImageIcon, Link as LinkIcon, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Paperclip, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useGmail } from '../../contexts/GmailContext';
import { useTenant } from '../../contexts/TenantContext';
import { useTickets } from '../../contexts/TicketContext';
import { sendGmailReply, type EmailAttachment } from '../../services/api';
import { supabase } from '../../services/supabase';
import { compileTemplate } from '../../utils/templateHandlebars';

interface ReplyBoxProps {
  ticketId: string;
  customerEmail: string;
  gmailThreadId: string | null;
  ticketSubject?: string;
  ticketNumber?: string;
  customerName?: string | null;
  customerCompany?: string | null;
  replyAll?: boolean;
  onSent?: () => void;
}

interface TemplateRow {
  id: string;
  name: string;
  subject: string | null;
  content: string;
}

export function ReplyBox({
  ticketId,
  customerEmail,
  gmailThreadId,
  ticketSubject = '',
  ticketNumber = '',
  customerName = null,
  customerCompany = null,
  replyAll = false,
  onSent,
}: ReplyBoxProps) {
  const { user } = useAuth();
  const { groupEmail, gmailEmail } = useGmail() ?? {};
  const { currentTenantId } = useTenant();
  const { addMessage, fetchMessages, messages } = useTickets();
  const fromEmail = (groupEmail?.trim() || gmailEmail?.trim() || user?.email || '').trim() || (user?.email ?? '–');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [signatureNew, setSignatureNew] = useState('');
  const [signatureFollowUp, setSignatureFollowUp] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const [attachment, setAttachment] = useState<EmailAttachment | null>(null);

  const saveSelection = () => {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current?.contains(sel.anchorNode)) return;
    savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    if (!savedSelectionRef.current || !editorRef.current) return;
    const sel = document.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedSelectionRef.current);
    editorRef.current.focus();
    savedSelectionRef.current = null;
  };

  const canSendViaGmail = !!gmailThreadId && !isInternalNote;
  const hasExistingReplies = messages.some((m) => !m.is_customer && !m.is_internal_note);

  useEffect(() => {
    if (!currentTenantId) return;
    supabase
      .from('templates')
      .select('id, name, subject, content')
      .eq('tenant_id', currentTenantId)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setTemplates((data as TemplateRow[]) || []));
  }, [currentTenantId]);

  useEffect(() => {
    if (!currentTenantId) return;
    supabase
      .from('company_settings')
      .select('key, value')
      .eq('tenant_id', currentTenantId)
      .in('key', ['signature_new', 'signature_follow_up'])
      .then(({ data }) => {
        const rows = (data ?? []) as { key: string; value: unknown }[];
        rows.forEach((r) => {
          const v = r.value != null ? (typeof r.value === 'string' ? r.value : String(r.value)) : '';
          if (r.key === 'signature_new') setSignatureNew(v);
          if (r.key === 'signature_follow_up') setSignatureFollowUp(v);
        });
      });
  }, [currentTenantId]);

  const templateContext = {
    customer: { name: customerName ?? customerEmail, email: customerEmail, company: customerCompany ?? '' },
    ticket: { subject: ticketSubject, ticket_number: ticketNumber },
    agent: { name: user?.user_metadata?.full_name ?? 'Support', email: user?.email ?? '' },
  };

  const insertTemplate = (t: TemplateRow) => {
    const compiled = compileTemplate(t.content, templateContext);
    if (editorRef.current) {
      const html = compiled.replace(/\n/g, '<br>');
      editorRef.current.innerHTML += (editorRef.current.innerHTML ? '<br><br>' : '') + html;
      setContent(editorRef.current.innerHTML);
    }
    setTemplateOpen(false);
  };

  const format = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    if (cmd === 'insertUnorderedList' || cmd === 'insertOrderedList') {
      document.execCommand(cmd, false, undefined);
      // Ensure list structure is visible: some browsers need a moment to render ul/ol
      requestAnimationFrame(() => editorRef.current?.focus());
    } else {
      document.execCommand(cmd, false, value ?? undefined);
    }
  };

  const insertImage = () => {
    saveSelection();
    fileInputRef.current?.click();
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const hadSelection = !!savedSelectionRef.current;
      restoreSelection();
      if (!hadSelection) editorRef.current?.focus();
      document.execCommand('insertImage', false, dataUrl);
      editorRef.current?.focus();
      handleInput();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = e.clipboardData.files[0];
    if (item?.type.startsWith('image/')) {
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => document.execCommand('insertImage', false, reader.result as string);
      reader.readAsDataURL(item);
    }
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

  const handleInput = () => {
    if (editorRef.current) setContent(editorRef.current.innerHTML);
  };

  const handleSend = async () => {
    const raw = editorRef.current?.innerHTML ?? content;
    const trimmed = (raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') || '').trim();
    if (!trimmed || !user?.email) return;
    setError(null);
    setSending(true);

    const signature = isInternalNote ? '' : (hasExistingReplies ? signatureFollowUp : signatureNew);
    const contentToSend = signature ? `${trimmed}\n\n${signature}` : trimmed;
    const editorHtml = editorRef.current?.innerHTML ?? null;
    const signatureHtml = signature ? `<div style="margin-top:1em">${signature.replace(/\n/g, '<br>')}</div>` : '';
    const htmlToSend = isInternalNote ? null : (editorHtml ? editorHtml + signatureHtml : null);

    try {
      if (canSendViaGmail) {
        const result = await sendGmailReply(ticketId, contentToSend, customerEmail, false, htmlToSend ?? undefined, attachment ?? undefined, replyAll);
        if (!result.success) {
          setError(result.error || 'Kunne ikke sende');
          setSending(false);
          return;
        }
      }
      const messageId = await addMessage({
        ticket_id: ticketId,
        from_email: (groupEmail?.trim() || gmailEmail?.trim() || user?.email || '').trim() || user?.email || '',
        from_name: user?.user_metadata?.full_name ?? null,
        content: contentToSend,
        html_content: htmlToSend,
        is_customer: false,
        is_internal_note: isInternalNote,
      });
      if (attachment && messageId && currentTenantId) {
        const bin = Uint8Array.from(atob(attachment.contentBase64), (c) => c.charCodeAt(0));
        const path = `${currentTenantId}/${ticketId}/${messageId}/${attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('ticket-attachments').upload(path, bin, {
          contentType: attachment.mimeType || 'application/octet-stream',
          upsert: true,
        });
        if (!upErr) {
          const att = [{ storage_path: path, filename: attachment.filename, mime_type: attachment.mimeType || 'application/octet-stream', size: bin.length }];
          await supabase.from('messages').update({ attachments: att }).eq('id', messageId);
        }
      }
      if (editorRef.current) editorRef.current.innerHTML = '';
      setContent('');
      setAttachment(null);
      await fetchMessages(ticketId);
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke sende');
    } finally {
      setSending(false);
    }
  };

  const hasContent = () => {
    const raw = editorRef.current?.innerHTML ?? content;
    const text = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    return text.length > 0;
  };

  return (
    <div className="p-4">
      {/* Tabs: Svar til kunde | Intern notat */}
      <div className="flex border-b border-[var(--hiver-border)] mb-3">
        <button
          type="button"
          onClick={() => setIsInternalNote(false)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            !isInternalNote
              ? 'text-[var(--hiver-accent)] border-[var(--hiver-accent)]'
              : 'text-[var(--hiver-text-muted)] border-transparent hover:text-[var(--hiver-text)]'
          }`}
        >
          Svar til kunde
        </button>
        <button
          type="button"
          onClick={() => setIsInternalNote(true)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            isInternalNote
              ? 'text-[var(--hiver-accent)] border-[var(--hiver-accent)]'
              : 'text-[var(--hiver-text-muted)] border-transparent hover:text-[var(--hiver-text)]'
          }`}
        >
          <StickyNote className="w-4 h-4 inline-block mr-1.5 align-middle" />
          Intern notat
        </button>
      </div>

      {/* Input area with distinct bg: light red = customer, light yellow = internal */}
      <div
        className={`rounded-lg border border-[var(--hiver-border)] overflow-hidden ${
          isInternalNote ? 'bg-amber-50/80' : 'bg-red-50/80'
        }`}
      >
        {/* To / Copy (CC) / From - below title, above editor - only for customer reply */}
        {!isInternalNote && (
          <div className="px-3 py-2 border-b border-[var(--hiver-border)] bg-white/50 text-sm text-[var(--hiver-text)] space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
              <span>
                <span className="text-[var(--hiver-text-muted)] font-medium">Til:</span>{' '}
                {customerName ? `${customerName} <${customerEmail}>` : customerEmail}
              </span>
              {replyAll && (
                <span className="text-[var(--hiver-text-muted)]">
                  <span className="font-medium">Kopi:</span> andre i tråden
                </span>
              )}
            </div>
            <div>
              <span className="text-[var(--hiver-text-muted)] font-medium">Fra:</span> {fromEmail}
            </div>
          </div>
        )}
        {!isInternalNote && (
          <div className="flex items-center gap-1 p-1.5 border-b border-[var(--hiver-border)] bg-white/60 flex-wrap">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => format('bold')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Fet">
              <Bold className="w-4 h-4" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => format('italic')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Kursiv">
              <Italic className="w-4 h-4" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => format('underline')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Understreket">
              <Underline className="w-4 h-4" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => format('insertUnorderedList')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Punktliste">
              <List className="w-4 h-4" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => format('insertOrderedList')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Nummerert liste">
              <ListOrdered className="w-4 h-4" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => format('justifyLeft')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Venstre">
              <AlignLeft className="w-4 h-4" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => format('justifyCenter')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Sentrert">
              <AlignCenter className="w-4 h-4" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => format('justifyRight')} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Høyre">
              <AlignRight className="w-4 h-4" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const u = prompt('URL:'); if (u) format('createLink', u); }} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Lenke">
              <LinkIcon className="w-4 h-4" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={insertImage} className="p-1.5 rounded hover:bg-[var(--hiver-bg)]" title="Sett inn bilde">
              <ImageIcon className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageFile}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => attachmentInputRef.current?.click()}
              className="p-1.5 rounded hover:bg-[var(--hiver-bg)]"
              title="Vedlegg (dokument)"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              ref={attachmentInputRef}
              type="file"
              accept="*/*"
              className="hidden"
              onChange={handleAttachmentChange}
            />
            {templates.length > 0 && (
              <div className="relative ml-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setTemplateOpen((v) => !v)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-sm text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                >
                  <FileText className="w-4 h-4" />
                  Mal
                </button>
                {templateOpen && (
                  <>
                    <div className="fixed inset-0 z-10" aria-hidden onClick={() => setTemplateOpen(false)} />
                    <ul className="absolute left-0 top-full mt-1 py-1 w-56 max-h-48 overflow-auto rounded-lg border border-[var(--hiver-border)] bg-white shadow-lg z-20">
                      {templates.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => insertTemplate(t)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--hiver-bg)]"
                          >
                            {t.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onPaste={handlePaste}
          className="min-h-[120px] max-h-[280px] overflow-y-auto px-3 py-2 text-sm text-[var(--hiver-text)] focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--hiver-text-muted)] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-1 [&_li]:my-0.5 [&_li]:pl-0.5 [&_img]:max-w-full [&_img]:h-auto"
          data-placeholder={isInternalNote ? 'Skriv en intern notat…' : 'Skriv svaret ditt…'}
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
          disabled={!hasContent() || sending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50 disabled:pointer-events-none"
        >
          <Send className="w-4 h-4" />
          {sending ? 'Sender…' : isInternalNote ? 'Send notat' : 'Send svar'}
        </button>
      </div>
    </div>
  );
}
