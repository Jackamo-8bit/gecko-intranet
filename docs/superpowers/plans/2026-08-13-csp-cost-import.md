# CSP Cost Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import `Seller Cost (GBP)` from a TD SYNNEX StreamOne Ion CSP billing export and overwrite `CostPerMonth` on each client's `m365` service row, after showing every change for review.

**Architecture:** Pure logic lives in `src/core/csp-costs.js`, registered on `window` by `src/main.js` (because `index.html` is a classic script and cannot `import`) and imported directly by `tests/csp-costs.mjs` under Node. The UI and Graph writes stay inline in the Profitability section of `index.html`, reusing `prfParseCsv`, `prfXeroMatchName`, `prfPatchService` and `PRF` state.

**Tech Stack:** Vanilla ES modules, no build step, no npm, no dependencies. Microsoft Graph v1.0. SharePoint lists. `node:assert/strict` for tests. Deploy is `git push`.

**Spec:** `docs/superpowers/specs/2026-08-13-csp-cost-import-design.md`

## Global Constraints

- **No bundler, no npm, no `node_modules`, no CI, no framework, no dependencies.** Deploy stays `git push`.
- **No top-level `window` access in `src/core/csp-costs.js`.** `tests/csp-costs.mjs` imports it under Node where `window` is undefined. Registration onto `window` happens in `src/main.js` only.
- **Only function declarations in `index.html` are reachable from `src/`.** `index.html` is a classic script: top-level `function` attaches to `window`, top-level `const`/`let` does not. So `PRF`, `CONFIG`, `prfFmt` and `prfFmtForce` are **not** on `window` — but all the new UI code in this plan lives in that same classic script, so it reaches them by ordinary lexical scope. Only `src/core/csp-costs.js` is on the far side of the boundary, and it needs nothing from `index.html`.
- **Only `Seller Cost (GBP)` is used.** `Customer Cost (GBP)` and `Margin (GBP)` are TD SYNNEX's price book (a flat ×1.191 markup), not Gecko's pricing. Never read them.
- **Nothing is written to SharePoint without being shown in the preview first.**
- **A service row is pre-ticked only if its title is exactly `M365 Reselling`** (case-insensitive, trimmed). Everything else arrives unticked — `M365 + Exclaimer` bundles a non-CSP cost that must not be silently dropped.
- **Service rows are never created.** Clients with no `m365` row, or more than one, are listed and skipped.
- **Sanity-check threshold: 70%.** Incoming total below 70% of the baseline shows a warning and disables Apply until an explicit confirmation checkbox is ticked. Never a hard block.
- **`localStorage` key, verbatim:** `gecko.csp.lastImport.v1`, holding `{ month, total }`.
- **Every rendered value passes through `escapeHtml`.** CSV content is untrusted input.
- **Colours come from existing tokens only** (`--card`, `--hair`, `--border-dim`, `--muted`, `--faint`, `--white`, `--ink`, `--on-ink`, `--green`, `--amber`, `--amber-dim`, `--red`, `--red-dim`, `--radius`, `--radius-sm`, `--radius-pill`, `--font-mono`, `--ease`, `--dur-2`). Never a hardcoded hex.
- **Commit after every task.** Branch is `feat/csp-cost-import`.

## Existing helpers to reuse — do not reimplement

| Helper | Signature / shape |
|---|---|
| `prfParseCsv(text)` | → array of row objects keyed by header |
| `prfXeroMatchName(name, clients)` | → client object or `null`; exact → starts-with → Levenshtein ≤3 |
| `prfXeroNormaliseName(name)` | → normalised string |
| `prfPatchService(id, patch)` | `PATCH` on a `GeckoServices` item's fields |
| `prfRenderAll()` | rebuilds `#prfWrap` |
| `prfFmt(n)` | → currency string, but **renders `0` as `'—'`** |
| `prfFmtForce(n)` | → currency string that shows `£0.00`. **Use this in money columns** — an em dash there reads as "no data", not "zero". |
| `prfRefreshData()` | reloads clients + services from SharePoint |
| `escapeHtml`, `jsAttr`, `toast`, `showLoading` | shared utilities |
| `PRF.clients[]` | `{ id, name, status, contractStart, notes, xeroHistory }` |
| `PRF.services[]` | `{ id, clientName, name, category, cost, sell, notes }` |

## File Structure

| File | Responsibility |
|---|---|
| `src/core/csp-costs.js` | **Create.** Pure functions only: `stripContact`, `aggregateByCustomer`, `findM365Row`, `isPreTicked`, `checkTotalPlausible`. No DOM, no network, no `window` at module scope. |
| `tests/csp-costs.mjs` | **Create.** Node tests for all five. |
| `src/main.js` | **Modify.** Two lines registering `window.CspCosts`. |
| `index.html` | **Modify.** `CSP` state on `PRF`, the import card renderer, drop/parse/preview/apply handlers, and CSS. All inside the Profitability module's existing comment block. |

---

### Task 1: Pure logic and its tests

Every decision about which number lands on which client, built test-first. No DOM, no network — fully verifiable with `node`.

