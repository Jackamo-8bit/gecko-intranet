import assert from 'node:assert/strict';

// renderCard/renderColumn call escapeHtml, which resolves through window at
// call time. Stub it with the same implementation index.html uses.
globalThis.window = {
  escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]))
};

import {
  STATUSES,
  STALE_DAYS,
  isStale,
  weeksSince,
  groupByStatus,
  renderCard,
  renderColumn,
  statusWritesInFlight
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

// — Escaping —
// The one security property in this section: every field on a card comes from
// a SharePoint list any user can type into, and it is interpolated into HTML
// with innerHTML. These assertions must fail loudly if escaping is dropped, so
// each one checks BOTH that the escaped form is present and that the dangerous
// raw form is absent — a test that only checked "returns a string" would pass
// against a renderer with no escaping at all.

const project = (overrides = {}) => ({
  id: '1', title: 'A project', client: '', owner: '', status: 'Quoted',
  waitingOn: '', nextAction: '', ateraRef: '', notes: '',
  modified: NOW.toISOString(), ...overrides
});

// title — a tag that would execute on render
const titled = renderCard(project({ title: '<img src=x onerror=alert(1)>' }));
assert.ok(
  !titled.includes('<img'),
  'a title containing a tag must not render as a live element'
);
assert.ok(
  titled.includes('&lt;img src=x onerror=alert(1)&gt;'),
  'the title renders as escaped text'
);

// waitingOn — a quote break-out into an event handler attribute
const waiting = renderCard(project({ waitingOn: '" onmouseover="x' }));
assert.ok(
  !waiting.includes('onmouseover="'),
  'waitingOn must not close the title attribute and open a real event handler'
);
assert.ok(
  waiting.includes('&quot; onmouseover=&quot;x'),
  'the quotes in waitingOn are escaped, leaving inert text inside the attribute'
);

// nextAction — closing the surrounding element and opening a script
const next = renderCard(project({ nextAction: '</p><script>alert(1)</script>' }));
assert.ok(
  !next.includes('<script'),
  'nextAction must not be able to open a script element'
);
assert.ok(
  !next.includes('</p><'),
  'nextAction must not be able to close the paragraph it sits in'
);
assert.ok(
  next.includes('&lt;/p&gt;&lt;script&gt;'),
  'nextAction renders as escaped text'
);

// ateraRef — used twice: inside an href, and as link text
const atera = renderCard(project({ ateraRef: '"><script>alert(1)</script>' }));
assert.ok(
  atera.includes('href="https://app.atera.com/new/tickets/%22%3E%3Cscript%3E'),
  'ateraRef is percent-encoded inside the href, so it cannot break the attribute'
);
assert.ok(
  !atera.includes('<script'),
  'ateraRef must not be able to open a script element'
);
assert.ok(
  atera.includes('&quot;&gt;&lt;script&gt;'),
  'the ateraRef link text is escaped'
);

// — statusWritesInFlight gates the select —
// Without this the re-render after a write would hand back an enabled select
// still showing the old status, letting a second PATCH race the first.
statusWritesInFlight.add('99');
try {
  const pending = renderCard(project({ id: '99' }));
  assert.match(
    pending,
    /<select class="prj-status" data-prj-id="99" disabled>/,
    'a project with a status write in flight renders its select disabled'
  );
  const idle = renderCard(project({ id: '100' }));
  assert.ok(
    !idle.includes('disabled'),
    'a project with no write in flight renders its select enabled'
  );
} finally {
  statusWritesInFlight.delete('99');
}

// — renderColumn escapes too, and carries card escaping through —
const column = renderColumn('<b>Quoted</b>', [project({ title: '<script>x</script>' })]);
assert.ok(
  !column.includes('<b>') && column.includes('&lt;b&gt;Quoted&lt;/b&gt;'),
  'the column status is escaped in both the data attribute and the heading'
);
assert.ok(
  !column.includes('<script'),
  'a card rendered inside a column is escaped just as it is on its own'
);
assert.ok(
  renderColumn('Quoted', []).includes('Nothing here.'),
  'an empty column still renders its empty state'
);

console.log('Projects board checks passed.');
