// Text hygiene for user-generated content (chat, reviews). We store plain text / light markdown and
// render it with renderSafeMarkdown(), which escapes HTML *before* applying any formatting.

const PROFANITY = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'dickhead', 'motherfucker'];
const PROFANITY_RE = new RegExp(`\\b(${PROFANITY.join('|')})\\w*\\b`, 'gi');

export function sanitizeText(input: string, maxLength = 4000): string {
  return input
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maxLength);
}

export function maskProfanity(input: string): string {
  return input.replace(PROFANITY_RE, (w) => w[0] + '*'.repeat(Math.max(1, w.length - 1)));
}

export interface SpamVerdict {
  spam: boolean;
  reason?: string;
}

export function detectSpam(input: string): SpamVerdict {
  const links = (input.match(/https?:\/\//gi) || []).length;
  if (links > 4) return { spam: true, reason: 'Too many links' };
  if (/(.)\1{24,}/.test(input)) return { spam: true, reason: 'Repeated characters' };
  if (/\b(viagra|casino bonus|crypto giveaway|bitcoin doubler|free followers)\b/i.test(input)) return { spam: true, reason: 'Spam keywords' };
  return { spam: false };
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

/** Escape-first markdown subset: **bold**, *italic*, `code`, http(s) links, line breaks. */
export function renderSafeMarkdown(input: string): string {
  let s = escapeHtml(input);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`);
  s = s.replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h3>$1</h3>').replace(/^- (.+)$/gm, '• $1');
  return s.replace(/\n/g, '<br>');
}