**Files:**
- Create: `src/core/csp-costs.js`
- Create: `tests/csp-costs.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces, and Tasks 2–4 depend on these exact names:
  - `stripContact(name: string) => string`
  - `aggregateByCustomer(rows: object[]) => {customer: string, cost: number}[]`
  - `findM365Row(clientName: string, services: object[]) => {row: object} | {none: true} | {ambiguous: number}`
  - `isPreTicked(serviceTitle: string) => boolean`
  - `checkTotalPlausible(incoming: number, baseline: number|null) => {ok: true} | {ok: false, ratio: number}`
  - `PURE_TICK_TITLE` (the exact string `'M365 Reselling'`), `PLAUSIBLE_MIN_RATIO` (`0.7`)

- [ ] **Step 1: Write the failing test**

Create `tests/csp-costs.mjs`:

```js
import assert from 'node:assert/strict';
import {
  stripContact,
  aggregateByCustomer,
  findM365Row,
  isPreTicked,
  checkTotalPlausible,
  PURE_TICK_TITLE,
  PLAUSIBLE_MIN_RATIO
} from '../src/core/csp-costs.js';

// ─── constants ────────────────────────────────────────────────────────
assert.equal(PURE_TICK_TITLE, 'M365 Reselling');
assert.equal(PLAUSIBLE_MIN_RATIO, 0.7);

// ─── stripContact ─────────────────────────────────────────────────────
assert.equal(
  stripContact('CDA Ltd (Simon Dymott)'),
  'CDA Ltd',
  'a trailing contact parenthetical is removed'
);
assert.equal(
  stripContact('Onsite Services Southern Ltd  (Luke Ashton)'),
  'Onsite Services Southern Ltd',
  'the double space before the parenthetical is not left behind'
);
assert.equal(
  stripContact('Freeston Water Treatment'),
  'Freeston Water Treatment',
  'a name with no parenthetical is unchanged'
);
assert.equal(
  stripContact('Acme (UK) Holdings'),
  'Acme (UK) Holdings',
  'an interior parenthetical is NOT stripped — only a trailing one'
);
assert.equal(stripContact(''), '', 'empty input is safe');
assert.equal(stripContact(null), '', 'null input is safe');

// ─── aggregateByCustomer ──────────────────────────────────────────────
const rows = [
  { 'Customer Name': 'Cowan Consultancy (Tim Button)', 'Seller Cost (GBP)': '236.98656799999998' },
  { 'Customer Name': 'Cowan Consultancy (Tim Button)', 'Seller Cost (GBP)': '43.768168' },
  { 'Customer Name': 'Cowan Consultancy (Tim Button)', 'Seller Cost (GBP)': '4.053386' },
  { 'Customer Name': 'MSA Safety (Alison Clover Kinna)', 'Seller Cost (GBP)': '0' },
  { 'Customer Name': 'MSA Safety (Alison Clover Kinna)', 'Seller Cost (GBP)': '66.38' }
];
const agg = aggregateByCustomer(rows);
assert.deepEqual(
  agg.find(a => a.customer === 'Cowan Consultancy (Tim Button)'),
  { customer: 'Cowan Consultancy (Tim Button)', cost: 284.81 },
  'multiple subscriptions for one client sum, rounded to 2dp'
);
assert.deepEqual(
  agg.find(a => a.customer === 'MSA Safety (Alison Clover Kinna)'),
  { customer: 'MSA Safety (Alison Clover Kinna)', cost: 66.38 },
  'a zero-cost row does not break the sum'
);
assert.equal(agg.length, 2, 'one entry per distinct customer');

assert.deepEqual(
  aggregateByCustomer([
    { 'Customer Name': '', 'Seller Cost (GBP)': '10' },
    { 'Customer Name': '   ', 'Seller Cost (GBP)': '10' },
    { 'Seller Cost (GBP)': '10' }
  ]),
  [],
  'rows with no customer name are skipped, not turned into a phantom entry'
);
assert.deepEqual(
  aggregateByCustomer([{ 'Customer Name': 'X', 'Seller Cost (GBP)': 'not-a-number' }]),
  [{ customer: 'X', cost: 0 }],
  'an unparseable cost counts as zero rather than NaN'
);
assert.deepEqual(aggregateByCustomer([]), [], 'no rows gives no entries');
assert.deepEqual(aggregateByCustomer(null), [], 'null input is safe');

// ─── isPreTicked ──────────────────────────────────────────────────────
assert.equal(isPreTicked('M365 Reselling'), true);
assert.equal(isPreTicked('m365 reselling'), true, 'case-insensitive');
assert.equal(isPreTicked('  M365 Reselling  '), true, 'trimmed');
assert.equal(
  isPreTicked('M365 + Exclaimer'),
  false,
  'a bundle must never be pre-ticked — it carries a non-CSP cost'
);
assert.equal(isPreTicked('M365 Reselling + Exclaimer'), false, 'only an exact match counts');
assert.equal(isPreTicked(''), false);
assert.equal(isPreTicked(null), false);

// ─── findM365Row ──────────────────────────────────────────────────────
const services = [
  { id: '1', clientName: 'CDA Ltd', category: 'm365', name: 'M365 Reselling' },
  { id: '2', clientName: 'CDA Ltd', category: 'stack', name: 'Internet Security' },
  { id: '3', clientName: 'Daron Motors', category: 'm365', name: 'M365 + Exclaimer' },
  { id: '4', clientName: 'Twin Ltd', category: 'm365', name: 'M365 Reselling' },
  { id: '5', clientName: 'Twin Ltd', category: 'm365', name: 'M365 Extra' }
];
assert.deepEqual(
  findM365Row('CDA Ltd', services),
  { row: services[0] },
  'exactly one m365 row is the update target'
);
assert.deepEqual(
  findM365Row('Haus Coast', services),
  { none: true },
  'a client with no m365 row reports none — a row is never invented'
);
assert.deepEqual(
  findM365Row('Twin Ltd', services),
  { ambiguous: 2 },
  'two m365 rows are ambiguous — the target is never guessed'
);
assert.deepEqual(findM365Row('CDA Ltd', []), { none: true }, 'no services at all is safe');
assert.deepEqual(findM365Row('', services), { none: true }, 'a blank client name matches nothing');

