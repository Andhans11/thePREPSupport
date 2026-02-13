import DOMPurify from 'dompurify';

/** Allowed tags for email/message HTML display (safe subset). */
const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
  'blockquote', 'hr', 'h1', 'h2', 'h3', 'h4', 'pre', 'code', 'sub', 'sup', 'img',
];

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

/**
 * Sanitize HTML for safe display in message content.
 * Decodes entities and allows basic formatting tags.
 */
export function sanitizeMessageHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'style'],
    ADD_ATTR: ['target'],
  });
}

/**
 * Get HTML to display for a message: prefer html_content, fall back to plain content
 * (wrapped in a paragraph so entities like &nbsp; are decoded when rendered as HTML).
 * Applies UTF-8 mojibake fix for content that was stored with wrong encoding (e.g. Æ, Ø, Å).
 */
export function getMessageDisplayHtml(htmlContent: string | null | undefined, plainContent: string): string {
  const raw = (htmlContent && htmlContent.trim()) || plainContent;
  if (!raw) return '';
  const fixed = tryFixUtf8Mojibake(raw);
  // If it looks like HTML (contains tags), sanitize and use as-is
  if (/<[a-z][\s\S]*>/i.test(fixed)) {
    return sanitizeMessageHtml(fixed);
  }
  // Plain text possibly with entities (&nbsp;, etc.): wrap in div so we can render as HTML and decode
  return sanitizeMessageHtml('<div>' + fixed.replace(/\n/g, '<br>') + '</div>');
}
