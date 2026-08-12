/* ╔═══════════════════════════════════════════════════════════════════╗
   ║   PROJECTS BOARD                                                  ║
   ║                                                                   ║
   ║   The portal's first ES module. Project work does not fit Atera's ║
   ║   ticket model, so it lives here instead; Atera stays king for    ║
   ║   day-to-day work and is referenced by link only.                 ║
   ║                                                                   ║
   ║   SharePoint list used:                                           ║
   ║     GeckoProjects — Title, ClientName, Owner, Status, WaitingOn,  ║
   ║                     NextAction, AteraRef, Notes                   ║
   ║                                                                   ║
   ║   NOTE: no top-level `window` access in this file. tests/         ║
   ║   projects-board.mjs imports it under Node. Registration into     ║
   ║   window.GeckoSections lives in src/main.js.                      ║
   ╚═══════════════════════════════════════════════════════════════════╝ */

import { graphFetch, resolveSiteId, fetchAllLists, clearListsCache } from '../core/graph.js';
import { toast, escapeHtml } from '../core/ui.js';

const LIST_NAME        = 'GeckoProjects';
const CLIENTS_LIST_NAME = 'GeckoClients';

/** Module state. Populated by load(), read by the renderers. */
const PRJ = {
  listId:   null,
  clients:  [],     // client names, for the modal dropdown (Task 6)
  projects: [],     // Project[]
  loading:  false,
  error:    null    // null | 'LIST_MISSING' | string
};

// ─── Pure helpers (unit-tested in tests/projects-board.mjs) ───────────

/** Board columns, in order. Must match the SharePoint Choice values. */
export const STATUSES = ['Quoted', 'Agreed', 'In progress', 'Done'];

/** Days without a change before an active project is flagged as drifting. */
export const STALE_DAYS = 21;

/** Only work that is supposed to be moving can drift. Quotes legitimately sit. */
const STALE_STATUSES = new Set(['Agreed', 'In progress']);

const DAY_MS = 86400000;

/**
 * Whole weeks between an ISO timestamp and `now`, floored.
 * Returns 0 for anything unparseable so the badge never renders "NaNw".
 */
export function weeksSince(iso, now = new Date()) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 0;
  return Math.floor((now - then) / (7 * DAY_MS));
}

/**
 * Has this project sat untouched long enough to be worth flagging?
 * Deliberately false for anything unparseable — a bad date should not
 * manufacture an alarm.
 */
export function isStale(project, now = new Date()) {
  if (!project || !STALE_STATUSES.has(project.status)) return false;
  const modified = new Date(project.modified);
  if (Number.isNaN(modified.getTime())) return false;
  return (now - modified) > STALE_DAYS * DAY_MS;
}

/**
 * Bucket projects into board columns. Unknown, empty and missing statuses
 * fall into Quoted — a project must never silently disappear from the board
 * because someone edited the Choice column in SharePoint.
 */
export function groupByStatus(projects) {
  const groups = Object.fromEntries(STATUSES.map(s => [s, []]));
  for (const project of projects || []) {
    const key = STATUSES.includes(project?.status) ? project.status : 'Quoted';
    groups[key].push(project);
  }
  return groups;
}

// ─── Data ─────────────────────────────────────────────────────────────

/** Graph list item → the flat shape the renderers use. */
function mapItem(item) {
  const f = item.fields || {};
  return {
    id:         item.id,
    title:      f.Title       || '(untitled)',
    client:     f.ClientName  || '',
    owner:      f.Owner       || '',
    status:     f.Status      || 'Quoted',
    waitingOn:  f.WaitingOn   || '',
    nextAction: f.NextAction  || '',
    ateraRef:   f.AteraRef    || '',
    notes:      f.Notes       || '',
    modified:   f.Modified    || item.lastModifiedDateTime || ''
  };
}

