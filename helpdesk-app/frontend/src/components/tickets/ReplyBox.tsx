import { useState, useEffect, useRef } from 'react';
import { Send, StickyNote, FileText, Bold, Italic, Underline, Image as ImageIcon, Link as LinkIcon, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Paperclip, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useGmail } from '../../contexts/GmailContext';
import { useTenant } from '../../contexts/TenantContext';
import { useTickets } from '../../contexts/TicketContext';
import { sendGmailReply, type EmailAttachment } from '../../services/api';
import { supabase } from '../../services/supabase';
import { compileTemplate } from '../../utils/templateHandlebars';
import { extractMentionedUserIds, mentionsToPlainNames } from '../../utils/sanitizeHtml';
import type { Message } from '../../types/message';

interface MentionMember {
  user_id: string;
  name: string;
}

/** Get character offset of caret from start of element (text content). */
function getCaretCharacterOffsetWithin(element: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  return preCaretRange.toString().length;
}

/** Get (node, offset) for a given character offset inside element. */
function getNodeAndOffsetAtCharacterOffset(element: HTMLElement, charOffset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let current = 0;
  let node: Node | null = walker.nextNode();
  while (node) {
    const len = (node.textContent || '').length;
    if (current + len >= charOffset) return { node, offset: charOffset - current };
    current += len;
    node = walker.nextNode();
  }
  return { node: element, offset: element.childNodes.length };
}

const DATA_URL_IMG_REGEX = /<img([^>]*?)src\s*=\s*["'](data:image\/[^"']+)["']([^>]*)>/gi;

/** Upload inline data URL images to storage and return HTML with img src replaced by ticket-attachments URLs plus attachments list. */
async function processInlineImagesInHtml(
  html: string | null,
  tenantId: string,
  ticketId: string,
  messageId: string
): Promise<{ html: string | null; inlineAttachments: { storage_path: string; filename: string; mime_type: string; size: number }[] }> {
  if (!html || !html.includes('data:image/')) return { html, inlineAttachments: [] };
  const matches = [...html.matchAll(DATA_URL_IMG_REGEX)];
  if (matches.length === 0) return { html, inlineAttachments: [] };
  const inlineAttachments: { storage_path: string; filename: string; mime_type: string; size: number }[] = [];
  const replacementTags: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const dataUrl = m[2];
    const comma = dataUrl.indexOf(',');
    if (comma === -1) {
      replacementTags.push(m[0]);
      continue;
    }
    const header = dataUrl.slice(0, comma);
    const mimeMatch = header.match(/data:image\/(\w+)/i);
    const ext = mimeMatch ? (mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1]) : 'png';
    const base64 = dataUrl.slice(comma + 1);
    try {
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const filename = `pasted_${i}.${ext}`;
      const path = `${tenantId}/${ticketId}/${messageId}/${filename}`;
      const { error } = await supabase.storage.from('ticket-attachments').upload(path, bin, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });
      if (error) {
        replacementTags.push(m[0]);
        continue;
      }
      inlineAttachments.push({
        storage_path: path,
        filename,
        mime_type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        size: bin.length,
      });
      replacementTags.push(`<img${m[1]}src="https://inline/ticket-attachments/${path}"${m[3]}>`);
    } catch {
      replacementTags.push(m[0]);
    }
  }
  let out = html;
  for (let i = 0; i < matches.length; i++) {
    out = out.replace(matches[i][0], replacementTags[i]);
  }
  return { html: out, inlineAttachments };
}

