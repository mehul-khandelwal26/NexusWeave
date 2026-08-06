/**
 * HTML Escaping and Sanitization Utilities for NexusWeave
 */

/**
 * Escapes unsafe HTML characters in a string to prevent XSS injection.
 * @param {any} str - Input string or value to escape
 * @return {string} Escaped HTML string
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  const stringVal = String(str);
  return stringVal
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitizes markdown-like formatting while escaping HTML tags.
 * Supports simple **bold**, *italic*, `code`, and linebreaks.
 * @param {string} rawText - Unsanitized text with optional markdown markup
 * @return {string} Safe HTML string
 */
function sanitizeMarkdown(rawText) {
  if (!rawText) return '';
  
  // Step 1: Escape all HTML tags first
  let safe = escapeHTML(rawText);

  // Step 2: Safe regex replacement for inline bold, italic, code
  safe = safe.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  safe = safe.replace(/\n/g, '<br>');

  return safe;
}

if (typeof window !== 'undefined') {
  window.escapeHTML = escapeHTML;
  window.sanitizeMarkdown = sanitizeMarkdown;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHTML, sanitizeMarkdown };
}
