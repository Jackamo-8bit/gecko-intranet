# Projects Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Projects board to the Gecko Intranet so Jack and Philip can see the state of every live project without a meeting — and land it as the first ES module so the nine existing sections can be extracted one at a time later.

**Architecture:** `index.html` stays the shell and keeps all nine existing sections untouched. New code lives in `src/` as native ES modules loaded with `<script type="module">`. Modules register themselves into `window.GeckoSections`; `navTo` gains two lines to dispatch. `src/core/*.js` are thin re-exports of existing globals, so later extraction changes one file and no consumer. Data is a new `GeckoProjects` SharePoint list read and written through the existing `graphFetch`.

**Tech Stack:** Vanilla ES modules, no build step, no npm, no dependencies. Microsoft Graph v1.0. SharePoint lists. `node:assert/strict` for tests. GitHub Pages serves the repo root; deploy is `git push`.

**Spec:** `docs/superpowers/specs/2026-08-12-projects-board-design.md`

## Global Constraints

- **No bundler, no npm, no `node_modules`, no CI, no framework, no dependencies.** Deploy stays `git push` to `main`.
- **No top-level `window` access in `src/sections/projects.js`.** The test suite imports it under Node, where `window` is undefined. Anything touching `window` must be inside a function body. Registration into `window.GeckoSections` happens in `src/main.js`, never in the section module.
- **Reuse, never re-implement:** `graphFetch`, `resolveSiteId`, `fetchAllLists`, `toast`, `escapeHtml` already exist as globals in `index.html`. Import them via `src/core/*.js`. Do not copy their bodies.
- **Only function declarations are reachable from `src/`.** `index.html`'s code lives in a *classic* `<script>`, where top-level `function` declarations attach to `window` but top-level `const`/`let` do not. So `window.graphFetch` works and `window.CONFIG` is `undefined`. A `src/core/*.js` wrapper may only wrap a function declaration; to reach a `const` (like `CONFIG`), add a function declaration in `index.html` that closes over it and wrap that. This cost a Critical review finding in Task 3 — expect it again when the other nine sections are extracted.
- **Every rendered field passes through `escapeHtml`.** No exceptions.
- **Colours come from existing tokens only** (`--card`, `--hair`, `--muted`, `--faint`, `--ink`, `--on-ink`, `--green`, `--amber`, `--amber-dim`, `--radius`, `--radius-sm`, `--radius-pill`, `--ease`, `--dur-2`, `--font-mono`, `--shadow-sm`). Never a hardcoded hex — a hardcoded `#ffcc33` in the profitability section sat outside the palette and rendered at 1.4:1 for months.
- **Status values, verbatim:** `Quoted`, `Agreed`, `In progress`, `Done`. Case and spacing exactly as written — they are SharePoint Choice values.
- **List name, verbatim:** `GeckoProjects`. Field names verbatim: `Title`, `ClientName`, `Owner`, `Status`, `WaitingOn`, `NextAction`, `AteraRef`, `Notes`.
- **Staleness threshold:** 21 days, and only for `Agreed` and `In progress`.
- **Responsive breakpoint:** 720px, as a container query, matching the existing `@container rtable` transform.
- **No drag-and-drop.** Status changes are a native `<select>`. This is a spec decision, not an oversight.
- **Commit after every task.** Branch is `feat/projects-board`.

## Prerequisite (Jack, manual, before Task 3)

The `GeckoProjects` SharePoint list must exist on
`geckoitservices812.sharepoint.com/sites/GeckoITClientPortal`, with the columns
named exactly as in the spec and no spaces in column names. Tasks 1 and 2 do not
need it. Task 3 onward cannot be verified against real data without it.

## File Structure

| File | Responsibility |
|---|---|
| `src/sections/projects.js` | **Create.** The whole board: pure helpers, state, fetch, render, mutations. Exports `init`, `refresh`, and the pure helpers for testing. |
| `src/core/graph.js` | **Create.** Thin re-exports of `graphFetch`, `resolveSiteId`, `fetchAllLists`. |
| `src/core/ui.js` | **Create.** Thin re-exports of `toast`, `escapeHtml`. |
| `src/main.js` | **Create.** Imports section modules and registers them into `window.GeckoSections`. The only file that touches `window` at top level. |
| `src/styles/projects.css` | **Create.** Section-scoped styles, existing tokens only. |
| `tests/projects-board.mjs` | **Create.** Node tests for the pure helpers. |
| `index.html` | **Modify.** Five small edits: `<link>` + `<script type="module">` in head; sidebar button; `SECTION_TITLES` entry; empty `<section>`; two-line dispatch in `navTo`. |

`projects.js` is one file rather than five because it is roughly 400 lines and every part of it changes together. Splitting it by technical layer (render/data/state) would spread one feature across files that are never edited independently.

---

### Task 1: Pure helpers and their tests

The two pieces of logic that can actually be wrong, built test-first, with no DOM and no network. This task is fully verifiable with `node` and needs neither SharePoint nor a browser.

