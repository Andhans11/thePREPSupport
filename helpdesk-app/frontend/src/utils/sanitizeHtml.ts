import DOMPurify from 'dompurify';

/** Allowed tags for email/message HTML display (safe subset). */
const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
  'blockquote', 'hr', 'h1', 'h2', 'h3', 'h4', 'pre', 'code', 'sub', 'sup', 'img',
];

/** Escape HTML entities so mention names are safe to inject. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MENTION_REGEX = /@\[([^\]]*)\]\(([a-f0-9-]{36})\)/gi;

/** Decode HTML entities that might wrap mention syntax so we can match @[Name](id). */
function decodeMentionEntities(str: string): string {
  return str
    .replace(/&#91;/gi, '[')
    .replace(/&#93;/gi, ']')
    .replace(/&#40;/gi, '(')
    .replace(/&#41;/gi, ')')
    .replace(/&#x5b;/gi, '[')
    .replace(/&#x5d;/gi, ']')
    .replace(/&#x28;/gi, '(')
    .replace(/&#x29;/gi, ')');
}

/** Replace @[Name](user_id) with a styled span showing only the name (for display). */
export function transformMentionsToDisplay(htmlOrPlain: string): string {
  if (!htmlOrPlain || typeof htmlOrPlain !== 'string') return htmlOrPlain;
  const decoded = decodeMentionEntities(htmlOrPlain);
  const out = decoded.replace(MENTION_REGEX, (_, name) => {
    const safe = escapeHtml(name.trim());
    return `<span class="message-mention">${safe}</span>`;
  });
  MENTION_REGEX.lastIndex = 0;
  return out;
}

/** Extract unique user IDs from content with @[Name](user_id) mentions. */
export function extractMentionedUserIds(content: string): string[] {
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((m = MENTION_REGEX.exec(content)) !== null) {
    if (m[2] && !ids.includes(m[2])) ids.push(m[2]);
  }
  return ids;
}

/** Replace @[Name](user_id) with plain @Name (e.g. for email body to customer). */
export function mentionsToPlainNames(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.replace(MENTION_REGEX, '@$1');
}

/**
 * Fix UTF-8 mojibake: text that was UTF-8 but decoded as Latin-1 (e.g. "på" → "Ã¥").
 * Treats each character's code point as a byte and decodes the result as UTF-8.
 * Returns the original string if the result would be invalid (e.g. already correct UTF-8).
 */
export function tryFixUtf8Mojibake(str: string): string {
  if (!str || typeof str !== 'string') return str;
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c > 255) return str;
    bytes.push(c);
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    if (decoded.includes('\uFFFD')) return str;
    return decoded;
  } catch {
    return str;
  }
}

/** Placeholder for private ticket-attachment img src so the browser never requests the URL (avoids 400). */
const TICKET_ATTACHMENT_PLACEHOLDER_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/**
 * Strip private ticket-attachments object URLs from HTML so they are never requested (400).
 * Run before AND after sanitize so we catch all forms (raw, encoded, DOMPurify output).
 * Path part uses [^"']+ so we match up to the closing quote even with query params or encoded chars.
 */
function stripTicketAttachmentUrls(html: string): string {
  if (!html || typeof html !== 'string') return html;
  // Supabase object URL: https://project.supabase.co/storage/v1/object/ticket-attachments/...
  let out = html.replace(
    /https?:\/\/[^"'\s<>]+\/storage\/v1\/object\/ticket-attachments\/[^"']+/gi,
    TICKET_ATTACHMENT_PLACEHOLDER_SRC
  );
  // Inline/cid form: https://something/ticket-attachments/...
  out = out.replace(
    /https?:\/\/[^"'\s<>]+\/ticket-attachments\/[^"']+/gi,
    TICKET_ATTACHMENT_PLACEHOLDER_SRC
  );
  return out;
}

/**
 * Sanitize HTML for safe display in message content.
 * Decodes entities and allows basic formatting tags.
 * Strips private ticket-attachment URLs before and after so the browser never requests them.
 */
export function sanitizeMessageHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const stripped = stripTicketAttachmentUrls(html);
  const sanitized = DOMPurify.sanitize(stripped, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'style', 'class'],
    ADD_ATTR: ['target'],
  });
  return stripTicketAttachmentUrls(sanitized);
}

/**
 * Get HTML to display for a message: prefer html_content, fall back to plain content
 * (wrapped in a paragraph so entities like &nbsp; are decoded when rendered as HTML).
 * Applies UTF-8 mojibake fix for content that was stored with wrong encoding (e.g. Æ, Ø, Å).
 * Always strips ticket-attachment URLs so the browser never requests them (400).
 */
export function getMessageDisplayHtml(htmlContent: string | null | undefined, plainContent: string): string {
  const raw = (htmlContent && htmlContent.trim()) || plainContent;
  if (!raw) return '';
  const fixed = tryFixUtf8Mojibake(raw);
  // Strip private storage URLs first so they never reach the DOM from any code path
  const noStorageUrls = stripTicketAttachmentUrls(fixed);
  // Transform @[Name](user_id) into styled @Name before sanitizing
  const withMentions = transformMentionsToDisplay(noStorageUrls);
  // If it looks like HTML (contains tags), sanitize and use as-is
  if (/<[a-z][\s\S]*>/i.test(withMentions)) {
    return sanitizeMessageHtml(withMentions);
  }
  // Plain text possibly with entities (&nbsp;, etc.): wrap in div so we can render as HTML and decode
  return sanitizeMessageHtml('<div>' + withMentions.replace(/\n/g, '<br>') + '</div>');
}