// ─── checkTotalPlausible ──────────────────────────────────────────────
assert.deepEqual(
  checkTotalPlausible(710, 1000),
  { ok: true },
  '71% of baseline is within tolerance'
);
assert.deepEqual(
  checkTotalPlausible(700, 1000),
  { ok: true },
  'exactly 70% passes — the rule is BELOW 70%'
);
assert.deepEqual(
  checkTotalPlausible(690, 1000),
  { ok: false, ratio: 0.69 },
  '69% trips the check and reports the ratio'
);
assert.deepEqual(
  checkTotalPlausible(1721.07, 3940.12).ok,
  false,
  'the real part-month case (44%) trips'
);
assert.deepEqual(checkTotalPlausible(2000, 1000), { ok: true }, 'a larger total never warns');
assert.deepEqual(checkTotalPlausible(1000, 1000), { ok: true }, 'an equal total passes');
assert.deepEqual(
  checkTotalPlausible(500, null),
  { ok: true },
  'no baseline cannot warn — first run must not cry wolf'
);
assert.deepEqual(
  checkTotalPlausible(500, 0),
  { ok: true },
  'a zero baseline returns ok rather than dividing by zero'
);

console.log('CSP cost import checks passed.');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node tests/csp-costs.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` — cannot find `src/core/csp-costs.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/csp-costs.js`:

```js
/* ╔═══════════════════════════════════════════════════════════════════╗
   ║   CSP COST IMPORT — pure logic                                    ║
   ║                                                                   ║
   ║   Decides which number from a TD SYNNEX StreamOne Ion CSP         ║
   ║   billing export lands on which GeckoServices row. Split out of   ║
   ║   index.html so it can be unit-tested: this writes money.         ║
   ║                                                                   ║
   ║   NOTE: no top-level `window` access. tests/csp-costs.mjs imports ║
   ║   this under Node. Registration onto window lives in src/main.js. ║
   ╚═══════════════════════════════════════════════════════════════════╝ */

/** The only service title safe to overwrite without a deliberate tick. */
export const PURE_TICK_TITLE = 'M365 Reselling';

/** Below this share of the baseline, an import is probably a part-month. */
export const PLAUSIBLE_MIN_RATIO = 0.7;

/** The one CSV column that is a real fact. See the spec on Customer Cost. */
const COST_COLUMN = 'Seller Cost (GBP)';
const NAME_COLUMN = 'Customer Name';

/**
 * "CDA Ltd (Simon Dymott)" → "CDA Ltd".
 * Only a TRAILING parenthetical is removed — "Acme (UK) Holdings" keeps its.
 */
