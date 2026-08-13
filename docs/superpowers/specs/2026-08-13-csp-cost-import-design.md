# CSP Cost Import — Design

**Date:** 2026-08-13
**Branch:** `feat/csp-cost-import`
**Status:** Approved for planning

---

## Why this exists

Gecko resells Microsoft CSP licences bought through TD SYNNEX. The portal's
Profitability section models this as `GeckoServices` rows carrying
`CostPerMonth` and `SellPerMonth` per service per client — but `CostPerMonth`
is only ever written by hand, in the service edit form. Nobody updates it, so
the cost side of every margin figure has quietly drifted.

The drift is not theoretical. Comparing the stored values against a TD SYNNEX
CSP billing export taken 2026-08-13:

| Client | Stored `CostPerMonth` | Actual seller cost (13 days only) |
|---|---|---|
| CDA Ltd | £73.99 | £129.44 |
| Daron Motors | £119.07 | £228.66 |
| Cowan Consultancy | £165.18 | £284.81 |
| Clarke Lane Engineering | £47.99 | £75.46 |
| ALS Locksmiths | £109.63 | £47.51 |

Most stored costs are far *below* what Gecko is actually billed, and that
comparison is against a **part-month** export, so the true gap is wider. ALS
runs the other way. Every margin and profit figure in the portal is wrong by
these amounts.

This is the classic MSP leak: a client adds seats, or Microsoft raises a price,
and nothing tells you. The fix is to stop typing costs in by hand.

**The one job:** make `CostPerMonth` reflect what TD SYNNEX actually bills,
without a laborious per-customer trawl through the portal.

### Non-goals

Not a licence management tool. Not a seat reconciliation tool. Not a
replacement for Xero. It does not touch revenue — `SellPerMonth` and the Xero
reconciliation already work and are out of scope.

## The data source

TD SYNNEX **StreamOne Ion → Reports → Microsoft CSP Billing Customers Report**,
exported as CSV. Relevant columns:

| Column | Use |
|---|---|
| `Customer Name` | e.g. `CDA Ltd (Simon Dymott)` — matched to `GeckoClients` |
| `Seller Cost (GBP)` | **The only figure used.** What TD SYNNEX bills Gecko. |
| `Customer Cost (GBP)` | **Ignored.** See below. |
| `Margin (GBP)` | **Ignored.** See below. |
| `Cloud Account Name` | Subscription GUID. Not used; one client has many. |
| `Product Name`, `SKU Name`, `Seat Count`, `Usage Quantity` | Not used. |

### Sources considered and rejected

**The Direct Debit PDF** emailed monthly by `CreditNotification.uk@tdsynnex.com`
carries no detail — one gross total (`£1,363.92`) and a pointer to
`See Billing Statement ID_67700`. No SKUs, no quantities, no customers. Nothing
in it can be turned into per-client costs. (It also formats money European-style,
`1.363,92`, which would misparse as £1.36 — noted so nobody tries again.)

**The Atera API** is unrelated to costs and is ruled out portal-wide anyway; see
the projects board spec.

### Why `Customer Cost` and `Margin` are ignored

Every row in the export satisfies `Customer Cost ≈ Seller Cost × 1.191` — a flat
19.1% markup from TD SYNNEX's price book. It is a *suggested* resale price, not
Gecko's. Gecko varies its pricing per client and the real figures live in Xero
and in `SellPerMonth`.

Importing their `Margin` column would make the portal display a confident,
uniform 19.1% margin on every client forever. Wrong, and invisibly so. **Only
`Seller Cost` is used.**

---

## Behaviour

### Placement

An **Import CSP costs** card in the Profitability section, beside the existing
Xero CSV import, using the same drag-and-drop pattern. Costs and revenue then
get refreshed from one screen.

### Flow

1. User selects the month (defaults to last month) and drops `report.csv`.
2. The file is parsed, `Seller Cost (GBP)` summed per `Customer Name`,
   each name matched to a client, and each client's `m365` service row found.