**Files:**
- Create: `src/sections/projects.js`
- Create: `tests/projects-board.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `STATUSES: string[]`, `STALE_DAYS: number`, `isStale(project: {status: string, modified: string}, now?: Date) => boolean`, `weeksSince(iso: string, now?: Date) => number`, `groupByStatus(projects: Project[]) => Record<string, Project[]>`. Tasks 3–6 rely on these exact names.

- [ ] **Step 1: Write the failing test**

Create `tests/projects-board.mjs`:

```js
import assert from 'node:assert/strict';
import {
  STATUSES,
  STALE_DAYS,
  isStale,
  weeksSince,
  groupByStatus
} from '../src/sections/projects.js';

const NOW = new Date('2026-08-12T12:00:00Z');
const daysAgo = n => new Date(NOW.getTime() - n * 86400000).toISOString();

// — STATUSES —
assert.deepEqual(
  STATUSES,
  ['Quoted', 'Agreed', 'In progress', 'Done'],
  'status values must match the SharePoint Choice column exactly'
);
assert.equal(STALE_DAYS, 21, 'staleness threshold is 21 days');

// — isStale: the 21-day boundary —
assert.equal(
  isStale({ status: 'In progress', modified: daysAgo(20) }, NOW),
  false,
  '20 days is not yet stale'
);
assert.equal(
  isStale({ status: 'In progress', modified: daysAgo(21) }, NOW),
  false,
  'exactly 21 days is not stale — the rule is MORE than 21 days'
);
assert.equal(
  isStale({ status: 'In progress', modified: daysAgo(22) }, NOW),
  true,
  '22 days is stale'
);
assert.equal(
  isStale({ status: 'Agreed', modified: daysAgo(60) }, NOW),
  true,
  'Agreed goes stale like In progress'
);

// — isStale: statuses that never go stale —
assert.equal(
  isStale({ status: 'Quoted', modified: daysAgo(365) }, NOW),
  false,
  'Quoted never goes stale — quotes legitimately sit'
);
assert.equal(
  isStale({ status: 'Done', modified: daysAgo(365) }, NOW),
  false,
  'Done never goes stale'
);

// — isStale: bad input must not throw —
assert.equal(isStale(null, NOW), false, 'null project is not stale');
assert.equal(
  isStale({ status: 'In progress', modified: 'not-a-date' }, NOW),
  false,
  'an unparseable date is not stale rather than throwing'
);
assert.equal(
  isStale({ status: 'In progress', modified: '' }, NOW),
  false,
  'an empty date is not stale'
);

// — weeksSince —
assert.equal(weeksSince(daysAgo(21), NOW), 3, '21 days is 3 whole weeks');
assert.equal(weeksSince(daysAgo(27), NOW), 3, 'weeks are floored, not rounded');
assert.equal(weeksSince('not-a-date', NOW), 0, 'unparseable dates report 0 weeks');

// — groupByStatus —
const grouped = groupByStatus([
  { id: '1', status: 'Quoted' },
  { id: '2', status: 'In progress' },
  { id: '3', status: 'In progress' },
  { id: '4', status: 'Done' }
]);
assert.deepEqual(Object.keys(grouped), STATUSES, 'every column exists, in order');
assert.deepEqual(grouped['In progress'].map(p => p.id), ['2', '3']);
assert.deepEqual(grouped['Agreed'], [], 'empty columns are present, not missing');

// — groupByStatus: nothing may vanish —
const messy = groupByStatus([
  { id: 'a', status: 'Nonsense' },
  { id: 'b', status: '' },
  { id: 'c' }
]);
assert.deepEqual(
  messy['Quoted'].map(p => p.id),
  ['a', 'b', 'c'],
  'unknown, empty and missing statuses fall into Quoted rather than disappearing'
);
assert.equal(
  Object.values(messy).flat().length,
  3,
  'every project lands in exactly one column'
);
assert.deepEqual(groupByStatus(null), groupByStatus([]), 'null input behaves as empty');

console.log('Projects board checks passed.');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node tests/projects-board.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` — cannot find `src/sections/projects.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/sections/projects.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node tests/projects-board.mjs
```

Expected: `Projects board checks passed.`

- [ ] **Step 5: Commit**

```bash
git add src/sections/projects.js tests/projects-board.mjs
git commit -m "feat(projects): pure board helpers, tested under node"
```

---

### Task 2: The module seam

Wire ES modules into the shell and give Projects a nav item and an empty section. After this task, clicking **Projects** shows an empty section with a heading — no data yet. Every later extraction copies this pattern, so it needs to be right.

**Files:**
- Create: `src/core/graph.js`, `src/core/ui.js`, `src/main.js`, `src/styles/projects.css`
- Modify: `index.html` — head (~line 63), sidebar (~line 6156), `SECTION_TITLES` (~line 7365), section markup (~line 6720), `navTo` (~line 7789)

**Interfaces:**
- Consumes: `init` from `src/sections/projects.js` (added in this task).
- Produces: `window.GeckoSections[key] = { init, refresh }` — the registration contract every future section module uses. `src/core/graph.js` exports `graphFetch(path, options?)`, `resolveSiteId()`, `fetchAllLists()`. `src/core/ui.js` exports `toast(message, type?, ms?)`, `escapeHtml(s)`.

- [ ] **Step 1: Create the core re-exports**

These are deliberately trivial. They exist so that the board imports from `core/` rather than reaching for globals, which means the later extraction of `graphFetch` changes one file and no consumer.

Create `src/core/graph.js`:

```js
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
```

Create `src/core/ui.js`:

```js
/** Thin re-exports of the UI helpers still defined in index.html. See core/graph.js. */
export const toast      = (message, type, ms) => window.toast(message, type, ms);
export const escapeHtml = (s) => window.escapeHtml(s);
```

- [ ] **Step 2: Create the registration entry point**

Create `src/main.js`:

```js
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
```

- [ ] **Step 3: Add the `init` and `refresh` stubs the entry point imports**

Append to `src/sections/projects.js`:

```js
// ─── Section lifecycle ────────────────────────────────────────────────