export function stripContact(name) {
  if (!name) return '';
  return String(name).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Sum Seller Cost per customer. One client has many subscription rows.
 * Rows without a customer name are skipped rather than pooled together.
 */
export function aggregateByCustomer(rows) {
  const totals = new Map();
  for (const row of rows || []) {
    const customer = String(row?.[NAME_COLUMN] ?? '').trim();
    if (!customer) continue;
    const cost = Number.parseFloat(row?.[COST_COLUMN]);
    totals.set(customer, (totals.get(customer) || 0) + (Number.isFinite(cost) ? cost : 0));
  }
  return [...totals].map(([customer, cost]) => ({
    customer,
    cost: Math.round(cost * 100) / 100
  }));
}

/**
 * Find the client's single m365 service row.
 * Never invents a row and never guesses between two — both are reported
 * so a human decides.
 */
export function findM365Row(clientName, services) {
  if (!clientName) return { none: true };
  const matches = (services || []).filter(
    s => s?.clientName === clientName && s?.category === 'm365'
  );
  if (matches.length === 0) return { none: true };
  if (matches.length > 1) return { ambiguous: matches.length };
  return { row: matches[0] };
}

/**
 * Only a row titled exactly "M365 Reselling" is pre-ticked. Bundles like
 * "M365 + Exclaimer" carry costs this export does not contain, so
 * overwriting them would delete the non-CSP part and inflate the margin.
 */
export function isPreTicked(serviceTitle) {
  return String(serviceTitle ?? '').trim().toLowerCase() === PURE_TICK_TITLE.toLowerCase();
}

/**
 * The CSV carries no date range, so a month-to-date export is
 * indistinguishable from a full month by inspection. This compares the
 * total against a baseline instead. Advisory only — never a hard block.
 */
export function checkTotalPlausible(incoming, baseline) {
  if (!baseline || baseline <= 0) return { ok: true };
  const ratio = incoming / baseline;
  if (ratio >= PLAUSIBLE_MIN_RATIO) return { ok: true };
  return { ok: false, ratio: Math.round(ratio * 100) / 100 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node tests/csp-costs.mjs
```

Expected: `CSP cost import checks passed.`

- [ ] **Step 5: Commit**

```bash
git add src/core/csp-costs.js tests/csp-costs.mjs
git commit -m "feat(csp): pure cost-import logic, tested under node"
```

---

### Task 2: The import card, parse and preview

Register the module, add the card beside the Xero import, and render a read-only preview of what an import would do. Nothing writes to SharePoint in this task.

**Files:**
- Modify: `src/main.js`
- Modify: `index.html` — `PRF` state, `prfRenderAll`, new renderer + handlers, CSS

**Interfaces:**
- Consumes: everything from Task 1 via `window.CspCosts`; `prfParseCsv`, `prfXeroMatchName`, `prfFmt`, `escapeHtml`, `toast`, `showLoading`, `PRF.clients`, `PRF.services`.
- Produces: `PRF.csp` state `{ imported, month, rows, unmatched, total, warning, confirmed }` where each entry in `rows` is `{ csvName, client, service, oldCost, newCost, ticked, status }` and `status` is one of `'ok' | 'none' | 'ambiguous'`. Tasks 3–4 rely on these names.

- [ ] **Step 1: Register the module on `window`**

In `src/main.js`, add below the existing projects registration:

```js
import * as cspCosts from './core/csp-costs.js';

// Pure logic used by the Profitability section, which still lives in
// index.html's classic script and therefore cannot import modules itself.
window.CspCosts = cspCosts;
```

- [ ] **Step 2: Add `csp` state to `PRF`**

In `index.html`, inside the `const PRF = { ... }` object, add:

```js
  // CSP cost import (2026-08-13)
  csp: {
    imported:  false,   // a file has been parsed this session
    month:     '',      // 'YYYY-MM' the user confirmed the export covers
    rows:      [],      // [{ csvName, client, service, oldCost, newCost, ticked, status }]
    unmatched: [],      // [{ csvName, cost }]
    total:     0,       // sum of Seller Cost across the whole file
    warning:   null,    // null | { ratio, baseline }
    confirmed: false,   // user ticked "I've checked this is a full month"
    applying:  false    // an apply is in flight; keeps Apply disabled regardless of ticks
  },
```

- [ ] **Step 3: Add the parse-and-match handlers**

In `index.html`, immediately after `prfRenderUnmatchedList()`, add:

```js
// ─── CSP cost import (2026-08-13) ─────────────────────────────────────
// Reads Seller Cost from a TD SYNNEX StreamOne Ion CSP billing export and
// overwrites CostPerMonth on each client's m365 row. Pure logic lives in
// src/core/csp-costs.js so it can be unit-tested — this writes money.

const CSP_LAST_IMPORT_KEY = 'gecko.csp.lastImport.v1';

/** Default the month selector to last month. */
function cspDefaultMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function cspHandleDrop(event) {
  const file = event.dataTransfer?.files?.[0];
  if (file) cspImportFile(file);
}

function cspHandleFileInput(input) {
  const file = input.files?.[0];
  if (file) cspImportFile(file);
}

/**
 * Parse the export, match every customer to a client and an m365 row, and
 * render the preview. Writes nothing — Apply does that.
 */
async function cspImportFile(file) {
  if (!file) return;
  showLoading(true);
  try {
    const rows = prfParseCsv(await file.text());
    if (!rows.length) {
      toast('That CSV has no data rows.', 'error', 4000);
      return;
    }
    if (!('Customer Name' in rows[0]) || !('Seller Cost (GBP)' in rows[0])) {
      toast('Missing Customer Name / Seller Cost (GBP). Is this the Microsoft CSP Billing Customers Report?', 'error', 6000);
      return;
    }

    const aggregated = window.CspCosts.aggregateByCustomer(rows);
    const previewRows = [];
    const unmatched   = [];

    for (const { customer, cost } of aggregated) {
      const client = prfXeroMatchName(window.CspCosts.stripContact(customer), PRF.clients);
      if (!client) { unmatched.push({ csvName: customer, cost }); continue; }

      const found = window.CspCosts.findM365Row(client.name, PRF.services);
      if (found.none) {
        previewRows.push({ csvName: customer, client, service: null, oldCost: null, newCost: cost, ticked: false, status: 'none' });
      } else if (found.ambiguous) {
        previewRows.push({ csvName: customer, client, service: null, oldCost: null, newCost: cost, ticked: false, status: 'ambiguous' });
      } else {
        previewRows.push({
          csvName: customer,
          client,
          service: found.row,
          oldCost: found.row.cost,
          newCost: cost,
          ticked:  window.CspCosts.isPreTicked(found.row.name),
          status:  'ok'
        });
      }
    }

    PRF.csp.rows      = previewRows.sort((a, b) => a.client.name.localeCompare(b.client.name));
    PRF.csp.unmatched = unmatched;
    PRF.csp.total     = aggregated.reduce((sum, a) => sum + a.cost, 0);
    PRF.csp.imported  = true;
    PRF.csp.confirmed = false;
    if (!PRF.csp.month) PRF.csp.month = cspDefaultMonth();
    PRF.csp.warning   = null;   // Task 3 populates this

    prfRenderAll();
    toast(`Parsed ${previewRows.length} client(s). Review before applying.`, 'success', 4000);
  } catch (err) {
    toast('Could not read that file: ' + (err.message || 'unknown error'), 'error', 6000);
  } finally {
    showLoading(false);
  }
}

function cspSetMonth(value) {
  PRF.csp.month = value;
}

function cspToggleRow(index, checked) {
  const row = PRF.csp.rows[index];
  if (row && row.status === 'ok') row.ticked = checked;
  cspSyncApplyState();
}

function cspClear() {
  PRF.csp = { imported: false, month: PRF.csp.month, rows: [], unmatched: [], total: 0, warning: null, confirmed: false, applying: false };
  prfRenderAll();
}
```

- [ ] **Step 4: Add the card renderer**

In `index.html`, immediately after the handlers from Step 3, add:

```js
/** Month options for the selector — the last 12 months, newest first. */
function cspMonthOptions(selected) {
  const opts = [];
  const d = new Date();
  for (let i = 1; i <= 12; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const value = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
    opts.push(`<option value="${value}"${value === selected ? ' selected' : ''}>${prfMonthLabel(value)}</option>`);
  }
  return opts.join('');
}

function cspRenderPreviewRow(row, index) {
  const note =
    row.status === 'none'      ? '<span class="csp-flag">no m365 row — skipped</span>' :
    row.status === 'ambiguous' ? '<span class="csp-flag">two m365 rows — skipped</span>' :
    !window.CspCosts.isPreTicked(row.service.name)
      ? '<span class="csp-flag csp-flag-warn">bundled — check before ticking</span>' : '';

  // prfFmtForce, not prfFmt: prfFmt renders 0 as an em dash, which in a
  // money column would read as "no data" rather than "zero pounds".
  // Rounded to pence before comparing: a stored cost carrying sub-penny
  // float precision would otherwise give a delta of ~1e-14, which is not
  // === 0 and would render as "+£0.00" instead of "no change".
  const delta = row.status === 'ok'
    ? Math.round((row.newCost - row.oldCost) * 100) / 100
    : null;
  const deltaHtml =
    delta === null ? '—' :
    delta === 0    ? '<span class="csp-same">no change</span>' :
    `<span class="${delta > 0 ? 'csp-up' : 'csp-down'}">${delta > 0 ? '+' : '−'}${prfFmtForce(Math.abs(delta))}</span>`;

  return `
    <tr>
      <td>${row.status === 'ok'
            ? `<input type="checkbox" ${row.ticked ? 'checked' : ''} onchange="cspToggleRow(${index},this.checked)" aria-label="Apply ${escapeHtml(row.client.name)}">`
            : ''}</td>
      <td>${escapeHtml(row.client.name)}</td>
      <td class="csp-from">${escapeHtml(row.csvName)}</td>
      <td>${row.service ? escapeHtml(row.service.name) : '—'} ${note}</td>
      <td class="csp-num">${row.oldCost === null ? '—' : prfFmtForce(row.oldCost)}</td>
      <td class="csp-num">${prfFmtForce(row.newCost)}</td>
      <td class="csp-num">${deltaHtml}</td>
    </tr>`;
}

function cspRenderImport() {
  const dropZone = `
    <div class="prf-drop-zone" id="cspDropZone"
         ondragover="event.preventDefault();this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="event.preventDefault();this.classList.remove('drag-over');cspHandleDrop(event)">
      <div class="dz-text"><strong>Drag &amp; drop</strong> the CSP billing CSV here, or</div>
      <button type="button" class="dz-browse" onclick="document.getElementById('cspCsvFile').click()">Browse…</button>
      <input type="file" id="cspCsvFile" accept=".csv" onchange="cspHandleFileInput(this)">
    </div>`;

  let body = `
    <p class="csp-hint">
      TD SYNNEX → StreamOne Ion → Reports → <strong>Microsoft CSP Billing Customers Report</strong>.
      Set <strong>Date Range to a full month</strong> before exporting — a part-month export
      understates every cost and the file gives no way to detect it.
    </p>
    <label class="csp-month">Month covered
      <select onchange="cspSetMonth(this.value)">${cspMonthOptions(PRF.csp.month || cspDefaultMonth())}</select>
    </label>
    ${dropZone}`;

  if (PRF.csp.imported) {
    const applicable = PRF.csp.rows.filter(r => r.status === 'ok');
    const skipped    = PRF.csp.rows.filter(r => r.status !== 'ok');

    const unmatchedHtml = PRF.csp.unmatched.length ? `
      <div class="csp-unmatched">
        <strong>${PRF.csp.unmatched.length} unmatched client(s)</strong> — no match in the Directory, nothing written:
        ${PRF.csp.unmatched.map(u => `<div>${escapeHtml(u.csvName)} — ${prfFmtForce(u.cost)}</div>`).join('')}
      </div>` : '';

    body += `
      ${cspRenderWarning()}
      <div class="csp-preview">
        <table class="csp-table">
          <thead><tr>
            <th></th><th>Client</th><th>Matched from</th><th>Service row</th>
            <th class="csp-num">Now</th><th class="csp-num">New</th><th class="csp-num">Change</th>
          </tr></thead>
          <tbody>${PRF.csp.rows.map(cspRenderPreviewRow).join('')}</tbody>
        </table>
      </div>
      ${unmatchedHtml}
      <div class="csp-actions">
        <span class="csp-summary">${applicable.length} applicable · ${skipped.length} skipped · file total ${prfFmtForce(PRF.csp.total)}</span>
        <button type="button" class="csp-clear" onclick="cspClear()">Clear</button>
        <button type="button" class="csp-apply" id="cspApply" onclick="cspApply()">Apply ticked</button>
      </div>`;
  }

  return `
    <div class="prf-xero-import prf-csp-import" id="prfCspImportCard">
      <div style="flex:1;min-width:250px">
        <h4>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          Import CSP costs
        </h4>
        ${body}
      </div>
    </div>`;
}
```

- [ ] **Step 5: Add stubs for the two functions Tasks 3 and 4 fill in**

So the card renders and the tests stay green before those tasks land, add:

```js
/** Task 3 replaces this with the real warning banner. */
function cspRenderWarning() {
  return '';
}

/** Task 3 replaces this. */
function cspSyncApplyState() {}

/** Task 4 replaces this with the real write. */
function cspApply() {
  toast('Apply is added in Task 4.', 'info', 3000);
}
```

- [ ] **Step 6: Render the card**

In `prfRenderAll()`, add `cspRenderImport()` immediately after `prfRenderXeroImport()`:

```js
  wrap.innerHTML =
    prfRenderXeroImport() +
    cspRenderImport() +
    prfRenderSummary() +
```

- [ ] **Step 7: Add the CSS**

In `index.html`, immediately after the existing `/* — Xero CSV Import card (Phase 10) — */` block, add:

```css
/* — CSP cost import card (2026-08-13) —
     Reuses .prf-xero-import for the card shell; only the preview table
     and its controls are new. — */
#section-profitability .prf-csp-import { margin-top: 14px; }
#section-profitability .csp-hint { font-size: 12px; color: var(--muted); margin-bottom: 10px; line-height: 1.5; }
#section-profitability .csp-month { display: block; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
#section-profitability .csp-month select {
  margin-left: 8px; padding: 5px 9px; border-radius: var(--radius-sm);
  border: 1px solid var(--border-dim); background: var(--inset);
  color: var(--white); font: inherit; font-size: 12px;
}
#section-profitability .csp-preview { max-height: 420px; overflow: auto; margin-top: 12px; border: 1px solid var(--border-dim); border-radius: var(--radius-sm); }
#section-profitability .csp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
#section-profitability .csp-table th {
  position: sticky; top: 0; background: var(--card); text-align: left;
  padding: 8px 10px; border-bottom: 1px solid var(--hair);
  font-weight: 600; color: var(--muted); white-space: nowrap;
}
#section-profitability .csp-table td { padding: 7px 10px; border-bottom: 1px solid var(--hair); color: var(--white); }
#section-profitability .csp-table .csp-num { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
#section-profitability .csp-from { color: var(--faint); }
#section-profitability .csp-up { color: var(--amber); }
#section-profitability .csp-down { color: var(--green); }
#section-profitability .csp-same { color: var(--faint); font-family: var(--font-body); }
#section-profitability .csp-flag {
  display: inline-block; margin-left: 6px; padding: 1px 7px;
  border-radius: var(--radius-pill); background: var(--hair);
  color: var(--faint); font-size: 11px;
}
#section-profitability .csp-flag-warn { background: var(--amber-dim); color: var(--amber); }
#section-profitability .csp-unmatched {
  margin-top: 10px; padding: 10px 12px; border-radius: var(--radius-sm);
  background: var(--amber-dim); color: var(--amber); font-size: 12px; line-height: 1.6;
}
#section-profitability .csp-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
#section-profitability .csp-summary { font-size: 12px; color: var(--muted); margin-right: auto; }
#section-profitability .csp-clear,
#section-profitability .csp-apply {
  padding: 7px 15px; border-radius: var(--radius-pill); font: inherit;
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: opacity var(--dur-2) var(--ease);
}
#section-profitability .csp-clear { background: none; border: 1px solid var(--border-dim); color: var(--muted); }
#section-profitability .csp-apply { background: var(--ink); border: 0; color: var(--on-ink); }
#section-profitability .csp-apply:hover:not(:disabled),
#section-profitability .csp-clear:hover { opacity: .85; }
#section-profitability .csp-apply:disabled { opacity: .45; cursor: not-allowed; }
#section-profitability .csp-warn {
  margin-top: 12px; padding: 12px 14px; border-radius: var(--radius-sm);
  background: var(--red-dim); border: 1px solid var(--red); color: var(--white);
  font-size: 12px; line-height: 1.6;
}
#section-profitability .csp-warn strong { color: var(--red); }
#section-profitability .csp-warn label { display: block; margin-top: 8px; color: var(--white); }
```

- [ ] **Step 8: Verify**

Rebuild the mock harness (`.superpowers/sdd/preview/`: `node build.mjs`, served on 8801 — it copies `index.html` **and `src/`**; never commit it). Extend its mock so `GeckoClients` and `GeckoServices` return data matching the real shapes, including one client with an `M365 + Exclaimer` row, one with no `m365` row, and one with two.

1. Navigate to Profitability. The **Import CSP costs** card renders below the Xero card.
2. Drop a CSV built from the spec's sample rows. The preview table renders with one row per client, sorted by client name.
3. `M365 Reselling` rows are ticked; the `M365 + Exclaimer` row is unticked and flagged `bundled`.
4. The client with no `m365` row shows `no m365 row — skipped` and has no checkbox; the two-row client shows `two m365 rows — skipped`.
5. A client absent from the Directory appears in the unmatched block.
6. The "Matched from" column shows the raw CSV name, e.g. `CDA Ltd (Simon Dymott)`.
6b. Give one mock service a `CostPerMonth` of `0`, and give one client a CSV total identical to its stored cost. Expected: the zero renders as **£0.00** (not an em dash), and the unchanged one reads **no change** — never `+—`.
7. Drop a non-CSP CSV (e.g. the Xero export). Expected: the "Missing Customer Name / Seller Cost (GBP)" toast, and no preview.
8. Set a client name in the mock to `<img src=x onerror=alert(1)>`. Expected: rendered as literal text, no alert.
9. Confirm the Xero import card still works unchanged.

- [ ] **Step 9: Run the full suite**

```bash
node tests/csp-costs.mjs && node tests/projects-board.mjs && node tests/portal-accessibility-smoke.mjs && node tests/mileage-rate-effective-date.mjs && node tests/pwa-installability.mjs
```

Expected: all five pass.

- [ ] **Step 10: Commit**

```bash
git add src/main.js index.html
git commit -m "feat(csp): import card, parse and preview"
```

---

### Task 3: The part-month sanity check

The CSV cannot prove it covers a full month. This compares the total against a baseline and blocks Apply behind an explicit confirmation when it looks short.

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `window.CspCosts.checkTotalPlausible`, `PRF.csp`, `PRF.services`.
- Produces: `cspBaseline() => {value: number|null, source: 'last-import'|'stored'|'none', month: string|null}`, `cspSyncApplyState()`, `cspRenderWarning()`, `cspConfirm(checked)`. Task 4 relies on `cspReadLastImport()` / `cspWriteLastImport(month, total)`.

- [ ] **Step 1: Add the baseline helpers**

In `index.html`, replace the `cspRenderWarning` and `cspSyncApplyState` stubs from Task 2 with:

```js
/** The previous import's total, if this browser has one. */
function cspReadLastImport() {
  try {
    const raw = JSON.parse(localStorage.getItem(CSP_LAST_IMPORT_KEY) || 'null');
    if (raw && typeof raw.total === 'number' && raw.total > 0) return raw;
  } catch { /* corrupt or unavailable — fall through to the weaker baseline */ }
  return null;
}

