# PHASE 10 BUILD PROMPT — Xero CSV Import & Portal Enhancements
## Gecko IT Services — Intranet Portal

---

Copy and paste everything below into a new Claude chat (within the Gecko Intranet Portal project).

---

I'm continuing the build of the Gecko IT Services internal portal (`index.html`, attached). Please read the project files (`GECKO_INTRANET_PORTAL_BLUEPRINT.md`, `MILEAGE_TRACKER_PROJECT_SUMMARY.md`) and the current `index.html` end-to-end before starting.

Phase 9 (code cleanup) shipped successfully — shared helpers are consolidated, CSS is properly scoped, orphaned functions removed, and the codebase is clean. This phase adds **Xero CSV import** to replace the manual Xero reconciliation workflow in Profitability, adds a **month selector**, an **Overview hours KPI**, and a **Profitability CSV export**.

---

## Current Build Status

| Phase | Section | Status |
|---|---|---|
| Phase 1 | Portal Shell | ✅ Complete |
| Phase 2 | Mileage Tracker | ✅ Complete |
| Phase 3 | Client Profitability | ✅ Complete |
| Phase 4 | Home Overview | ✅ Complete |
| Phase 5 | Client Directory | ✅ Complete |
| Phase 5.5 | Mileage Claimed Status | ✅ Complete |
| Phase 6 | Timesheets | ✅ Complete |
| Phase 7 | Overview Integration & Settings | ✅ Complete |
| Phase 8 | Compliance & Audit | ✅ Complete |
| Phase 9 | Code Cleanup & Polish | ✅ Complete |
| **Phase 10** | **Xero CSV Import & Enhancements** | 🔲 **This session** |

---

## Azure / Auth — No Changes

- Application (Client) ID: `c41290c7-3747-4fc3-8e79-c452a7cab1f7`
- Directory (Tenant) ID: `e508283a-b42d-4afa-bdc2-eb16dcd9933d`
- SharePoint host: `geckoitservices812.sharepoint.com`
- SharePoint site: `/sites/GeckoITClientPortal`
- Scope: `Sites.ReadWrite.All` — no auth changes in this phase.

---

## Part A — Xero CSV Import

### Context: How Xero Reconciliation Works Today

In the Profitability section, each client card has a **Xero reconciliation row** at the bottom. Philip currently:

1. Opens Xero → Invoices → filters a month → clicks Export
2. Opens the portal → types each client's total into the Xero actual input field manually (~25 clients)
3. The portal compares it against calculated revenue and shows ✓ Match / ~ Close / ✕ Mismatch

Phase 10 replaces step 2 with a **drag-and-drop CSV import** that auto-populates all 25 fields in one go.

---

### Xero CSV Format (Confirmed — Real Export Attached)

The CSV exported from Xero (`Invoices → Export`) has these key characteristics:

**Structure:** One row per **line item** (not per invoice). A single invoice with 5 service lines appears as 5 rows, all sharing the same `InvoiceNumber` and `Total`.

**Key columns (from real April 2026 export):**

| Column | Example | Notes |
|---|---|---|
| `ContactName` | `ALS Locksmiths` | Client name in Xero |
| `InvoiceNumber` | `INV-16181` | Unique invoice reference |
| `InvoiceDate` | `30/04/2026` | DD/MM/YYYY format |
| `Total` | `2895.1200` | Full invoice total **inc VAT** — NOT per line item |
| `TaxTotal` | `482.5200` | VAT amount for the full invoice |
| `LineAmount` | `60.0000` | **This line item's amount ex VAT** — this is what we sum |
| `TaxAmount` | `12.0000` | VAT for this line item |
| `Status` | `Paid` / `Awaiting Payment` / `Draft` | Invoice status |
| `Description` | `Software Support Agreement - 10 hours` | Line item description |
| `Quantity` | `4.0000` | |
| `UnitAmount` | `15.0000` | |

**Critical:** To get the **per-client total ex VAT**, sum `LineAmount` across all rows for that `ContactName`. Do NOT use the `Total` column — that's the full invoice total (inc VAT) and is repeated on every line item row within the same invoice.

**Date format:** `DD/MM/YYYY` (UK format). The CSV may contain invoices spanning multiple months (e.g. March and April in the same export). The portal must filter by the selected month.