/** Called once, by navTo, on first visit to the section. */
export function init() {
  const mount = document.getElementById('prjBoard');
  if (!mount) return;
  mount.innerHTML = '<p class="prj-empty">Board loading is added in Task 3.</p>';
}

/** Called by the section's Refresh button. Re-fetches and re-renders. */
export function refresh() {
  init();
}
```

- [ ] **Step 4: Create the stylesheet with the section shell styles**

Create `src/styles/projects.css`:

```css
/* ═══ PROJECTS BOARD ═══════════════════════════════════════════════════
   Section-scoped styles for src/sections/projects.js.
   Existing design tokens only — never a hardcoded colour.
   ═══════════════════════════════════════════════════════════════════ */

.prj-wrap {
  container-type: inline-size;
  container-name: prjboard;
}

.prj-empty,
.prj-error {
  padding: 28px 22px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius);
  background: var(--card);
  color: var(--muted);
  text-align: center;
}

.prj-error strong { display: block; color: var(--white); margin-bottom: 6px; }

.prj-error button,
.prj-empty button {
  margin-top: 14px;
  padding: 9px 16px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--on-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--dur-2) var(--ease);
}

.prj-error button:hover,
.prj-empty button:hover { opacity: 0.85; }
```

- [ ] **Step 5: Wire the module and stylesheet into `index.html`**

In `index.html`, immediately after the SheetJS `<script>` tag (~line 63) and before `<style>`, add:

```html
<!-- ═══════════════════════════════════════════════════════════════════
     Module code (src/) — native ES modules, no build step.
     Deferred by definition, so these run after the inline <script> below
     has defined navTo, graphFetch, toast and MSAL setup.
     ═══════════════════════════════════════════════════════════════════ -->
<link rel="stylesheet" href="src/styles/projects.css">
<script type="module" src="src/main.js"></script>
```

- [ ] **Step 6: Add the sidebar nav button**

In `index.html`, in the `Operations` nav group, immediately before the `timesheets` button (~line 6158), add:

```html
      <button class="sb-link" type="button" data-section="projects" onclick="navTo('projects')">
        <span class="ic"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg></span><span class="lbl">Projects</span>
      </button>
```

- [ ] **Step 7: Add the section title**

In `index.html`, in `SECTION_TITLES` (~line 7365), add the `projects` entry between `clients` and `timesheets`:

```js
const SECTION_TITLES = {
  overview:      'OVERVIEW',
  profitability: 'PROFITABILITY',
  'profit-loss': 'PROFIT & LOSS',
  mileage:       'MILEAGE TRACKER',
  clients:       'CLIENT DIRECTORY',
  projects:      'PROJECTS',
  timesheets:    'TIMESHEETS',
  leave:         'ANNUAL LEAVE',
  compliance:    'COMPLIANCE',
  settings:      'SETTINGS'
};
```

- [ ] **Step 8: Add the section markup**

In `index.html`, immediately before the `<!-- ═══ TIMESHEETS SECTION` comment (~line 6712), add:

```html
    <!-- ═══════════════════════════════════════════════════════════════
         PROJECTS SECTION
         — Markup is a mount point only. All rendering lives in
           src/sections/projects.js — see that file's header.
         — Reads/writes the GeckoProjects SharePoint list.
         — Lazy-loaded on first nav via window.GeckoSections (see navTo).
         ═══════════════════════════════════════════════════════════════ -->
    <section class="section" id="section-projects">

      <div class="section-head">
        <h1>Project <span>Board</span></h1>
        <p>Where every live project is up to — quoted through to done.</p>
        <div class="prj-head-actions">
          <button class="prj-refresh" id="prjRefresh" type="button" title="Reload from SharePoint">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            Refresh
          </button>
          <span class="prj-last-sync" id="prjLastSync"></span>
        </div>
      </div>

      <div class="prj-wrap" id="prjBoard">
        <!-- Rendered by src/sections/projects.js -->
      </div>

    </section>

