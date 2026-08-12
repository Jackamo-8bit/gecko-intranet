/**
 * Thin re-exports of the Graph helpers still defined in index.html.
 *
 * These wrap rather than copy on purpose: there must be exactly one Graph
 * client, one site-id resolution and one lists cache in the app. When these
 * helpers are genuinely extracted from index.html later, only this file
 * changes and every importing module is untouched.
 *
 * Arrow bodies, not direct references — the globals do not exist yet at
 * module-evaluation time.
 */
export const graphFetch    = (path, options) => window.graphFetch(path, options);
export const resolveSiteId = () => window.resolveSiteId();
export const fetchAllLists = () => window.fetchAllLists();

/** Drop the global lists cache so the next fetchAllLists() re-reads the site. */
export const clearListsCache = () => { window.CONFIG._listsCache = null; };
