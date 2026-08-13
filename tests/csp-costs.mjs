import assert from 'node:assert/strict';
import {
  stripContact,
  aggregateByCustomer,
  findM365Row,
  isPreTicked,
  checkTotalPlausible,
  countUnparsableCosts,
  sumStoredM365,
  PURE_TICK_TITLE,
  PLAUSIBLE_MIN_RATIO,
  PLAUSIBLE_MAX_RATIO
} from '../src/core/csp-costs.js';

// ─── constants ────────────────────────────────────────────────────────
assert.equal(PURE_TICK_TITLE, 'M365 Reselling');
assert.equal(PLAUSIBLE_MIN_RATIO, 0.7);
assert.equal(PLAUSIBLE_MAX_RATIO, 1.4);

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

// ─── countUnparsableCosts ─────────────────────────────────────────────
// aggregateByCustomer folds anything parseFloat cannot read to zero, which
// on a money import understates silently. The import refuses on these first.
assert.equal(
  countUnparsableCosts([
    { 'Customer Name': 'A', 'Seller Cost (GBP)': '' },
    { 'Customer Name': 'B', 'Seller Cost (GBP)': '1,234.56' },
    { 'Customer Name': 'C', 'Seller Cost (GBP)': '£99.00' },
    { 'Customer Name': 'D', 'Seller Cost (GBP)': 'abc' },
    { 'Customer Name': 'E' }
  ]),
  5,
  'blank, thousands-separated, currency-prefixed, non-numeric and missing all count'
);
assert.equal(
  countUnparsableCosts([
    { 'Customer Name': 'A', 'Seller Cost (GBP)': '0' },
    { 'Customer Name': 'B', 'Seller Cost (GBP)': '21.78' },
    { 'Customer Name': 'C', 'Seller Cost (GBP)': '-5.5' },
    { 'Customer Name': 'D', 'Seller Cost (GBP)': '236.98656799999998' }
  ]),
  0,
  'zero, plain decimals, a negative and full float precision are all readable'
);
assert.equal(
  countUnparsableCosts([
    { 'Customer Name': '', 'Seller Cost (GBP)': '1,234.56' },
    { 'Customer Name': '   ', 'Seller Cost (GBP)': 'abc' },
    { 'Seller Cost (GBP)': '£99' }
  ]),
  0,
  'rows with no customer name are skipped entirely — aggregate ignores them too'
);
assert.equal(countUnparsableCosts([]), 0, 'no rows is safe');
assert.equal(countUnparsableCosts(null), 0, 'null input is safe');

// ─── sumStoredM365 ────────────────────────────────────────────────────
const stored = [
  { clientName: 'CDA Ltd', category: 'm365', cost: 73.75 },
  { clientName: 'CDA Ltd', category: 'stack', cost: 40 },
  { clientName: 'Cowan Consultancy', category: 'm365', cost: 165.25 },
  { clientName: 'Never In Export Ltd', category: 'm365', cost: 500 },
  { clientName: 'Broken Ltd', category: 'm365', cost: 'not-a-number' },
  { clientName: 'Missing Ltd', category: 'm365' }
];
assert.equal(
  sumStoredM365(stored, new Set(['CDA Ltd', 'Cowan Consultancy'])),
  239,
  'only m365 rows of covered clients count — the stack row and the uncovered client do not'
);
assert.equal(
  sumStoredM365(stored, ['CDA Ltd', 'Cowan Consultancy']),
  239,
  'a plain array of names is accepted as well as a Set'
);
assert.equal(
  sumStoredM365(stored, new Set(['Broken Ltd', 'Missing Ltd'])),
  0,
  'a non-numeric or absent cost counts as zero rather than NaN'
);
assert.equal(sumStoredM365(stored, new Set()), 0, 'an empty name set gives zero');
assert.equal(sumStoredM365(null, new Set(['CDA Ltd'])), 0, 'null services is safe');
assert.equal(sumStoredM365(stored, null), 0, 'null names is safe');

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
  { ok: false, ratio: 0.69, direction: 'low' },
  '69% trips the check, reports the ratio, and names the direction'
);
assert.deepEqual(
  checkTotalPlausible(1721.07, 3940.12),
  { ok: false, ratio: 0.44, direction: 'low' },
  'the real part-month case (44%) trips low'
);
assert.deepEqual(
  checkTotalPlausible(2000, 1000),
  { ok: false, ratio: 2, direction: 'high' },
  'a doubled total warns high — a two-month range or a file pasted twice'
);
assert.deepEqual(
  checkTotalPlausible(1400, 1000),
  { ok: true },
  'exactly 140% passes — the rule is ABOVE 140%'
);
assert.deepEqual(
  checkTotalPlausible(1410, 1000),
  { ok: false, ratio: 1.41, direction: 'high' },
  '141% trips the upper bound'
);
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