```

- [ ] **Step 9: Add the dispatch to `navTo`**

In `index.html`, in `navTo`, immediately after the `settings` block and before the closing `}` (~line 7789), add:

```js
  // — Module sections (src/sections/*.js) —
  // They register into window.GeckoSections; init() runs once on first
  // visit, matching the lazy-load convention used by the sections above.
  // Re-fetching is a manual act via each section's Refresh button.
  const mod = window.GeckoSections?.[sectionKey];
  if (mod && !mod._started) { mod._started = true; mod.init(); }
```

Note a deliberate deviation from the spec: the spec described `refresh()` being called on later navigations. That would re-fetch SharePoint on every nav, which no other section does. `refresh` is instead bound to the section's Refresh button in Task 3, matching the existing convention.

- [ ] **Step 10: Verify in the browser**

Rebuild the mock preview harness described in the `preview-harness` note (`scratchpad/preview/`: `mock.js` stubs `window.msal` and overrides `graphFetch`; `build.mjs` copies `index.html` and injects the mock; `serve.mjs` is a small Node static server wired into `.claude/launch.json`). The harness is session-scoped and must be rebuilt each session; it must never be committed.

**The harness must copy `src/` alongside `index.html`,** or the module will 404. Confirm `build.mjs` does this.

Then:
1. Open the served page, sign-in stubbed.
2. Click **Projects** in the sidebar.
3. Expected: the section shows, the top bar reads `PROJECTS`, the heading reads "Project Board", and the mount shows "Board loading is added in Task 3."
4. Open the console. Expected: **no errors**, in particular no `Failed to load module script` (wrong MIME type) and no `GeckoSections is not defined`.
5. Click through **Overview, Mileage, Clients, Timesheets, Leave, Compliance, Settings**. Expected: all behave exactly as before. This is the regression check that matters — the module must not have disturbed the existing app.

- [ ] **Step 11: Re-run the unit tests**

```bash
node tests/projects-board.mjs
```

Expected: `Projects board checks passed.` — confirming the added `init`/`refresh` exports did not break Node importability (they must not touch `window` at module scope).

- [ ] **Step 12: Commit**

```bash
git add src/ index.html
git commit -m "feat(projects): module seam, nav entry and empty section"
```

---

### Task 3: Load and count real projects

Fetch from SharePoint and prove the data arrives, with honest failure states. Rendering is Task 4 — this task ends with a count on screen, which is enough to verify the data layer independently.

**Requires:** the `GeckoProjects` list to exist (see Prerequisite).

**Files:**
- Modify: `src/sections/projects.js`

**Interfaces:**
- Consumes: `graphFetch`, `resolveSiteId`, `fetchAllLists` from `src/core/graph.js`; `toast`, `escapeHtml` from `src/core/ui.js`.
- Produces: `Project` shape — `{ id: string, title: string, client: string, owner: string, status: string, waitingOn: string, nextAction: string, ateraRef: string, notes: string, modified: string }`. Tasks 4–6 rely on these exact property names. Module state object `PRJ` with `{ listId, projects, clients, loading, error }`.

- [ ] **Step 1: Add the imports and state**

At the top of `src/sections/projects.js`, immediately below the header comment block and above `// ─── Pure helpers`, add:

```js
import { graphFetch, resolveSiteId, fetchAllLists } from '../core/graph.js';
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
```

- [ ] **Step 2: Add the item mapper and loader**

Append to `src/sections/projects.js`, above the `// ─── Section lifecycle` block:

```js
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
```

`clearListsCache` needs both halves, because `CONFIG` is a `const` and therefore
not on `window` (see Global Constraints). Add to `index.html` beside
`fetchAllLists`:

```js
function clearListsCache() {
  CONFIG._listsCache = null;
}
```

and to `src/core/graph.js`:

```js
export const clearListsCache = () => window.clearListsCache();

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
```

- [ ] **Step 3: Add the render entry point and failure states**

Replace the entire `// ─── Section lifecycle` block at the bottom of `src/sections/projects.js` with:

```js
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
```

- [ ] **Step 4: Verify against the mock harness**

Add `GeckoProjects` to the harness `mock.js` — a list entry in the `/lists?` response and three items in the `/lists/<id>/items` response, using the real field names and a mix of statuses and `Modified` dates (one older than 21 days on `In progress`, one `Quoted` and ancient, one `Done`).

1. Reload, click **Projects**.
2. Expected: "3 project(s) loaded."
3. Temporarily remove `GeckoProjects` from the mock lists response, reload. Expected: the setup message, not a thrown error.
4. Make the mock items request return a 500, reload. Expected: the error panel with a working **Retry** button.
5. Restore the mock. Click **Refresh** in the section head. Expected: it reloads and `prjLastSync` shows a time.

- [ ] **Step 5: Verify against the real tenant**

The board is purely additive — a new nav item and a new section — so it cannot affect the other nine. Verify against real data by pushing the branch and opening the live app, or by registering `http://localhost:8799` as an SPA redirect URI in Entra if local sign-in is preferred.

Expected: the count matches the number of items in the SharePoint list.

- [ ] **Step 6: Commit**

```bash
git add src/sections/projects.js
git commit -m "feat(projects): load from SharePoint with setup and retry states"
```