/** Build plain-text and HTML conversation history (excluding internal notes) for including in email reply. */
function buildConversationHistory(messages: Message[]): { plain: string; html: string } {
  const publicMessages = messages
    .filter((m) => !m.is_internal_note)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  if (publicMessages.length === 0) return { plain: '', html: '' };

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString('nb-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const plainParts: string[] = [];
  const htmlParts: string[] = [];

  for (const m of publicMessages) {
    const from = m.from_name?.trim() || m.from_email || '—';
    const header = `Den ${dateFmt(m.created_at)} skrev ${from} (${m.from_email}):`;
    const bodyPlain = (m.html_content || m.content || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    const bodyText = bodyPlain || '(ingen tekst)';
    plainParts.push(header + '\n\n' + bodyText);

    const bodyHtmlEscaped = bodyText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    const headerEscaped = header.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    htmlParts.push(
      `<div style="margin:0.75em 0;padding-left:1em;border-left:3px solid #ccc;color:#555;">` +
        `<div style="font-size:0.85em;margin-bottom:0.25em;">${headerEscaped}</div>` +
        `<div>${bodyHtmlEscaped}</div></div>`
    );
  }

  return {
    plain: '\n\n---\n\n' + plainParts.join('\n\n---\n\n'),
    html: '<br><br><div style="border-top:1px solid #ccc;margin-top:1em;padding-top:1em;color:#666;">' + htmlParts.join('') + '</div>',
  };
}

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
  const [mentionMembers, setMentionMembers] = useState<MentionMember[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionReplaceLength, setMentionReplaceLength] = useState(0);

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

  useEffect(() => {
    if (!currentTenantId) return;
    supabase
      .from('team_members')
      .select('user_id, name')
      .eq('tenant_id', currentTenantId)
      .not('user_id', 'is', null)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setMentionMembers((data as MentionMember[]) ?? []));
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

  const getTextBeforeCaret = (): string => {
    if (!editorRef.current) return '';
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(editorRef.current);
    range.setEnd(sel.anchorNode!, sel.anchorOffset);
    return range.toString();
  };

  const handleInput = () => {
    if (editorRef.current) setContent(editorRef.current.innerHTML);
    const textBefore = getTextBeforeCaret();
    const lastAt = textBefore.lastIndexOf('@');
    if (lastAt === -1) {
      setMentionQuery(null);
      return;
    }
    const afterAt = textBefore.slice(lastAt + 1);
    if (/[\s\n\[\]()]/.test(afterAt)) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(afterAt);
    setMentionReplaceLength(textBefore.length - lastAt);
  };

  const filteredMentionMembers = mentionQuery == null
    ? []
    : mentionMembers.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8);
  const showMentionDropdown = mentionQuery !== null && filteredMentionMembers.length > 0;

  const insertMention = (member: MentionMember) => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;
    const replaceLen = mentionReplaceLength;
    const caretOffset = getCaretCharacterOffsetWithin(editor);
    const startOffset = caretOffset - replaceLen;
    if (startOffset < 0) return;
    const start = getNodeAndOffsetAtCharacterOffset(editor, startOffset);
    const end = getNodeAndOffsetAtCharacterOffset(editor, caretOffset);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    sel.removeAllRanges();
    sel.addRange(range);
    const mentionText = `@[${member.name}](${member.user_id})`;
    document.execCommand('insertText', false, mentionText);
    setMentionQuery(null);
    setContent(editor.innerHTML);
  };

  const handleSend = async () => {
    const raw = editorRef.current?.innerHTML ?? content;
    const trimmed = (raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') || '').trim();
    if (!trimmed || !user?.email) return;
    setError(null);
    setSending(true);

    const signature = isInternalNote ? '' : (hasExistingReplies ? signatureFollowUp : signatureNew);
    const replyOnlyPlain = signature ? `${trimmed}\n\n${signature}` : trimmed;
    const editorHtml = editorRef.current?.innerHTML ?? null;
    const signatureHtml = signature ? `<div style="margin-top:1em">${signature.replace(/\n/g, '<br>')}</div>` : '';
    const replyOnlyHtml = isInternalNote ? null : (editorHtml ? editorHtml + signatureHtml : null);

    const mentioned_user_ids = extractMentionedUserIds(trimmed);

    // For email to customer: show @Name only (not the UUID)
    const conversation = canSendViaGmail ? buildConversationHistory(messages) : { plain: '', html: '' };
    const plainForEmail = mentionsToPlainNames(replyOnlyPlain);
    const contentToSend = plainForEmail + conversation.plain;
    const replyHtmlForEmail = replyOnlyHtml
      ? replyOnlyHtml.replace(/@\[([^\]]*)\]\([a-f0-9-]{36}\)/gi, '@$1')
      : null;
    const htmlToSendFinal = replyHtmlForEmail ? replyHtmlForEmail + (canSendViaGmail ? conversation.html : '') : null;

    try {
      if (canSendViaGmail) {
        const result = await sendGmailReply(ticketId, contentToSend, customerEmail, false, htmlToSendFinal ?? undefined, attachment ?? undefined, replyAll);
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
        content: replyOnlyPlain,
        html_content: replyOnlyHtml,
        is_customer: false,
        is_internal_note: isInternalNote,
        mentioned_user_ids: mentioned_user_ids.length ? mentioned_user_ids : undefined,
        created_by: user?.id,
      });
      type AttRow = { storage_path: string; filename: string; mime_type: string; size: number };
      let paperclipAtt: AttRow[] = [];
      if (attachment && messageId && currentTenantId) {
        const bin = Uint8Array.from(atob(attachment.contentBase64), (c) => c.charCodeAt(0));
        const path = `${currentTenantId}/${ticketId}/${messageId}/${attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('ticket-attachments').upload(path, bin, {
          contentType: attachment.mimeType || 'application/octet-stream',
          upsert: true,
        });
        if (!upErr) {
          paperclipAtt = [{ storage_path: path, filename: attachment.filename, mime_type: attachment.mimeType || 'application/octet-stream', size: bin.length }];
          await supabase.from('messages').update({ attachments: paperclipAtt }).eq('id', messageId);
        }
      }
      if (replyOnlyHtml?.includes('data:image/') && messageId && currentTenantId) {
        const { html: newHtml, inlineAttachments } = await processInlineImagesInHtml(replyOnlyHtml, currentTenantId, ticketId, messageId);
        if (newHtml != null || inlineAttachments.length > 0) {
          await supabase
            .from('messages')
            .update({
              ...(newHtml != null && { html_content: newHtml }),
              attachments: [...paperclipAtt, ...inlineAttachments],
            })
            .eq('id', messageId);
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
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMentionQuery(null);
            }}
            onPaste={handlePaste}
            className="min-h-[120px] max-h-[280px] overflow-y-auto px-3 py-2 text-sm text-[var(--hiver-text)] focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--hiver-text-muted)] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-1 [&_li]:my-0.5 [&_li]:pl-0.5 [&_img]:max-w-full [&_img]:h-auto"
            data-placeholder={isInternalNote ? 'Skriv en intern notat… Skriv @ for å nevne en kollega.' : 'Skriv svaret ditt… Skriv @ for å nevne en kollega.'}
            suppressContentEditableWarning
          />
          {showMentionDropdown && (
            <ul
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-[var(--hiver-border)] bg-white py-1 shadow-lg"
              role="listbox"
            >
              {filteredMentionMembers.map((m) => (
                <li key={m.user_id}>
                  <button
                    type="button"
                    role="option"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--hiver-bg)]"
                    onClick={() => insertMention(m)}
                  >
                    @{m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