function cspWriteLastImport(month, total) {
  try {
    localStorage.setItem(CSP_LAST_IMPORT_KEY, JSON.stringify({ month, total }));
  } catch (err) {
    console.warn('Could not record the CSP import baseline', err);
  }
}

/**
 * What to compare this import against.
 * Preferred: the previous import's total. Fallback: the sum of stored m365
 * costs — much weaker, because those values are known to be stale and
 * mostly too low, which is the reason this feature exists.
 */
function cspBaseline() {
  const last = cspReadLastImport();
  if (last) return { value: last.total, source: 'last-import', month: last.month };

  const stored = PRF.services
    .filter(s => s.category === 'm365')
    .reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
  if (stored > 0) return { value: stored, source: 'stored', month: null };

  return { value: null, source: 'none', month: null };
}

function cspConfirm(checked) {
  PRF.csp.confirmed = checked;
  cspSyncApplyState();
}

/** Apply is disabled with nothing ticked, on an unconfirmed warning, or mid-apply. */
function cspSyncApplyState() {
  const btn = document.getElementById('cspApply');
  if (!btn) return;
  // An apply in flight outranks everything else: the row checkboxes stay
  // live during the PATCH loop, and without this a tick would re-enable
  // the button and allow a second, concurrent apply.
  if (PRF.csp.applying) { btn.disabled = true; return; }
  const anyTicked = PRF.csp.rows.some(r => r.status === 'ok' && r.ticked);
  const blocked   = PRF.csp.warning && !PRF.csp.confirmed;
  btn.disabled = !anyTicked || !!blocked;
}