---

### Task 4: Render the board

Turn the count into the board: four columns on desktop, a grouped list on phones, with cards carrying the staleness badge, waiting chip and Atera link.

**Files:**
- Modify: `src/sections/projects.js`, `src/styles/projects.css`

**Interfaces:**
- Consumes: `groupByStatus`, `isStale`, `weeksSince`, `STATUSES`, the `Project` shape, `PRJ`, `escapeHtml`.
- Produces: `renderCard(project) => string`, `renderColumn(status, projects) => string`. Task 5 attaches a change handler to `select.prj-status` and Task 6 to `[data-prj-open]`, both rendered here.

- [ ] **Step 1: Add `doneOpen` to the state**

In the `PRJ` state object in `src/sections/projects.js`, add:

```js
  doneOpen: false,  // the Done column starts collapsed
```

- [ ] **Step 2: Add the card and column renderers**

In `src/sections/projects.js`, immediately above `function render()`, add:

```js
const ATERA_TICKET_URL = 'https://app.atera.com/new/tickets/';

/**
 * Project ids with a status write in flight. render() rebuilds the whole
 * board, so without this a pending card's select would come back enabled
 * and still showing the old status — letting a second PATCH start for the
 * same item, where whichever response lands last silently wins.
 */
const statusWritesInFlight = new Set();

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
        <select class="prj-status" data-prj-id="${escapeHtml(project.id)}"${statusWritesInFlight.has(project.id) ? ' disabled' : ''}>${options}</select>
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
```

- [ ] **Step 3: Replace the placeholder render**

In `render()`, replace the final line:

```js
  // Task 4 replaces this with the board itself.
  mount.innerHTML = `<p class="prj-empty">${PRJ.projects.length} project(s) loaded.</p>`;
```

with:

```js
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
```

- [ ] **Step 4: Add the board styles**

Append to `src/styles/projects.css`.

**Specificity note:** `src/styles/projects.css` is linked *before* the inline
`<style>` block in `index.html`, so at equal specificity the inline rules win.
The section-head controls are therefore ID-scoped, exactly as the equivalent
controls in all nine existing sections are (`#section-timesheets .tsh-refresh`
and friends). Do not drop the `#section-projects` prefix on those three rules.

```css
/* — Section head controls. ID-scoped to match the existing sections and to
     outrank the inline stylesheet, which is loaded after this file. — */
#section-projects .prj-head-actions {
  display: flex; align-items: center; gap: 10px; margin-top: 6px; flex-wrap: wrap;
}
#section-projects .prj-refresh {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius-pill);
  background: transparent; border: 1px solid var(--border-dim);
  color: var(--muted); font-family: var(--font-body);
  font-size: 12px; cursor: pointer; transition: all .15s;
}
#section-projects .prj-refresh:hover:not(:disabled) { color: var(--green); border-color: var(--green); }
#section-projects .prj-refresh:disabled { opacity: .5; cursor: not-allowed; }
#section-projects .prj-last-sync { font-size: 11px; color: var(--muted); margin-left: auto; }

/* — Board grid: four columns above 720px, one grouped list below.
     A container query, not a media query: what constrains the board is
     its own column, which the sidebar collapse state changes. — */
.prj-board {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr;
}

@container prjboard (min-width: 720px) {
  .prj-board { grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: start; }
}

.prj-col {
  border: 1px solid var(--border-dim);
  border-radius: var(--radius);
  background: var(--card);
  overflow: hidden;
}

.prj-col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--hair);
  position: sticky;
  top: 0;
  background: var(--card);
  z-index: 1;
}

.prj-col.is-collapsed .prj-col-head { border-bottom: 0; }
.prj-col-head h3 { margin: 0; font-size: 0.82rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }

.prj-count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}

.prj-col-toggle {
  border: 0; background: none; padding: 2px 4px;
  color: var(--muted); font: inherit; font-size: 0.78rem;
  cursor: pointer; text-decoration: underline;
}

.prj-col-body { display: flex; flex-direction: column; gap: 1px; background: var(--hair); }
.prj-col-empty { margin: 0; padding: 16px 14px; background: var(--card); color: var(--faint); font-size: 0.85rem; }

/* — Card — */
.prj-card { background: var(--card); padding: 12px 14px 10px; }
.prj-card.is-stale { box-shadow: inset 3px 0 0 var(--amber); }

.prj-card-open {
  display: block; width: 100%; text-align: left;
  border: 0; background: none; padding: 0; margin: 0;
  font: inherit; color: inherit; cursor: pointer;
  border-radius: var(--radius-sm);
  transition: opacity var(--dur-2) var(--ease);
}
.prj-card-open:hover { opacity: 0.78; }
.prj-card-open h4 { margin: 0 0 4px; font-size: 0.94rem; font-weight: 600; color: var(--white); }
.prj-next { margin: 0 0 8px; font-size: 0.84rem; color: var(--muted); line-height: 1.4; }

.prj-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }

.prj-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 0.72rem;
  line-height: 1.5;
  max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.prj-chip-wait  { background: var(--blue-dim);  color: var(--blue); }
.prj-chip-stale { background: var(--amber-dim); color: var(--amber); font-family: var(--font-mono); }

.prj-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.76rem; color: var(--faint); }
.prj-atera { color: var(--green); text-decoration: none; font-family: var(--font-mono); }
.prj-atera:hover { text-decoration: underline; }

/* — Status select — */
.prj-status-wrap { display: block; margin-top: 10px; }
.prj-status {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-sm);
  background: var(--inset);
  color: var(--white);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}
.prj-status:disabled { opacity: 0.5; cursor: progress; }

/* General utility — the portal has no shared one yet. Move it to a shared
   stylesheet the first time a second section needs it, rather than copying. */
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
```