/** Resolve the GeckoProjects list id, caching it on PRJ. */
async function resolveListId() {
  if (PRJ.listId) return PRJ.listId;
  const findList = lists =>
    lists.find(l => l.displayName === LIST_NAME || l.name === LIST_NAME);

  let list = findList(await fetchAllLists());
  if (!list) {
    // fetchAllLists() caches globally, so a list created since that cache was
    // filled stays invisible until the cache is dropped. Without this, the
    // setup message tells the user to create the list and then Retry never
    // works. Same one-shot retry pnlResolveListId uses.
    clearListsCache();
    list = findList(await fetchAllLists());
  }
  if (!list) {
    const err = new Error(`${LIST_NAME} list not found`);
    err.code = 'LIST_MISSING';
    throw err;
  }
  PRJ.listId = list.id;
  return PRJ.listId;
}

/**
 * Fetch every project. No paging: this list holds tens of rows, not
 * thousands, and $top=999 is the same ceiling the other sections use.
 * ponytail: unpaged. Add @odata.nextLink following if this ever exceeds 999.
 */
async function fetchProjects() {
  const siteId = await resolveSiteId();
  const listId = await resolveListId();
  const res = await graphFetch(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`
  );
  return (res.value || []).map(mapItem);
}

/** Client names for the modal dropdown. Failure here is not fatal. */
async function fetchClientNames() {
  try {
    const siteId = await resolveSiteId();
    const lists  = await fetchAllLists();
    const list   = lists.find(
      l => l.displayName === CLIENTS_LIST_NAME || l.name === CLIENTS_LIST_NAME
    );
    if (!list) return [];
    const res = await graphFetch(
      `/sites/${siteId}/lists/${list.id}/items?expand=fields($select=Title)&$top=999`
    );
    return (res.value || [])
      .map(i => i.fields?.Title)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];   // the board is still usable with a free-text client field
  }
}

/** Load everything and render. Sets PRJ.error rather than throwing. */
async function load() {
  if (PRJ.loading) return;
  PRJ.loading = true;
  PRJ.error   = null;
  render();
  try {
    const [projects, clients] = await Promise.all([fetchProjects(), fetchClientNames()]);
    PRJ.projects = projects;
    PRJ.clients  = clients;
    const stamp = document.getElementById('prjLastSync');
    if (stamp) stamp.textContent = 'Synced ' + new Date().toLocaleTimeString('en-GB',
      { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    PRJ.error = err.code === 'LIST_MISSING' ? 'LIST_MISSING' : (err.message || 'Load failed');
  } finally {
    PRJ.loading = false;
    render();
  }
}

// ─── Render ───────────────────────────────────────────────────────────

const SETUP_MESSAGE = `
  <div class="prj-error">
    <strong>The GeckoProjects list does not exist yet.</strong>
    Create a list named <code>GeckoProjects</code> on the portal SharePoint site
    with these columns: ClientName (text), Owner (choice: Jack, Philip),
    Status (choice: Quoted, Agreed, In progress, Done), WaitingOn (text),
    NextAction (text), AteraRef (text), Notes (multi-line, plain text).
    Column names must not contain spaces.
  </div>`;

function render() {
  const mount = document.getElementById('prjBoard');
  if (!mount) return;

  if (PRJ.loading && !PRJ.projects.length) {
    mount.innerHTML = '<p class="prj-empty">Loading projects…</p>';
    return;
  }
  if (PRJ.error === 'LIST_MISSING') {
    mount.innerHTML = SETUP_MESSAGE;
    return;
  }
  if (PRJ.error) {
    // An empty board and a failed load must never look the same.
    mount.innerHTML = `
      <div class="prj-error">
        <strong>Could not load projects.</strong>
        ${escapeHtml(PRJ.error)}
        <button type="button" id="prjRetry">Retry</button>
      </div>`;
    document.getElementById('prjRetry')?.addEventListener('click', load);
    return;
  }

  // Task 4 replaces this with the board itself.
  mount.innerHTML = `<p class="prj-empty">${PRJ.projects.length} project(s) loaded.</p>`;
}

// ─── Section lifecycle ────────────────────────────────────────────────

/** Called once, by navTo, on first visit to the section. */
export function init() {
  document.getElementById('prjRefresh')?.addEventListener('click', refresh);
  load();
}

/** Called by the section's Refresh button. */
export function refresh() {
  PRJ.listId = null;   // re-resolve in case the list was only just created
  load();
}