3. A **preview table** renders. Nothing is written yet.
4. User reviews, ticks/unticks rows, clicks **Apply**.
5. Only ticked rows are written, one `PATCH` per row.

### The preview

| Client | Matched from | Service row | Now | New | Change | ✓ |
|---|---|---|---|---|---|---|
| CDA Ltd | `CDA Ltd (Simon Dymott)` | M365 Reselling | 73.99 | 129.44 | +55.45 | ☑ |
| Cowan Consultancy | `Cowan Consultancy (Tim Button)` | M365 + Exclaimer ⚠ | 165.18 | 284.81 | +119.63 | ☐ |
| Haus Coast | `Haus Coast (Oliver Ophaus)` | *no m365 row* | — | 34.30 | — | — |

**Showing the matched-from name is required, not decorative.** The matcher has a
fuzzy tier; a mis-match would write real money against the wrong client. Seeing
the pairing is what makes that catchable.

### Ticking rules

A row is **pre-ticked only if its service row title is exactly `M365 Reselling`**
(case-insensitive). Everything else arrives unticked with a warning.

This exists because two rows are bundles — Cowan and Daron Motors carry
`M365 + Exclaimer`, and Exclaimer is not in the CSP export. Overwriting those
with the CSP-only figure would silently *delete* the Exclaimer cost and inflate
their margin: a fix that makes one number worse. The safe default is that
anything unusual requires a deliberate tick.

Rows with no target row, or an ambiguous one, have no checkbox and can never be
written.

### Choosing the target row

The client's `GeckoServices` row where `Category === 'm365'`:

| Matching rows | Behaviour |
|---|---|
| Exactly one | Update target |
| None | Listed as "no m365 row" — **never created** |
| Two or more | Listed as ambiguous — not written, no guessing |

Creating service rows is out of scope. A new row needs a category, a title and a
`SellPerMonth` that only a human knows, and inventing them would corrupt the
list the profitability screen depends on.

### Name matching

Reuses `prfXeroMatchName` and `prfXeroNormaliseName` unchanged — exact
normalised match, then starts-with in both directions, then Levenshtein ≤ 3.

One new step: strip a trailing parenthetical before normalising.

```js
name.replace(/\s*\([^)]*\)\s*$/, '')
```

`prfXeroNormaliseName` strips `Ltd` only at the end of a string, so
`CDA Ltd (Simon Dymott)` currently normalises to `cda ltd (simon dymott)` and
only limps through on the starts-with tier. Stripping first gives `CDA Ltd` →
`cda`, an exact match. It also handles the double space in
`Onsite Services Southern Ltd  (Luke Ashton)`.

No persistent name-override table. The normalisation handles every name in the
current export; unmatched clients are listed for manual handling. Add overrides
only if unmatched names prove recurrent.

### The month, and the one thing that cannot be automated

**The CSV contains no date range.** The exported file is identical in shape
whether it covers a full month or 13 days, so the importer cannot detect a
part-month export. A month-to-date file would silently understate every cost.

The card therefore states plainly that the export must be taken with
**Date Range set to a full month**, and the month selector must be confirmed
before Apply. This is a stated instruction, not a validated one. It is the
single weakest point in the design and is recorded as such.

---

## Architecture

### Split

**Pure logic → `src/core/csp-costs.js`.** Registered on `window` by
`src/main.js` (the same pattern the projects board uses, and necessary because
`index.html` is a classic script that cannot `import`). Imported directly by
`tests/csp-costs.mjs` under Node.

**UI and Graph writes → inline in the Profitability section of `index.html`.**

This split is deliberate rather than uniform. The feature is welded to `PRF`
state and four existing helpers; extracting the whole section now would mean
duplicating them or exporting a dozen globals. Profitability is a good
candidate for full extraction later, as one job — see the module-migration
section of the blueprint.

The split earns its keep because **this writes financial data**. The arithmetic
deciding which number lands on which client is tested; the drag-and-drop
plumbing is not.

### Reuse