- [ ] **Step 5: Verify**

With the mock harness:
1. Click **Projects**. Expected: four columns on a desktop-width window, headed Quoted / Agreed / In progress / Done with counts.
2. The `In progress` item older than 21 days shows an amber "No movement Nw" badge and an amber left edge. The ancient `Quoted` item shows **no** badge.
3. The `Done` column shows its count and a **Show** button, with no cards. Clicking **Show** reveals them and the button reads **Hide**.
4. An item with `WaitingOn` set shows a blue "Waiting · …" chip.
5. An item with `AteraRef` shows a `#131` link; clicking it opens Atera in a new tab and does **not** open the card. Confirm in DevTools that no `<a>` is nested inside the `.prj-card-open` button.
6. Narrow the window below 720px (or collapse the sidebar). Expected: the board becomes a single stacked list with sticky column headings.
7. Set a mock project's title to `<img src=x onerror=alert(1)>`. Expected: it renders as literal text, no alert.
8. Check both themes via `document.documentElement.setAttribute('data-theme','light')` and `'dark'`.

- [ ] **Step 6: Commit**

```bash
git add src/sections/projects.js src/styles/projects.css
git commit -m "feat(projects): render the board, staleness badge and waiting chip"
```

---

### Task 5: Change status from the card

The status `<select>` writes straight to SharePoint. No optimistic update, so there is nothing to roll back when a write fails.

**Files:**
- Modify: `src/sections/projects.js`

**Interfaces:**
- Consumes: `PRJ`, `graphFetch`, `resolveSiteId`, `resolveListId`, `toast`, `render`.
- Produces: `patchFields(id, fields) => Promise<void>` — reused by Task 6 for the edit modal.

- [ ] **Step 1: Add the write helper**

In `src/sections/projects.js`, immediately below `fetchClientNames`, add:

```js
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
```

- [ ] **Step 2: Wire the select**

In `render()`, immediately after the `data-prj-toggle-done` listener, add:

```js
  mount.querySelectorAll('.prj-status').forEach(select => {
    select.addEventListener('change', async (event) => {
      const el      = event.currentTarget;
      const id      = el.dataset.prjId;
      const status  = el.value;
      const project = PRJ.projects.find(p => p.id === id);
      if (!project) return;
      if (statusWritesInFlight.has(id)) return;
      const previous = project.status;

      statusWritesInFlight.add(id);
      el.disabled = true;
      let written = false;
      try {
        await patchFields(id, { Status: status });
        // Modified moves too, so the staleness badge stays honest.
        project.status   = status;
        project.modified = new Date().toISOString();
        written = true;
      } catch (err) {
        // No optimistic update, so the card simply stays where it was.
        el.value    = previous;
        el.disabled = false;
        toast(err.message || 'Could not change status', 'error');
      } finally {
        statusWritesInFlight.delete(id);
      }
      // Ordering matters: the id leaves the set before render(), so the
      // freshly rendered select comes back enabled.
      if (written) {
        toast(`Moved to ${status}`, 'success');
        render();
      }
    });
  });
```

- [ ] **Step 3: Verify**

With the mock harness (its `graphFetch` override must handle `PATCH` and echo success):
1. Change a card's status from `Quoted` to `In progress`. Expected: a success toast and the card moves column on re-render.
2. A card moved to `Agreed` whose `Modified` was ancient loses its staleness badge, because the write refreshed `modified`.
3. Make the mock reject `PATCH`. Change a status. Expected: an error toast, the select snaps back to its previous value, and the card does not move.
4. Keyboard only: tab to a select, change with the arrow keys, confirm it commits.

Then repeat step 1 against the real tenant and confirm the value changed in the SharePoint list.

- [ ] **Step 4: Commit**

```bash
git add src/sections/projects.js
git commit -m "feat(projects): change status from the card"
```

---

### Task 6: Add, edit and delete

The modal, following the existing `cliModal` pattern. This completes the board.

**Files:**
- Modify: `src/sections/projects.js`, `src/styles/projects.css`, `index.html` (section markup only)

**Interfaces:**
- Consumes: `PRJ`, `patchFields`, `resolveSiteId`, `resolveListId`, `graphFetch`, `toast`, `escapeHtml`, `STATUSES`, `load`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the modal markup and an Add button**

In `index.html`, inside `<section id="section-projects">`, replace the `prj-head-actions` div and add the modal after the `prjBoard` div:

