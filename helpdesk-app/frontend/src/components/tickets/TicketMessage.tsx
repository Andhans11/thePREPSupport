import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message, MessageAttachment } from '../../types/message';
import { formatDateTime } from '../../utils/formatters';
import { getMessageDisplayHtml } from '../../utils/sanitizeHtml';
import { signTicketAttachmentUrls } from '../../services/api';
import { supabase } from '../../services/supabase';
import { Reply, ReplyAll, Forward, Paperclip, X } from 'lucide-react';

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

function isImageAttachment(a: MessageAttachment): boolean {
  const mime = (a.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = (a.filename || '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico)(\?|$)/i.test(name);
}

/** Normalize storage path for consistent lookup (trim, no leading/trailing slashes). */
function normalizeStoragePath(p: string): string {
  return String(p).trim().replace(/^\/+|\/+$/g, '');
}

/** 1x1 transparent GIF so we don't request the private storage URL before we have a blob. */
const PLACEHOLDER_IMG_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/**
 * Rewrite img src in message HTML that point to private ticket-attachments storage
 * to use our blob URLs so they load. Replaces unknown paths with a placeholder
 * so the browser never requests the private URL (which returns 400).
 */
function rewriteMessageHtmlImageUrls(html: string, pathToUrl: Record<string, string>): string {
  if (!html) return html;
  // 1) Match <img ... src="...ticket-attachments/..." ...> and replace src with blob URL or placeholder
  let out = html.replace(
    /<img\s([^>]*?)src\s*=\s*["']([^"']*ticket-attachments\/([^"']+?))["']([^>]*)>/gi,
    (_match, before, _fullUrl, pathSegment, after) => {
      try {
        const path = normalizeStoragePath(decodeURIComponent(pathSegment));
        const blobUrl = pathToUrl[path];
        const src = blobUrl || PLACEHOLDER_IMG_SRC;
        return `<img ${before}src="${src}"${after}>`;
      } catch {
        return `<img ${before}src="${PLACEHOLDER_IMG_SRC}"${after}>`;
      }
    }
  );
  // 2) Fallback: replace any remaining ticket-attachments URL (Supabase object URL or sync cid→inline URL)
  out = out.replace(
    /https?:\/\/[^"'\s]+\/storage\/v1\/object\/ticket-attachments\/[^"'\s]+/gi,
    PLACEHOLDER_IMG_SRC
  );
  out = out.replace(
    /https?:\/\/[^"'\s]+\/ticket-attachments\/[^"'\s]+/gi,
    PLACEHOLDER_IMG_SRC
  );
  return out;
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const attachments = Array.isArray(message.attachments) ? message.attachments.filter(isMessageAttachment) : [];
  const imageAttachments = attachments.filter(isImageAttachment);
  const nonImageAttachments = attachments.filter((a) => !isImageAttachment(a));
  const normalizePath = normalizeStoragePath;

  const closeLightbox = useCallback(() => setLightboxUrl(null), []);
  useEffect(() => {
    if (!lightboxUrl) return;
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox(); };
    document.addEventListener('keydown', onEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = '';
    };
  }, [lightboxUrl, closeLightbox]);

  // Revoke blob URLs on unmount to avoid leaks
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  const attachmentPaths = attachments.map((a) => normalizeStoragePath(a.storage_path));
  const loadAttachmentUrls = useCallback(async () => {
    if (attachments.length === 0) return;
    const paths = attachmentPaths.filter(Boolean);
    if (paths.length === 0) return;

    const urlMap: Record<string, string> = {};
    const failed: string[] = [];

    // Primary: client download (RLS allows read for team members)
    for (const path of paths) {
      const { data, error } = await supabase.storage.from('ticket-attachments').download(path);
      if (!error && data) {
        const blobUrl = URL.createObjectURL(data);
        blobUrlsRef.current.add(blobUrl);
        urlMap[path] = blobUrl;
      } else {
        failed.push(path);
      }
    }

    // Fallback: Edge Function signed URLs for any path that download failed
    if (failed.length > 0) {
      const { urls } = await signTicketAttachmentUrls(failed);
      Object.assign(urlMap, urls);
    }

    const stillFailed = new Set(paths.filter((p) => !urlMap[p]));
    setSignedUrls((prev) => {
      const next = { ...prev };
      paths.forEach((p) => {
        const old = next[p];
        if (old?.startsWith('blob:')) {
          blobUrlsRef.current.delete(old);
          try { URL.revokeObjectURL(old); } catch { /* ignore */ }
        }
        if (urlMap[p]) next[p] = urlMap[p];
        else delete next[p];
      });
      return next;
    });
    setFailedPaths((prev) => {
      const next = new Set(prev);
      attachmentPaths.forEach((p) => next.delete(p));
      stillFailed.forEach((p) => next.add(p));
      return next;
    });
  }, [message.id, JSON.stringify(attachmentPaths)]);

  useEffect(() => {
    if (retryCount > 0) {
      setFailedPaths((prev) => {
        const next = new Set(prev);
        attachmentPaths.forEach((p) => next.delete(p));
        return next;
      });
    }
    loadAttachmentUrls();
  }, [loadAttachmentUrls, retryCount]);

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
      {/* Inline images (e.g. pasted in email): show as thumbnails, click to lightbox */}
      {imageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {imageAttachments.map((a) => {
            const path = normalizePath(a.storage_path);
            const url = path ? signedUrls[path] : null;
            const unavailable = path && failedPaths.has(path);
            if (url) {
              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => setLightboxUrl(url)}
                  className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden hover:border-[var(--hiver-accent)] hover:ring-2 hover:ring-[var(--hiver-accent)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/40"
                  title={`${a.filename} – Klikk for å åpne`}
                >
                  <img
                    src={url}
                    alt={a.filename}
                    className="block max-h-40 w-auto max-w-full object-contain"
                  />
                </button>
              );
            }
            const canRetry = Boolean(path);
            return (
              <button
                key={path || a.filename}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (canRetry) setRetryCount((c) => c + 1);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500 hover:bg-slate-100 hover:border-slate-300 transition-colors text-left"
                title={unavailable ? 'Bilde ikke tilgjengelig. Klikk for å prøve på nytt.' : canRetry ? 'Laster… Klikk for å prøve på nytt.' : 'Laster…'}
              >
                <span className="truncate max-w-[180px]">{a.filename}</span>
                {a.size != null && <span className="text-xs text-slate-400">({(a.size / 1024).toFixed(1)} KB)</span>}
                {(!url && canRetry) && <span className="text-xs">(ikke tilgjengelig – klikk for å prøve på nytt)</span>}
              </button>
            );
          })}
        </div>
      )}
      {/* Non-image attachments: download links */}
      {nonImageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {nonImageAttachments.map((a) => {
            const path = normalizePath(a.storage_path);
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
            const canRetry = Boolean(path);
            return (
              <button
                key={path || a.filename}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (canRetry) setRetryCount((c) => c + 1);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500 hover:bg-slate-100 hover:border-slate-300 transition-colors text-left disabled:opacity-100 disabled:cursor-default"
                title={unavailable ? 'Vedlegg ikke tilgjengelig. Klikk for å prøve på nytt.' : canRetry ? 'Laster… Klikk for å prøve på nytt.' : undefined}
                disabled={!canRetry}
              >
                <Paperclip className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[180px]">{a.filename}</span>
                {a.size != null && <span className="text-xs text-slate-400">({(a.size / 1024).toFixed(1)} KB)</span>}
                {(!url && canRetry) && <span className="text-xs">(ikke tilgjengelig – klikk for å prøve på nytt)</span>}
              </button>
            );
          })}
        </div>
      )}
      <div
        className="text-slate-700 break-words [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-1 [&_li]:my-0.5 [&_a]:text-[var(--hiver-accent)] [&_a]:underline [&_.message-mention]:text-[var(--hiver-accent)] [&_.message-mention]:font-medium [&_img]:max-w-full [&_img]:h-auto"
        dangerouslySetInnerHTML={{
          __html: getMessageDisplayHtml(
            rewriteMessageHtmlImageUrls(message.html_content ?? '', signedUrls),
            message.content
          ),
        }}
      />
      {/* Lightbox for inline image click */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={closeLightbox}
          onKeyDown={(e) => e.key === 'Escape' && closeLightbox()}
          role="dialog"
          aria-modal="true"
          aria-label="Forhåndsvis bilde"
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Lukk"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Forhåndsvisning"
            className="max-w-full max-h-[90vh] w-auto h-auto object-contain rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
