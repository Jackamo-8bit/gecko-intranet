/**
 * Module entry point.
 *
 * Sections built as ES modules register themselves here; navTo() in
 * index.html dispatches to them. This is the only file that touches
 * `window` at module scope, which keeps every section module importable
 * under Node for testing.
 *
 * Adding an extracted section later is two lines: import it, register it.
 */
import * as projects from './sections/projects.js';

window.GeckoSections = window.GeckoSections || {};
window.GeckoSections.projects = { init: projects.init, refresh: projects.refresh };