**Statuses present:** `Paid`, `Awaiting Payment`, `Draft`. By default, include `Paid` and `Awaiting Payment` but exclude `Draft` (drafts aren't finalised). Provide a toggle to include drafts if needed.

**Real name mismatches between Xero and the portal:**

| Xero ContactName | Portal GeckoClients.Title | Issue |
|---|---|---|
| `H2O Homes Ltd` | `H2O Homes` | "Ltd" suffix |
| `Kingdom Products Ltd` | `Kingdom Products` | "Ltd" suffix |
| `Solent Rewinds Ltd` | `Solent Rewinds` | "Ltd" suffix |
| `Taurus Contractors Ltd` | `Taurus Contractors` | "Ltd" suffix |
| `Technix Rubber & Plastics Ltd` | `Technix Rubber & Plastics` | "Ltd" suffix |
| `CanCan Services` | `Can Can Services` | Spacing difference |
| `J & T Building and maintenance Ltd` | `J&T Building Maintenance` | Spacing + wording + suffix |
| `Snowskool` | *(not in portal)* | Xero-only client |
| `The Ski Company (UK) Ltd` | *(not in portal)* | Xero-only client |
| `Voip Unlimited` | *(not in portal)* | Xero-only client (supplier?) |

**Name matching algorithm (must handle all the above):**

```
1. Normalise both names:
   a. Trim whitespace
   b. Strip common suffixes: "Ltd", "Limited", "PLC", "Inc" (case-insensitive)
   c. Collapse all whitespace to single spaces
   d. Lowercase
   e. Remove ampersands and "and" → just use surrounding words
2. Try exact match on normalised names
3. If no match, try "starts with" in both directions (Xero starts with Portal, or Portal starts with Xero)
4. If no match, try Levenshtein-like fuzzy match (edit distance ≤ 3)
5. If still no match, flag as "Unmatched" and let the user manually assign
```

The matching algorithm runs entirely client-side. No SharePoint changes needed for matching.

---

### UI for CSV Import

Add a **Xero Import** card to the Profitability section, positioned between the section head and the KPI strip:

```
┌──────────────────────────────────────────────────────────────────────┐
│  📊 XERO RECONCILIATION                                              │
│                                                                      │
│  ┌──────────────────────────────────────────────┐                    │
│  │   Drag & drop a Xero CSV here, or click to   │   April 2026      │
│  │   browse                                      │   23 matched      │
│  │                                               │   2 unmatched     │
│  │   [Browse…]                                   │   Synced 14:23    │
│  └──────────────────────────────────────────────┘                    │
│                                                                      │
│  [ ] Include Draft invoices        [Re-import]  [Clear Xero Data]   │
│                                                                      │
│  ⚠ 2 Xero contacts not matched:                                     │
│     Snowskool (£2,852.50) — [Assign to client ▾]                    │
│     The Ski Company (UK) Ltd (£839.99) — [Assign to client ▾]       │
└──────────────────────────────────────────────────────────────────────┘
```

**Behaviour:**

1. User drags a CSV file onto the drop zone (or clicks Browse)
2. Portal parses the CSV client-side (no upload to any server)
3. Portal auto-detects the month from the most common `InvoiceDate` month in the file
4. Portal runs the name matching algorithm against `PRF.clients`
5. Matched clients: `XeroActual` field auto-populated → reconciliation status updates in real time
6. Unmatched Xero contacts: shown in a warning list with a dropdown to manually assign to a portal client
7. Portal clients with no Xero match: shown as "No Xero data" in the reconciliation row (this is normal — not all clients invoice every month)
8. All matched figures are auto-saved to `GeckoClients.XeroActual` (and `XeroMonth`) in SharePoint
9. The "Clear Xero Data" button resets all `XeroActual` values to null for the current month

**Drop zone styling:** match the existing dark card aesthetic. Dashed border (`var(--border)`), subtle green glow on drag-over. Compact — should not dominate the section.

**File handling:** use the browser `FileReader` API to read the CSV as text. Parse with a simple CSV parser (handle quoted fields with commas inside them). No external library needed — the Xero CSV format is clean.

---

### Month Selector

Add a month selector to the Profitability section head, next to the Refresh button:

```
[◀]  April 2026  [▶]
```

**How it works:**

- Default: current month (auto-detected from today's date)
- Clicking ◀ / ▶ changes the displayed month
- The Xero reconciliation row shows data for the selected month only
- Service costs/revenues are assumed constant month-to-month (no historical service data — that's a future enhancement)
- When the month changes:
  - If Xero data exists in SharePoint for that month (`XeroMonth` matches), load it
  - If not, show "No Xero data for this month — import a CSV" in the reconciliation rows
- The KPI strip always shows current month data (it reflects whatever `XeroActual` values are loaded)

**SharePoint changes needed:**

New column on `GeckoClients`:
- `XeroMonth` — Single line of text, stores `YYYY-MM` (e.g. `2026-04`)

When Xero data is saved (via CSV import or manual entry), the portal writes both `XeroActual` and `XeroMonth` together. When the month selector changes, the portal checks if each client's `XeroMonth` matches the selected month — if not, the reconciliation row shows "No data for this month".

**Future enhancement (not this phase):** Store historical Xero data in a separate `GeckoXeroHistory` list so all months are preserved. For now, `GeckoClients.XeroActual` + `XeroMonth` stores only the most recently imported month.

---

### State Changes for Profitability Module

Add to the `PRF` state object:

```javascript
xeroImported:   false,        // true after a CSV has been processed this session
xeroMonth:      null,         // 'YYYY-MM' of the currently selected month
xeroUnmatched:  [],           // [{ xeroName, total, assignedTo }] — contacts that didn't auto-match
xeroData:       {},           // { normalisedClientName: totalExVat } — parsed CSV data
selectedMonth:  null,         // 'YYYY-MM' for the month selector (defaults to current month)
includeDrafts:  false         // whether to include Draft invoices in the import
```

Add `prf`-prefixed functions:
- `prfImportXeroCsv(file)` — parse CSV, run matching, populate fields, save to SharePoint
- `prfClearXeroData()` — reset all XeroActual/XeroMonth for the current month
- `prfXeroMatchName(xeroName, portalClients)` — name matching algorithm
- `prfXeroNormaliseName(name)` — strip Ltd, collapse whitespace, lowercase
- `prfAssignUnmatched(xeroName, portalClientId)` — manual assignment from dropdown
- `prfChangeMonth(delta)` — month selector ◀ / ▶
- `prfLoadXeroForMonth(monthStr)` — check SharePoint for stored Xero data for the selected month

---

## Part B — Enhancements

### Enhancement 1: Overview — Hours Logged This Week KPI

The Overview section currently shows mileage, revenue, profit, active clients, and SSA risk KPIs. Add a **"Hours This Week"** KPI card.

**Data source:** The Overview module already resolves the `Timesheets` list ID and loads entries (added in Phase 7). It just doesn't render a hours-this-week KPI yet.

**Implementation:**
- Filter `OVW.timesheetEntries` (or equivalent) where `EntryDate` falls in the current Monday–Sunday week
- Sum total hours
- Sub-text: per-engineer breakdown (e.g. "Philip: 12.5h · Jack: 8.25h")
- Uses the `hours` KPI colour class (blue, `var(--blue)`)
- Position: after the SSA Risk KPI card (last in the KPI row)

**Check first:** Confirm the Overview module already loads timesheet entries. If it doesn't, add the fetch (it should — Phase 7 added Timesheets list resolution to OVW). If it only has the list ID but doesn't load entries, add the loader.

---

### Enhancement 2: Profitability — CSV Export

Add an **Export CSV** button to the Profitability section head (next to Refresh):

```
[📥 Export CSV]  [🔄 Refresh]  Synced 14:23
```

**Output format:**

```csv
Client,Status,Cost/mo,Revenue/mo,Gross Profit,Margin %,Xero Actual,Xero Month,Variance
ALS Locksmiths,Active,114.12,265.51,151.39,57.0%,265.51,2026-04,0.00
Brazier Interiors,Active,7.75,32.92,25.17,76.5%,32.92,2026-04,0.00
...
```

- Includes **all** clients (ignores current filter/search — export is always the full dataset)
- One row per client (summary level, not per service)
- Triggered by a button click → browser downloads a `.csv` file
- Filename: `gecko-profitability-YYYY-MM.csv`

---

## Constraints — Do Not Touch

- **Do not modify** any SharePoint list structures except `GeckoClients` (adding `XeroMonth`)
- **Do not modify** the Mileage, Timesheets, Client Directory, or Compliance sections (CSS, HTML, JS)
- **Do not modify** the Phase 9 shared helpers (use them, don't change them)
- **Do not break** the existing manual Xero entry workflow — if no CSV is imported, the manual input fields must still work exactly as before
- **Do not break** the existing Xero save-on-blur behaviour — manual edits should still save immediately
- All new code in clearly labelled comment blocks
- CSS scoped under `#section-profitability` for Profitability rules, `#section-overview` for Overview rules

---

## Pre-Flight Checklist (DO BEFORE STARTING THIS PHASE)

**Do not start coding until all of these are confirmed.** Ask the user explicitly to confirm each item.

- [ ] **`XeroMonth` column added to `GeckoClients` in SharePoint** — Single line of text
- [ ] **Sample Xero CSV available** — the April 2026 export has been analysed; confirm the user can export another month for testing
- [ ] **The current `index.html` from the repo root** has been attached to this chat
- [ ] **Confirm the Overview module loads timesheet entries** — check `OVW.timesheetEntries` or equivalent in the code; if missing, the loader needs to be added first

---

## Implementation Approach (Suggested)

1. **Read the current `index.html`** — confirm Phase 9 cleanup, locate the Profitability module, understand current Xero reconciliation flow
2. **Confirm pre-flight items** — ask the user
3. **Build the CSV parser first** — `prfImportXeroCsv()`, test with the real April CSV mentally: parse rows, sum LineAmount per ContactName, filter by month, exclude Drafts
4. **Build the name matching algorithm** — `prfXeroNormaliseName()`, `prfXeroMatchName()`. Verify all 7 known mismatches are handled
5. **Build the drop zone UI** — drag-and-drop card, Browse button, status display
6. **Wire into the reconciliation flow** — auto-populate XeroActual fields, save to SharePoint, update KPIs
7. **Build the unmatched contacts UI** — warning list with manual assignment dropdowns
8. **Build the month selector** — ◀ / ▶ buttons, `prfChangeMonth()`, load/save with `XeroMonth`
9. **Build Enhancement 1** — Overview hours KPI
10. **Build Enhancement 2** — Profitability CSV export
11. **Final QA pass** — `node --check`, brace-balance, walk through Definition of Done

---

## Definition of Done

### Part A — Xero CSV Import
- [ ] Drop zone accepts CSV files via drag-and-drop and file browse
- [ ] CSV is parsed client-side — no data leaves the browser
- [ ] `LineAmount` is summed per `ContactName` to get per-client ex-VAT totals
- [ ] Month is auto-detected from the CSV's most common `InvoiceDate` month
- [ ] Draft invoices excluded by default; toggle to include them
- [ ] Name matching handles all 7 known mismatches (Ltd suffix, spacing, wording)
- [ ] Matched figures auto-populate the Xero reconciliation row in each client card
- [ ] Reconciliation status (Match/Close/Mismatch) updates in real time
- [ ] Unmatched Xero contacts displayed with manual assignment dropdowns
- [ ] Figures saved to `GeckoClients.XeroActual` and `GeckoClients.XeroMonth` in SharePoint
- [ ] Manual Xero entry still works when no CSV is imported
- [ ] "Clear Xero Data" button resets values for the current month
- [ ] KPI strip reflects imported Xero totals

### Month Selector
- [ ] ◀ / ▶ buttons change the selected month
- [ ] Reconciliation rows show data for the selected month (from `XeroMonth`)
- [ ] "No data for this month" shown when `XeroMonth` doesn't match
- [ ] Default is current month

### Part B — Enhancements
- [ ] Overview: "Hours This Week" KPI card displays correctly with per-engineer breakdown
- [ ] Profitability: CSV export downloads with correct client-level summary data
- [ ] All other sections still work correctly
- [ ] Design matches the established dark aesthetic
- [ ] `node --check` passes; brace/tag balance checks pass

---

## Style Reminders

- No frameworks, no build steps — vanilla HTML/CSS/JS
- Single `index.html` output to `/mnt/user-data/outputs/index.html`
- Brace-balanced, syntax-checked before delivery (`node --check` on extracted JS)
- CSS scoped under `#section-*` for section-specific rules (Phase 9 convention)
- Use shared helpers: `jsAttr()`, `fmtDate()`, `today()`, `resolveSiteId()`, `fetchAllLists()`
- Module pattern: state object + prefixed functions + lazy-loaded init
- Emojis replaced with inline stroke-based SVGs
- Update version string in Settings to `Phase 10 — May 2026`

---

*Phase 10 of 10+. Portal build started April 2026. Current `index.html` should be attached at the start of the chat alongside the project files.*
