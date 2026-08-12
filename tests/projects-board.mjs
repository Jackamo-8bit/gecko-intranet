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
