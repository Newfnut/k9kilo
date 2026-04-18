// ─────────────────────────────────────────────
//  K9 Kilo v2 — utils.js
//  Pure utilities shared across modules.
//  No imports from other app modules — safe for anyone to import.
// ─────────────────────────────────────────────

/**
 * Escape a string for safe HTML insertion.
 */
export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g, '&#39;');
}
