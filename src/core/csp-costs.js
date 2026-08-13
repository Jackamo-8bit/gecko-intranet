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
