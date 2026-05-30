# BUG FIX PROMPT — Mileage Tracker: Philip Filter Not Working
## Gecko IT Services — Intranet Portal

---

Copy and paste everything below into a new Claude chat (within the Gecko Intranet Portal project).

---

I have a bug in the Mileage section of the Gecko IT Intranet Portal (`index.html`, attached). Please read the project files (blueprint, mileage summary) and the current `index.html` before starting.

---

## The Bug

In the Mileage section, the **"Philip" filter button shows 0 journeys** even though:

- Philip's journeys **are visible** when the filter is set to **"All"** (they render with the correct green "Philip" driver pill)
- The journeys **exist in SharePoint** and are being loaded successfully
- **Jack's filter works correctly** — clicking "Jack" shows Jack's journeys as expected
- The bug is **not a data or SharePoint problem** — it is a local HTML/JS rendering issue

**Symptoms:**
- Clicking the "All" chip → Philip's journeys appear, with green "Philip" pill, correct amounts
- Clicking the "Philip" chip → 0 journeys shown, "No journeys recorded yet for Philip"
- Philip's KPI card shows £0.00 / 0 miles even though journeys exist
- Jack's KPI card, filter, and totals all work fine

---

## History — What Has Already Been Tried (Do Not Repeat These)

### Attempt 1 — Case-insensitive driver normalisation (did not fix it)
Added a `milNormaliseDriver()` function that trims whitespace and does a case-insensitive match of the stored `Driver` field against `['Philip Morris', 'Jack Morris']`. Applied at load time in `milLoadJourneys()`. The function is still present in the current code. **The bug persisted after this fix was deployed.**

This rules out: trailing spaces, wrong casing, simple string mismatches between stored value and filter value.

---

## What We Know For Certain

1. `MIL.journeys` **is populated** — Philip's journeys are in the array (they show under "All")
2. `milNormaliseDriver` **runs at load time** and canonicalises `j.driver` — so `j.driver` should equal `'Philip Morris'` for those rows
3. `MIL.filter` is set to `'Philip Morris'` when the Philip chip is clicked (via `milFilter('Philip Morris', btn)`)
4. The filter logic is: `MIL.journeys.filter(j => j.driver === MIL.filter)`
5. Steps 2 + 3 + 4 should produce a match — but they don't
6. Jack works — meaning `j.driver === 'Jack Morris'` produces correct results for Jack's journeys
7. The bug originated in **Phase 2** (when the mileage tracker was ported into the portal shell) — it was **not present** in the original standalone mileage tracker at `https://jackamo-8bit.github.io/mileage-tracker/`

---

## Suggested Debugging Approach

Since normalisation didn't fix it, the issue is likely one of:

### Hypothesis A — `milNormaliseDriver` never actually runs / runs too early
The function exists in the code but something about the execution order means it's not applied when `milRenderLog` reads the journeys. Check: does `milLoadJourneys` actually call `milNormaliseDriver`? Does the console show any errors during load? Is there a second load path that bypasses normalisation?

### Hypothesis B — `MIL.filter` is being reset between click and render
Something resets `MIL.filter` back to `'all'` after `milFilter()` sets it to `'Philip Morris'`. Check: does `milRefreshData` or `milRenderAll` reset `MIL.filter`? Does the lazy-load path (second navigation to Mileage) interfere? Is there a race condition where an async load completes and calls `milRenderAll()` after the filter is set, but the render uses a stale `MIL.filter`?

### Hypothesis C — There are two separate `MIL` state objects
The portal shell wraps the mileage code. If `MIL` is declared twice (once in a closure, once at module level), the `milFilter` function might be writing to a different `MIL` object than `milRenderLog` is reading from. Check: `grep -n "const MIL\|let MIL\|var MIL"` — there should be exactly one declaration.

### Hypothesis D — The journeys array is being replaced after the filter is set
Between `milFilter()` setting `MIL.filter = 'Philip Morris'` and `milRenderLog()` reading `MIL.journeys`, something replaces `MIL.journeys` with a new array where Philip's driver field is different. This could happen if: (a) there's a pending async load that completes and overwrites `MIL.journeys`, (b) `milRecomputeAll()` somehow corrupts the driver field.

### Hypothesis E — The Philip chip onclick fires `milFilter` but also triggers something else
If the Philip button is inside a parent element that has its own onclick (e.g. the section head, or a card), the event might bubble and call another function that resets state. Check: `event.stopPropagation()` might be needed on the chip buttons.

### Hypothesis F — The driver pill renders correctly but `j.driver` is actually a different string
The pill CSS class is assigned by `j.driver === 'Philip Morris' ? 'philip' : ...`. It's possible the pill IS rendering as the fallback `''` class (no colour) but still shows "Philip" text because `j.driver.split(' ')[0]` = "Philip" regardless. In this case, `j.driver` might be something like `"Philip Morris\n"` or a Unicode near-lookalike. **Add a `console.log` to output every `j.driver` value immediately before the filter comparison** — this will definitively reveal the actual string value.

---

## Recommended Fix Approach

**Before touching any code, add diagnostic logging:**

```javascript
function milRenderLog() {
  console.log('milRenderLog called. MIL.filter =', JSON.stringify(MIL.filter));
  console.log('MIL.journeys driver values:', MIL.journeys.map(j => JSON.stringify(j.driver)));
  // ... rest of function
```

Deploy this, open DevTools console, click the Philip filter button, and read the output. The console will reveal:
- The exact value of `MIL.filter` at render time
- The exact value of every `j.driver` in the array
- Whether they match

Once the root cause is confirmed from the console output, apply the minimal targeted fix. Remove the diagnostic logging before the final commit.

---

## Key Code Locations (search by these strings)

| What | Search for |
|---|---|
| Filter function | `function milFilter(` |
| Render log function | `function milRenderLog(` |
| State object | `const MIL = {` |
| Load journeys | `async function milLoadJourneys(` |
| Normalise driver | `function milNormaliseDriver(` |
| NavTo lazy-load hook | `if (sectionKey === 'mileage'` |
| Filter buttons HTML | `data-filter="Philip Morris"` |
| Refresh data | `async function milRefreshData(` |

---

## Constraints

- **Do not touch** the Profitability section (CSS, HTML, or JS) — Phase 3 is complete and working
- **Do not touch** the portal shell, auth, sidebar, or any other section
- The fix should be **minimal and targeted** — only change what is necessary to fix the Philip filter
- All other mileage functionality (add journey, delete journey, Jack filter, monthly summary, export) must continue to work
- After fixing, confirm Jack's filter, the KPI cards, and the grand total all still work correctly

---

## Architecture Reminder

The portal is a **single `index.html`** file. The Mileage section is a self-contained module scoped to the `MIL` state object and `mil*` prefixed functions. It shares `getToken()`, `graphFetch()`, `toast()`, `showLoading()`, and `escapeHtml()` with the rest of the portal. It lazy-loads via `initMileage()` which is called from `navTo('mileage')` on first visit.

The current `index.html` (with Phase 3 profitability complete and the attempted normalisation fix already applied) is attached.

---

*Generated: April 2026. Portal is at Phase 3 complete. This prompt covers an outstanding Phase 2 bug.*