function cspRenderWarning() {
  if (!PRF.csp.warning) return '';
  const { ratio, baseline, source, baselineMonth } = PRF.csp.warning;
  const pct = Math.round(ratio * 100);
  const against = source === 'last-import'
    ? `last import${baselineMonth ? ' (' + escapeHtml(prfMonthLabel(baselineMonth)) + ')' : ''}`
    : 'your current stored m365 costs';

  return `
    <div class="csp-warn">
      This export totals <strong>${prfFmtForce(PRF.csp.total)}</strong> — only
      <strong>${pct}%</strong> of ${against}, <strong>${prfFmtForce(baseline)}</strong>.
      If you exported <em>Month to date</em> rather than a full month, every cost
      below is understated. Re-export before applying.
      <label>
        <input type="checkbox" ${PRF.csp.confirmed ? 'checked' : ''} onchange="cspConfirm(this.checked)">
        I've checked — this export covers a full month
      </label>
    </div>`;
}
```

- [ ] **Step 2: Compute the warning during import**

In `cspImportFile`, replace the line `PRF.csp.warning = null;   // Task 3 populates this` with:

```js
    const base  = cspBaseline();
    const check = window.CspCosts.checkTotalPlausible(PRF.csp.total, base.value);
    PRF.csp.warning = check.ok ? null : {
      ratio:         check.ratio,
      baseline:      base.value,
      source:        base.source,
      baselineMonth: base.month
    };
```

