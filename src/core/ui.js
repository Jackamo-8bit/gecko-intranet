/** Thin re-exports of the UI helpers still defined in index.html. See core/graph.js. */
export const toast      = (message, type, ms) => window.toast(message, type, ms);
export const escapeHtml = (s) => window.escapeHtml(s);
