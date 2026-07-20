# Mileage Rate Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculate journeys dated from 20 July 2026 at 55p per mile, without changing historic mileage amounts.

**Architecture:** Keep the effective date and both high-rate values alongside the existing mileage constants in `index.html`. Pass each journey date into the reimbursement calculator, so the shared calculation path used by new journeys and chronological recomputation selects the right rate. A lightweight Node regression script will evaluate the calculator extracted from the portal source.

**Tech Stack:** Single-file browser application (`index.html`), Node.js built-in test utilities and VM.

## Global Constraints

- The 55p high rate applies to journeys dated on or after `2026-07-20`.
- Journeys before `2026-07-20` retain the 45p high rate.
- The 25p rate above 10,000 miles per driver per tax year remains unchanged.
- Historic SharePoint values must not be retroactively recalculated at 55p.

---

### Task 1: Test the effective-date reimbursement rule

**Files:**
- Create: `tests/mileage-rate-effective-date.mjs`
- Test: `tests/mileage-rate-effective-date.mjs`

**Interfaces:**
- Consumes: `milCalcReimbursement(miles, milesBefore, journeyDate)` from the Mileage module in `index.html`.
- Produces: a Node test command that verifies calculator amounts and rate labels at the effective-date boundary.

- [x] **Step 1: Write the failing test**

```js
assert.deepEqual(calc(100, 0, '2026-07-19'), { amount: 45, rate: '45p/mi' });
assert.deepEqual(calc(100, 0, '2026-07-20'), { amount: 55, rate: '55p/mi' });
assert.deepEqual(calc(1000, 9500, '2026-07-20'), { amount: 400, rate: 'Mixed' });
```

- [x] **Step 2: Run test to verify it fails**

Run: `node tests/mileage-rate-effective-date.mjs`

Expected: FAIL because the current two-argument calculator always returns the 45p high rate.

- [x] **Step 3: Implement the test harness**

```js
const calculatorBlock = html.match(/const HMRC_RATE_HIGH[\s\S]*?function milCalcReimbursement[\s\S]*?\n}\n\n\/\*\*/)?.[0];
vm.runInNewContext(`${calculatorBlock}\nglobalThis.calc = milCalcReimbursement;`, sandbox);
```

The harness must read `index.html`, expose the actual portal calculator in a VM context, and use `assert.deepEqual` for the three cases above.

- [x] **Step 4: Commit the red test**

```bash
git add tests/mileage-rate-effective-date.mjs
git commit -m "test: cover mileage rate effective date"
```

### Task 2: Add the dated 55p rate to the mileage module

**Files:**
- Modify: `index.html:5501`
- Modify: `index.html:10151-10212`

**Interfaces:**
- Consumes: `milCalcReimbursement(miles, milesBefore, journeyDate)`.
- Produces: `{ amount: number, rate: '45p/mi' | '55p/mi' | '25p/mi' | 'Mixed' }`.

- [x] **Step 1: Update the constants and calculator**

```js
const HMRC_RATE_HIGH_HISTORIC = 0.45;
const HMRC_RATE_HIGH_CURRENT = 0.55;
const HMRC_RATE_EFFECTIVE_DATE = '2026-07-20';

function milCalcReimbursement(miles, milesBefore, journeyDate) {
  const m = Number(miles) || 0;
  const before = Number(milesBefore) || 0;
  const after = before + m;
  const highRate = journeyDate >= HMRC_RATE_EFFECTIVE_DATE
    ? HMRC_RATE_HIGH_CURRENT : HMRC_RATE_HIGH_HISTORIC;
  const highRateLabel = highRate === HMRC_RATE_HIGH_CURRENT ? '55p/mi' : '45p/mi';
  if (after <= HMRC_THRESHOLD) return { amount: +(m * highRate).toFixed(2), rate: highRateLabel };
  if (before >= HMRC_THRESHOLD) return { amount: +(m * HMRC_RATE_LOW).toFixed(2), rate: '25p/mi' };
  const high = HMRC_THRESHOLD - before;
  const low = m - high;
  return { amount: +((high * highRate) + (low * HMRC_RATE_LOW)).toFixed(2), rate: 'Mixed' };
}
```

- [x] **Step 2: Pass the journey date through both callers**

```js
const calc = milCalcReimbursement(j.miles, before, j.date);
const calc = milCalcReimbursement(data.miles, before, data.date);
```

The recomputation call preserves historic 45p amounts while new dated journeys use 55p.

- [x] **Step 3: Update the visible rate guidance**

```html
<span>From 20 July 2026 · 55p/mile (first 10,000 miles)</span>
```

Keep the 25p-above-threshold guidance unchanged.

- [x] **Step 4: Run the new regression test**

Run: `node tests/mileage-rate-effective-date.mjs`

Expected: `Mileage rate effective-date checks passed.`

- [x] **Step 5: Run the existing smoke check**

Run: `node tests/portal-accessibility-smoke.mjs`

Expected: `Portal accessibility and visual-system smoke checks passed.`

- [x] **Step 6: Commit the implementation**

```bash
git add index.html tests/mileage-rate-effective-date.mjs
git commit -m "feat: use 55p mileage rate from July 2026"
```