- [ ] **Step 3: Sync the button after every render**

At the end of `prfRenderAll()`, immediately after `prfUpdateMonthUI();`, add:

```js
  // The Apply button's enabled state depends on ticks and the warning, both
  // of which live in state rather than in the markup.
  cspSyncApplyState();
```

- [ ] **Step 4: Verify**

With the mock harness:
1. Clear `localStorage` (`localStorage.removeItem('gecko.csp.lastImport.v1')`). Import a CSV whose total is well below the stored m365 sum. Expected: the red warning naming *your current stored m365 costs*, and **Apply disabled**.
2. Tick the confirmation. Expected: Apply enables. Untick it: Apply disables again.
3. Import a CSV whose total is above the baseline. Expected: no warning, Apply enabled.
4. Set `localStorage.setItem('gecko.csp.lastImport.v1', JSON.stringify({month:'2026-07',total:3940.12}))`, then import a file totalling ~£1,721. Expected: the warning names *last import (July 2026)* and reads **44%**.
5. Set that key to `"not json"`. Expected: no exception; the fallback baseline is used.
6. Untick every row. Expected: Apply disabled even with no warning.
7. Read `document.getElementById('cspApply').disabled` directly for each case — do not judge by appearance.

- [ ] **Step 5: Run the full suite**