| Existing | Used for |
|---|---|
| `prfParseCsv` | CSV parsing |
| `prfXeroMatchName`, `prfXeroNormaliseName` | Client matching |
| `prfPatchService` | Writing `CostPerMonth` |
| `PRF.clients`, `PRF.services` | Already loaded; no new fetches |
| `toast`, `escapeHtml`, `showLoading` | Feedback and escaping |

No new SharePoint list, no new columns, no new Graph scopes.

### Pure functions in `src/core/csp-costs.js`

```
stripContact(name)                  → string
aggregateByCustomer(rows)           → [{ customer, cost }]
findM365Row(clientName, services)   → { row } | { none: true } | { ambiguous: n }
isPreTicked(serviceTitle)           → boolean
```

`aggregateByCustomer` sums `Seller Cost (GBP)` per `Customer Name`, rounded to
2dp. Zero-cost rows sum harmlessly; one exists in the sample export.

---

## Failure and edge cases

| Case | Behaviour |
|---|---|
| Not a CSP export (missing `Customer Name` / `Seller Cost (GBP)`) | Rejected with a message naming the expected report |
| Empty file / no data rows | Rejected, nothing written |
| Client matched, no `m365` row | Listed, no checkbox, never created |
| Client matched, two `m365` rows | Listed as ambiguous, never written |
| Client unmatched | Listed with its CSV name and total |
| A single `PATCH` fails | Collected; other rows still apply |
| Some rows fail | Reported as partial — never "done" |
| Apply with nothing ticked | Disabled |

**Values are overwritten, not merged.** Per the decision recorded below, there
is no cost history: the previous value is visible in the preview and then gone.

**Escaping:** every rendered value — client names, CSV names, service titles —
passes through `escapeHtml`. CSV content is untrusted input.

**Async safety:** the preview must not be rebuilt from a captured DOM node after
an `await`. Follow the pattern established by the projects board: re-render from
state, and key any "is this still current?" check to the operation.

---

## Decisions recorded

**No cost history** (Jack, 2026-08-13). An earlier option stored
`{"2026-07": 66.38, "2026-08": 71.20}` alongside, mirroring `XeroHistory`, so
drift could be reviewed later. Rejected as unnecessary. The preview shows
old → new at the moment of import, which is when it matters; there is no
retrospective view, and that is accepted.

**Overwrite `CostPerMonth` directly** rather than staging changes elsewhere.

**Only `Seller Cost`** — Gecko's own prices vary per client and live in Xero
(Jack, 2026-08-13).

---

## Testing

`tests/csp-costs.mjs`, run with `node tests/csp-costs.mjs`, matching the style
of the existing test files (`node:assert/strict`, a final `console.log`).

1. **`aggregateByCustomer`** — multiple subscriptions for one client sum to one
   figure; a zero-cost row does not break the sum; rounding is 2dp; an unknown
   or blank customer name is skipped rather than creating a phantom entry.
2. **`stripContact`** — `CDA Ltd (Simon Dymott)` → `CDA Ltd`;
   `Onsite Services Southern Ltd  (Luke Ashton)` → `Onsite Services Southern Ltd`;
   a name with no parenthetical is unchanged; a name with an *interior*
   parenthetical is unchanged (only a trailing one is stripped).
3. **`isPreTicked`** — true for `M365 Reselling` and `m365 reselling`; false for
   `M365 + Exclaimer`, `M365 Reselling + Exclaimer`, and an empty title.
4. **`findM365Row`** — none, exactly one, and two-or-more cases each return the
   documented shape.

Parsing, rendering and Graph writes are not unit-tested: parsing reuses the
already-shipped `prfParseCsv`, and the rest needs a browser and a live tenant.
Manual verification uses the mock preview harness.

---

## Success criteria

1. Dropping a full-month CSP export updates every straightforward client's
   `CostPerMonth` in one action, with no per-customer trawl.
2. Nothing is written without being seen first.
3. A bundled service row cannot lose its non-CSP cost by accident.
4. A mis-matched client name is visible before it is written.
5. Margin figures across Profitability and Overview become true to what TD
   SYNNEX actually bills.
6. Revenue handling, and all ten existing sections, behave exactly as before.
