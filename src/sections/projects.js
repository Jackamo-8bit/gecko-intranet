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
  error:    null,   // null | 'LIST_MISSING' | string
  doneOpen: false,  // the Done column starts collapsed
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

/**
 * PATCH one item's fields.
 * ponytail: last-write-wins. Add If-Match/ETag if a third person ever uses this.
 */
async function patchFields(id, fields) {
  const siteId = await resolveSiteId();
  const listId = await resolveListId();
  await graphFetch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, {
    method: 'PATCH',
    body:   JSON.stringify(fields)
  });
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

const ATERA_TICKET_URL = 'https://app.atera.com/new/tickets/';

/** One project card. Every interpolated value is escaped. */
function renderCard(project) {
  const stale   = isStale(project);
  const waiting = project.waitingOn.trim();

  const badges = [
    waiting
      ? `<span class="prj-chip prj-chip-wait" title="Waiting on: ${escapeHtml(waiting)}">Waiting · ${escapeHtml(waiting)}</span>`
      : '',
    stale
      ? `<span class="prj-chip prj-chip-stale">No movement ${weeksSince(project.modified)}w</span>`
      : ''
  ].join('');

  const meta = [
    project.client ? `<span>${escapeHtml(project.client)}</span>` : '',
    project.owner  ? `<span>${escapeHtml(project.owner)}</span>`  : '',
    project.ateraRef
      ? `<a class="prj-atera" href="${ATERA_TICKET_URL}${encodeURIComponent(project.ateraRef)}"
            target="_blank" rel="noopener noreferrer">#${escapeHtml(project.ateraRef)}</a>`
      : ''
  ].join('');

  const options = STATUSES.map(s =>
    `<option value="${escapeHtml(s)}"${s === project.status ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  // The meta row sits OUTSIDE the card-open button on purpose: the Atera
  // link is interactive content, and an <a> nested inside a <button> is
  // invalid HTML that browsers handle inconsistently. Keeping it outside
  // also means the link needs no stopPropagation to avoid opening the modal.
  return `
    <article class="prj-card${stale ? ' is-stale' : ''}" data-prj-id="${escapeHtml(project.id)}">
      <button class="prj-card-open" type="button" data-prj-open="${escapeHtml(project.id)}">
        <h4>${escapeHtml(project.title)}</h4>
        ${project.nextAction ? `<p class="prj-next">${escapeHtml(project.nextAction)}</p>` : ''}
        ${badges ? `<div class="prj-chips">${badges}</div>` : ''}
      </button>
      ${meta ? `<div class="prj-meta">${meta}</div>` : ''}
      <label class="prj-status-wrap">
        <span class="sr-only">Status for ${escapeHtml(project.title)}</span>
        <select class="prj-status" data-prj-id="${escapeHtml(project.id)}">${options}</select>
      </label>
    </article>`;
}

/** One column. Done is collapsed by default so it cannot grow without limit. */
function renderColumn(status, projects) {
  const isDone    = status === 'Done';
  const collapsed = isDone && !PRJ.doneOpen;
  const body = collapsed
    ? ''
    : (projects.length
        ? projects.map(renderCard).join('')
        : '<p class="prj-col-empty">Nothing here.</p>');

  return `
    <section class="prj-col${collapsed ? ' is-collapsed' : ''}" data-status="${escapeHtml(status)}">
      <header class="prj-col-head">
        <h3>${escapeHtml(status)}</h3>
        <span class="prj-count">${projects.length}</span>
        ${isDone ? `<button class="prj-col-toggle" type="button" data-prj-toggle-done
                       aria-expanded="${String(!collapsed)}">${collapsed ? 'Show' : 'Hide'}</button>` : ''}
      </header>
      <div class="prj-col-body">${body}</div>
    </section>`;
}

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

  if (!PRJ.projects.length) {
    mount.innerHTML = `
      <div class="prj-empty">
        <strong>No projects yet.</strong>
        <button type="button" data-prj-open="new">Add the first one</button>
      </div>`;
    return;
  }

  const grouped = groupByStatus(PRJ.projects);
  mount.innerHTML = `
    <div class="prj-board">
      ${STATUSES.map(s => renderColumn(s, grouped[s])).join('')}
    </div>`;

  mount.querySelector('[data-prj-toggle-done]')?.addEventListener('click', () => {
    PRJ.doneOpen = !PRJ.doneOpen;
    render();
  });

  mount.querySelectorAll('.prj-status').forEach(select => {
    select.addEventListener('change', async (event) => {
      const el      = event.currentTarget;
      const id      = el.dataset.prjId;
      const status  = el.value;
      const project = PRJ.projects.find(p => p.id === id);
      if (!project) return;
      const previous = project.status;

      el.disabled = true;
      try {
        await patchFields(id, { Status: status });
        // Modified moves too, so the staleness badge stays honest.
        project.status   = status;
        project.modified = new Date().toISOString();
        toast(`Moved to ${status}`, 'success');
        render();
      } catch (err) {
        // No optimistic update, so the card simply stays where it was.
        el.value    = previous;
        el.disabled = false;
        toast(err.message || 'Could not change status', 'error');
      }
    });
  });
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