```html
        <div class="prj-head-actions">
          <button class="prj-add" id="prjAdd" type="button">+ New project</button>
          <button class="prj-refresh" id="prjRefresh" type="button" title="Reload from SharePoint">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            Refresh
          </button>
          <span class="prj-last-sync" id="prjLastSync"></span>
        </div>
```

and after `<div class="prj-wrap" id="prjBoard"></div>`:

```html
      <div class="prj-backdrop" id="prjBackdrop" hidden>
        <div class="prj-modal" role="dialog" aria-modal="true" aria-labelledby="prjModalTitle">
          <h3 id="prjModalTitle">—</h3>
          <div id="prjModalBody"></div>
        </div>
      </div>
```

- [ ] **Step 2: Add the modal renderer and handlers**

Append to `src/sections/projects.js`, above `// ─── Section lifecycle`:

```js
// ─── Modal ────────────────────────────────────────────────────────────

let editingId = null;   // null = creating

function closeModal() {
  editingId = null;
  document.getElementById('prjBackdrop')?.setAttribute('hidden', '');
}

function openModal(id) {
  const backdrop = document.getElementById('prjBackdrop');
  const body     = document.getElementById('prjModalBody');
  const title    = document.getElementById('prjModalTitle');
  if (!backdrop || !body || !title) return;

  const project = id === 'new' ? null : PRJ.projects.find(p => p.id === id);
  editingId = project ? project.id : null;
  title.textContent = project ? 'Edit project' : 'New project';

  const value = key => escapeHtml(project ? project[key] : '');
  const clientOptions = ['', ...PRJ.clients].map(name =>
    `<option value="${escapeHtml(name)}"${project && project.client === name ? ' selected' : ''}>${escapeHtml(name || '— none —')}</option>`
  ).join('');
  const ownerOptions = ['', 'Jack', 'Philip'].map(name =>
    `<option value="${escapeHtml(name)}"${project && project.owner === name ? ' selected' : ''}>${escapeHtml(name || '— none —')}</option>`
  ).join('');
  const statusOptions = STATUSES.map(s =>
    `<option value="${escapeHtml(s)}"${project && project.status === s ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  body.innerHTML = `
    <form id="prjForm" class="prj-form">
      <label>Project name<input name="Title" required value="${value('title')}"></label>
      <label>Client<select name="ClientName">${clientOptions}</select></label>
      <label>Owner<select name="Owner">${ownerOptions}</select></label>
      <label>Status<select name="Status">${statusOptions}</select></label>
      <label>Next action<input name="NextAction" value="${value('nextAction')}"
        placeholder="e.g. waiting for the DNS change to propagate"></label>
      <label>Waiting on<input name="WaitingOn" value="${value('waitingOn')}"
        placeholder="Leave empty if not blocked"></label>
      <label>Atera ticket<input name="AteraRef" value="${value('ateraRef')}" placeholder="131"></label>
      <label>Notes<textarea name="Notes" rows="4">${value('notes')}</textarea></label>
      <div class="prj-form-actions">
        ${project ? '<button type="button" class="prj-danger" id="prjDelete">Delete</button>' : ''}
        <button type="button" id="prjCancel">Cancel</button>
        <button type="submit" class="prj-primary">${project ? 'Save' : 'Create'}</button>
      </div>
    </form>`;

  backdrop.removeAttribute('hidden');
  body.querySelector('input[name="Title"]')?.focus();

  document.getElementById('prjCancel')?.addEventListener('click', closeModal);
  document.getElementById('prjDelete')?.addEventListener('click', () => deleteProject(editingId));
  document.getElementById('prjForm')?.addEventListener('submit', submitModal);
}

async function submitModal(event) {
  event.preventDefault();
  const form   = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const fields = Object.fromEntries(
    ['Title', 'ClientName', 'Owner', 'Status', 'NextAction', 'WaitingOn', 'AteraRef', 'Notes']
      .map(key => [key, form.elements[key].value.trim()])
  );
  if (!fields.Title) { toast('A project name is required', 'error'); return; }

  submit.disabled = true;
  try {
    if (editingId) {
      await patchFields(editingId, fields);
      toast('Project saved', 'success');
    } else {
      const siteId = await resolveSiteId();
      const listId = await resolveListId();
      await graphFetch(`/sites/${siteId}/lists/${listId}/items`, {
        method: 'POST',
        body:   JSON.stringify({ fields })
      });
      toast('Project created', 'success');
    }
    closeModal();
    await load();
  } catch (err) {
    submit.disabled = false;
    toast(err.message || 'Could not save', 'error');
  }
}

async function deleteProject(id) {
  const project = PRJ.projects.find(p => p.id === id);
  if (!project) return;
  if (!window.confirm(`Delete "${project.title}"? This cannot be undone.`)) return;
  try {
    const siteId = await resolveSiteId();
    const listId = await resolveListId();
    await graphFetch(`/sites/${siteId}/lists/${listId}/items/${id}`, { method: 'DELETE' });
    toast('Project deleted', 'success');
    closeModal();
    await load();
  } catch (err) {
    toast(err.message || 'Could not delete', 'error');
  }
}
```

- [ ] **Step 3: Wire the open handlers**

In `render()`, after the `.prj-status` loop, add:

```js
  mount.querySelectorAll('[data-prj-open]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.prjOpen));
  });
