import { useState, useEffect } from 'react';
import type { Message, MessageAttachment } from '../../types/message';
import { formatDateTime } from '../../utils/formatters';
import { getMessageDisplayHtml } from '../../utils/sanitizeHtml';
import { supabase } from '../../services/supabase';
import { Reply, ReplyAll, Forward, Paperclip } from 'lucide-react';

interface TicketMessageProps {
  message: Message;
  /** Customer email (for To line on agent replies) */
  customerEmail?: string;
  /** Customer name (for To line on agent replies) */
  customerName?: string | null;
  /** Support/group email (for To line on customer messages) */
  supportEmail?: string | null;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
}

function formatFromTo(name: string | null, email: string): string {
  const n = (name ?? '').trim();
  if (n && n !== email) return `${n} <${email}>`;
  return email || '—';
}

function isMessageAttachment(a: unknown): a is MessageAttachment {
  return typeof a === 'object' && a !== null && 'storage_path' in a && 'filename' in a;
}

export function TicketMessage({
  message,
  customerEmail = '',
  customerName = null,
  supportEmail = null,
  onReply,
  onReplyAll,
  onForward,
}: TicketMessageProps) {
  const [hover, setHover] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [failedPaths, setFailedPaths] = useState<Set<string>>(new Set());
  const attachments = Array.isArray(message.attachments) ? message.attachments.filter(isMessageAttachment) : [];
  useEffect(() => {
    if (attachments.length === 0) return;
    const load = async () => {
      const next: Record<string, string> = {};
      const failed = new Set<string>();
      for (const a of attachments) {
        const path = String(a.storage_path).trim();
        if (!path) continue;
        const { data, error } = await supabase.storage.from('ticket-attachments').createSignedUrl(path, 3600);
        if (error) {
          failed.add(path);
          continue;
        }
        if (data?.signedUrl) next[path] = data.signedUrl;
      }
      setSignedUrls((prev) => ({ ...prev, ...next }));
      if (failed.size > 0) setFailedPaths((prev) => new Set([...prev, ...failed]));
    };
    load();
  }, [message.id, JSON.stringify(attachments.map((a) => a.storage_path))]);
  const isCustomer = message.is_customer;
  const isInternal = message.is_internal_note;
  const showActions = !isInternal && (onReply || onReplyAll || onForward);

  const fromLabel = formatFromTo(message.from_name, message.from_email);
  const toLabel =
    isInternal
      ? '—'
      : isCustomer
        ? (supportEmail?.trim() || 'Support')
        : formatFromTo(customerName ?? null, customerEmail);

  return (
    <div
      className={`rounded-lg p-4 relative group ${
        isInternal
          ? 'bg-amber-50 border border-amber-200'
          : isCustomer
            ? 'bg-[var(--hiver-bg)]'
            : 'bg-blue-50 border border-blue-100'
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm mb-1">
        <span className="font-medium text-slate-800">
          {message.from_name || message.from_email}
        </span>
        {isInternal && (
          <span className="text-amber-700 text-xs font-medium">Intern notat</span>
        )}
        <span className="text-slate-500 text-xs">
          {isInternal
            ? `Notat av ${message.from_name || message.from_email} · ${formatDateTime(message.created_at)}`
            : isCustomer
              ? `Fra kunde · ${formatDateTime(message.created_at)}`
              : `Svart av ${message.from_name || message.from_email} · ${formatDateTime(message.created_at)}`}
        </span>
        <span className="text-slate-500 ml-auto flex items-center gap-0.5">
          {showActions && hover && (
            <span className="flex items-center gap-0.5 mr-2">
              {onReply && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReply(); }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)] transition-colors"
                  aria-label="Svar"
                  title="Svar"
                >
                  <Reply className="w-4 h-4" />
                  <span className="text-[10px]">Svar</span>
                </button>
              )}
              {onReplyAll && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReplyAll(); }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)] transition-colors"
                  aria-label="Svar alle"
                  title="Svar alle"
                >
                  <ReplyAll className="w-4 h-4" />
                  <span className="text-[10px]">Svar alle</span>
                </button>
              )}
              {onForward && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onForward(); }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)] transition-colors"
                  aria-label="Videresend"
                  title="Videresend"
                >
                  <Forward className="w-4 h-4" />
                  <span className="text-[10px]">Videresend</span>
                </button>
              )}
            </span>
          )}
        </span>
      </div>
      <div className="text-xs text-slate-500 mb-2 border-b border-slate-100 pb-2 space-y-0.5">
        <div><span className="font-medium text-slate-600">Fra:</span> {fromLabel}</div>
        <div><span className="font-medium text-slate-600">Til:</span> {toLabel}</div>
      </div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((a) => {
            const path = String(a.storage_path).trim();
            const url = path ? signedUrls[path] : null;
            const unavailable = path && failedPaths.has(path);
            if (url) {
              return (
                <a
                  key={path}
                  href={url}
                  download={a.filename}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate max-w-[180px]">{a.filename}</span>
                  {a.size != null && <span className="text-xs text-slate-400">({(a.size / 1024).toFixed(1)} KB)</span>}
                </a>
              );
            }
            return (
              <span
                key={path || a.filename}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500"
                title={unavailable ? 'Filen finnes ikke eller du har ikke tilgang' : undefined}
              >
                <Paperclip className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[180px]">{a.filename}</span>
                {a.size != null && <span className="text-xs text-slate-400">({(a.size / 1024).toFixed(1)} KB)</span>}
                {unavailable && <span className="text-xs">(ikke tilgjengelig)</span>}
              </span>
            );
          })}
        </div>
      )}
      <div
        className="text-slate-700 break-words [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-1 [&_li]:my-0.5 [&_a]:text-[var(--hiver-accent)] [&_a]:underline [&_img]:max-w-full [&_img]:h-auto"
        dangerouslySetInnerHTML={{
          __html: getMessageDisplayHtml(message.html_content, message.content),
        }}
      />
    </div>
  );
}