```bash
node tests/csp-costs.mjs && node tests/projects-board.mjs && node tests/portal-accessibility-smoke.mjs && node tests/mileage-rate-effective-date.mjs && node tests/pwa-installability.mjs
```

Expected: all five pass.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(csp): warn when an import looks like a part-month export"
```

---

### Task 4: Apply the changes

Write the ticked rows to SharePoint, report partial failure honestly, and record the baseline for next time.

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `prfPatchService`, `prfRefreshData`, `cspWriteLastImport`, `PRF.csp`, `toast`, `showLoading`.
- Produces: nothing consumed later.

- [ ] **Step 1: Replace the `cspApply` stub**

In `index.html`, replace the Task 2 `cspApply` stub with:

```js
/**
 * Write every ticked row. Failures are collected rather than aborting, so
 * one bad row cannot strand the rest, and the result is reported honestly.
 */
async function cspApply() {
  const btn = document.getElementById('cspApply');
  const targets = PRF.csp.rows.filter(r => r.status === 'ok' && r.ticked && r.service);
  if (!targets.length) return;
  if (PRF.csp.warning && !PRF.csp.confirmed) return;
  if (PRF.csp.applying) return;

  PRF.csp.applying = true;
  if (btn) btn.disabled = true;
  showLoading(true);

  const failures = [];
  let applied = 0;
  for (const row of targets) {
    try {
      await prfPatchService(row.service.id, { CostPerMonth: row.newCost });
      applied++;
    } catch (err) {
      failures.push(`${row.client.name}: ${err.message || 'write failed'}`);
    }
  }

  // Only record a baseline when everything landed — a partial write would
  // set a misleadingly low bar for next month's sanity check.
  if (applied && !failures.length) {
    cspWriteLastImport(PRF.csp.month, PRF.csp.total);
  }

  showLoading(false);

  if (failures.length) {
    toast(`${applied} updated, ${failures.length} failed — ${failures[0]}`, 'error', 8000);
  } else {
    toast(`${applied} cost${applied === 1 ? '' : 's'} updated.`, 'success', 4000);
  }

  // Re-read from SharePoint so the board shows what was actually stored,
  // not what we hoped we wrote. prfRefreshData re-renders, which rebuilds
  // the card — so never touch `btn` after this point.
  PRF.csp = { imported: false, month: PRF.csp.month, rows: [], unmatched: [], total: 0, warning: null, confirmed: false, applying: false };
  await prfRefreshData(true);
}
```

- [ ] **Step 2: Verify**

With the mock harness (its `graphFetch` override must handle `PATCH` on `GeckoServices` items and offer a way to fail):

1. Import, leave the default ticks, click **Apply**. Expected: a success toast naming the count, the preview clears, and the profitability cards show the new costs.
2. Confirm the mock recorded a `PATCH` per ticked row with `CostPerMonth` set to the previewed **New** value — and **no** `PATCH` for unticked, skipped or unmatched rows.
3. Confirm `localStorage.getItem('gecko.csp.lastImport.v1')` now holds the month and file total.
4. Make one row's `PATCH` fail. Expected: the error toast reports `n updated, 1 failed` naming the client; the others still applied; and `localStorage` is **not** updated.
5. With a warning showing and unconfirmed, confirm clicking Apply does nothing (it is disabled, and the guard inside `cspApply` also returns).
6. Apply, then immediately import again. Expected: no stale rows from the previous import.

- [ ] **Step 3: Run the full suite**

```bash
node tests/csp-costs.mjs && node tests/projects-board.mjs && node tests/portal-accessibility-smoke.mjs && node tests/mileage-rate-effective-date.mjs && node tests/pwa-installability.mjs
```

Expected: all five pass.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(csp): apply ticked cost changes and record the baseline"
```

---

## Final verification before merge

- [ ] All five test files pass.
- [ ] All ten existing sections behave exactly as before — click every one.
- [ ] The Xero import still works: drop a Xero CSV, confirm reconciliation is unaffected.
- [ ] Both themes checked (`document.documentElement.setAttribute('data-theme','light'|'dark')`).
- [ ] The preview table scrolls inside its own container on a 375px-wide viewport; the page does not scroll sideways.
- [ ] No harness files staged (`git status` — `.superpowers/`, `.claude/` and `preview/` must not appear).
- [ ] **Real-tenant test, which needs Jack:** export a genuine full month from StreamOne Ion, import it, review the preview against the figures in the spec's drift table, apply, and confirm `GeckoServices` in SharePoint.
- [ ] `docs/GECKO_INTRANET_PORTAL_BLUEPRINT.md` — note that CSP costs are imported rather than typed.

## Self-review notes

Checked against the spec: data source and the ignored columns (Global Constraints, Task 1); `stripContact` and matcher reuse (Tasks 1–2); aggregation (Task 1); target-row rules none/one/many (Tasks 1–2); the bundle guard (Tasks 1–2); the preview including the matched-from column (Task 2); the month selector and full-month instruction (Task 2); the sanity check with both baselines, the 70% threshold and the confirmation gate (Task 3); write behaviour, partial failure and baseline recording (Task 4); escaping throughout; and all five pure functions tested (Task 1).

Two deliberate details worth not "fixing" later: the baseline is recorded **only on a fully successful apply**, because a partial write would lower next month's bar; and `cspApply` never touches the button after `prfRefreshData`, because that re-render replaces the node — the same detached-node hazard that produced two bugs on the projects board.