```

And in `init()`, replace the body with:

```js
export function init() {
  document.getElementById('prjRefresh')?.addEventListener('click', refresh);
  document.getElementById('prjAdd')?.addEventListener('click', () => openModal('new'));
  document.getElementById('prjBackdrop')?.addEventListener('click', (event) => {
    if (event.target.id === 'prjBackdrop') closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.getElementById('prjBackdrop')?.hasAttribute('hidden')) {
      closeModal();
    }
  });
  load();
}
```

- [ ] **Step 4: Add the modal styles**

Append to `src/styles/projects.css`:

```css
/* — Add button — */
.prj-add {
  padding: 7px 14px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--on-ink);
  font: inherit; font-size: 0.82rem; font-weight: 600;
  cursor: pointer;
  transition: opacity var(--dur-2) var(--ease);
}
.prj-add:hover { opacity: 0.85; }

/* — Modal — */
.prj-backdrop {
  position: fixed; inset: 0;
  z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.55);
  overflow-y: auto;
}
.prj-backdrop[hidden] { display: none; }

.prj-modal {
  width: min(520px, 100%);
  padding: 22px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: var(--shadow-lg);
}
.prj-modal h3 { margin: 0 0 16px; font-size: 1.05rem; color: var(--white); }

.prj-form { display: flex; flex-direction: column; gap: 12px; }
.prj-form label {
  display: flex; flex-direction: column; gap: 5px;
  font-size: 0.78rem; color: var(--muted);
}
.prj-form input,
.prj-form select,
.prj-form textarea {
  padding: 9px 11px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-sm);
  background: var(--inset);
  color: var(--white);
  font: inherit; font-size: 0.88rem;
}
.prj-form textarea { resize: vertical; }

.prj-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
.prj-form-actions button {
  padding: 8px 16px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-pill);
  background: none; color: var(--muted);
  font: inherit; font-size: 0.84rem; cursor: pointer;
}
.prj-form-actions .prj-primary { border-color: transparent; background: var(--ink); color: var(--on-ink); font-weight: 600; }
.prj-form-actions .prj-danger  { margin-right: auto; color: var(--red); border-color: var(--red-dim); }
.prj-form-actions button:disabled { opacity: 0.5; cursor: progress; }
```

- [ ] **Step 5: Verify**

With the mock harness (its `graphFetch` override must handle `POST` and `DELETE`):
1. **+ New project** opens the modal with an empty form and focus in the name field.
2. Submitting with an empty name toasts an error and does not write.
3. Creating a project closes the modal, reloads, and the card appears in its column.
4. Clicking a card opens it populated; changing the next action and saving updates the card.
5. **Delete** prompts for confirmation; cancelling does nothing, confirming removes the card.
6. **Escape** and a backdrop click both close the modal. Clicking inside it does not.
7. Make the mock reject `POST`. Expected: an error toast, the modal stays open, the submit button re-enables.
8. On a 375px-wide viewport the modal fits and scrolls.

Then repeat 3–5 against the real tenant and confirm the SharePoint list matches.

- [ ] **Step 6: Run the full check**

```bash
node tests/projects-board.mjs && node tests/portal-accessibility-smoke.mjs && node tests/mileage-rate-effective-date.mjs
```

Expected: all three pass. The accessibility smoke test covers the whole page, so it is the regression check that the new markup did not break anything.

- [ ] **Step 7: Commit**

```bash
git add src/ index.html
git commit -m "feat(projects): add, edit and delete projects"
```

---

## Final verification before merge

- [ ] All three test files pass.
- [ ] All nine existing sections behave exactly as before — click every one.
- [ ] The board works on a real iPhone against the real tenant.
- [ ] Both themes checked.
- [ ] No mock harness files are staged (`git status` — `scratchpad/` and `.claude/` must not appear).
- [ ] `docs/GECKO_INTRANET_PORTAL_BLUEPRINT.md` updated: add Projects to the tool table, and note that `src/` now exists and new sections go there.

## Self-review notes

Checked against the spec: architecture and the module seam (Task 2), the full field list and list creation (Prerequisite + Task 3), all four columns and the grouped-list breakpoint (Task 4), staleness at 21 days with the status exclusions (Tasks 1 and 4), `WaitingOn` as flag-plus-reason (Task 4), the Atera link (Task 4), the `<select>` rather than drag-and-drop (Task 5), Done collapsed (Task 4), every failure state in the spec's table (Task 3), last-write-wins with its `ponytail:` comment (Task 5), escaping throughout, and both pure-function tests (Task 1).

One deliberate deviation, flagged in Task 2 Step 9: `navTo` calls `init()` only, not `refresh()` on later navigations, to match the caching convention every other section already uses. `refresh` is bound to the Refresh button instead.
