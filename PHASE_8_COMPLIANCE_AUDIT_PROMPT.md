# PHASE 8 BUILD PROMPT — Compliance & Audit Section
## Gecko IT Services — Intranet Portal

---

Copy and paste everything below into a new Claude chat (within the Gecko Intranet Portal project).

---

I'm continuing the build of the Gecko IT Services internal portal (`index.html`, attached). Please read the project files (`GECKO_INTRANET_PORTAL_BLUEPRINT.md`, `MILEAGE_TRACKER_PROJECT_SUMMARY.md`) and the current `index.html` end-to-end before starting.

This phase replaces the Compliance placeholder section with a working Compliance & Audit tracker. It provides a centralised place to manage Cyber Essentials evidence, client audit records, and key compliance dates — turning a previously paper/spreadsheet-based process into a structured, searchable portal section.

---

## Current Build Status

| Phase | Section | Status |
|---|---|---|
| Phase 1 | Portal Shell | ✅ Complete |
| Phase 2 | Mileage Tracker | ✅ Complete |
| Phase 3 | Client Profitability | ✅ Complete |
| Phase 4 | Home Overview | ✅ Complete — KPI cards, mileage/revenue/profit/clients/hours/SSA |
| Phase 5 | Client Directory | ✅ Complete — table/card views, SSA hours, search, CRUD |
| Phase 5.5 | Mileage Claimed Status | ✅ Complete — KPIs, bulk-claim, CSV export |
| Phase 6 | Timesheets | ✅ Complete — log time, SSA dashboard, weekly summary, edit/delete |
| Phase 7 | Overview Integration & Settings | ✅ Complete — timesheets KPIs on Overview, profile card in Settings, gear icon |
| **Phase 8** | **Compliance & Audit** | 🔲 **This session** |

---

## Azure / Auth — No Changes

- Application (Client) ID: `c41290c7-3747-4fc3-8e79-c452a7cab1f7`
- Directory (Tenant) ID: `e508283a-b42d-4afa-bdc2-eb16dcd9933d`
- SharePoint host: `geckoitservices812.sharepoint.com`
- SharePoint site: `/sites/GeckoITClientPortal`
- Scope: `Sites.ReadWrite.All` — already covers all lists
- Auth is shared. No changes needed for Phase 8.

---

## Context — Compliance at Gecko IT

Gecko IT holds **Cyber Essentials** certification and manages IT for clients who may have their own compliance requirements. Currently, compliance tracking is informal — renewal dates live in calendars, audit evidence is scattered across SharePoint folders, and there's no single view of "what's due when."

Phase 8 creates a structured compliance tracker that:

1. **Tracks compliance items** — Cyber Essentials renewal, insurance renewals, client audit dates, ICO registration, etc.
2. **Flags upcoming deadlines** — colour-coded urgency (overdue / due soon / healthy)
3. **Links to evidence** — each item can reference a SharePoint folder or document URL
4. **Per-client audit records** — track which clients have had network audits and when
5. **Dashboard view** — at-a-glance status of all compliance obligations

---

## SharePoint List — `GeckoCompliance` (CREATE BEFORE BUILDING)

This is a new list. Each row = one compliance obligation or audit record.

| Column | Type | Notes |
|---|---|---|
| Title | Single line of text | Name of the compliance item (e.g. "Cyber Essentials Renewal", "ALS Locksmiths — Network Audit") |
| Category | Choice | `Certification` / `Insurance` / `Audit` / `Registration` / `Policy` / `Other` |
| Status | Choice | `Current` / `Due Soon` / `Overdue` / `Expired` / `Not Started` |
| DueDate | Date (date only) | When this item is due / expires |
| CompletedDate | Date (date only) | When the item was last completed / renewed (optional) |
| ClientName | Single line of text | If this is a per-client item (e.g. a network audit), which client. Empty = company-wide. |
| Owner | Choice | `Philip` / `Jack` / `Both` |
| Notes | Multiple lines of text | Details, reference numbers, evidence links, etc. |
| EvidenceUrl | Single line of text | URL to the evidence document or folder in SharePoint (optional) |
| Recurring | Yes/No | Whether this item recurs (e.g. annual renewal). Default: Yes |
| FrequencyMonths | Number | Recurrence interval in months (e.g. 12 for annual). Only relevant if Recurring = Yes. |

---

## What to Build — Phase 8: Compliance & Audit

Replace the existing placeholder (`id="section-compliance"`) with a working compliance tracker.

---

### Layout — Two Sub-Panels (Tab Strip)

Mirror the Mileage/Timesheets tab pattern:

**Tab 1: Dashboard (default)**
The primary view. Contains:

- **Status summary strip** at the top (KPI-style):
  - Total items tracked
  - Current (green)
  - Due Soon (amber) — items due within 30 days
  - Overdue (red) — items past due date
  - Not Started (muted)

- **Timeline / card grid** below:
  - Group items by category (Certification, Insurance, Audit, etc.)
  - Each item shows: title, status pill, due date, owner, client (if per-client), evidence link
  - Sorted within each group by due date (most urgent first)
  - Overdue items highlighted with left red border
  - Due Soon items highlighted with left amber border
  - Click to expand: shows notes, completed date, recurrence info
  - Quick actions on each item: Edit / Mark Complete (sets CompletedDate to today, recalculates DueDate if Recurring)

**Tab 2: Manage Items**
CRUD for compliance items:

- **Add item form** at the top (card layout, same pattern as Mileage/Timesheets forms):
  - Title — text input (required)
  - Category — dropdown (Certification / Insurance / Audit / Registration / Policy / Other)
  - Due Date — date picker (required)
  - Owner — dropdown (Philip / Jack / Both)
  - Client — dropdown (populated from GeckoClients, with an "— Company Wide —" option at top)
  - Notes — textarea (optional)
  - Evidence URL — text input (optional)
  - Recurring — toggle (default: Yes)
  - Frequency — number input (months, default: 12, only shown if Recurring = Yes)
  - "Add Item" submit button

- **All items table** below the form:
  - Columns: Title | Category | Status | Due Date | Owner | Client | Actions
  - Filterable by category, status, owner
  - Sortable by due date, title
  - Actions: Edit / Delete (with confirmation modal)

---

### Status Calculation Logic

Status is **computed from DueDate**, not stored as a static value. When rendering:

| Condition | Computed Status | Colour |
|---|---|---|
| DueDate is past AND CompletedDate is null or < DueDate | `Overdue` | red |
| DueDate is within 30 days from today | `Due Soon` | amber |
| DueDate is > 30 days away AND (CompletedDate exists or Status = Current) | `Current` | green |
| No DueDate set | `Not Started` | muted |

When writing to SharePoint, store the computed status in the `Status` field for consistency with any external views, but always recompute on render.

### "Mark Complete" Logic

When a user clicks "Mark Complete":
1. Set `CompletedDate` to today
2. If `Recurring = Yes`:
   - Calculate new `DueDate` = old `DueDate` + `FrequencyMonths` months
   - Set `Status` to `Current` (the new due date should be in the future)
   - Toast: "Renewed — next due [new date]"
3. If `Recurring = No`:
   - Set `Status` to `Current`
   - Toast: "Marked as complete"

---

### State Object

```javascript
const CMP = {
  initialised: false,
  loading:     false,
  siteId:      null,
  listIds:     { compliance: null, geckoClients: null },
  items:       [],   // [{ id, title, category, status, dueDate, completedDate, clientName, owner, notes, evidenceUrl, recurring, frequencyMonths }]
  clients:     [],   // [{ name }] — from GeckoClients, for the client dropdown
  activeTab:   'dashboard',
  filter:      { category: 'all', status: 'all', owner: 'all' },
  sortBy:      'dueDate',
  sortDir:     'asc',
  lastSync:    null
};
```

Prefix all functions with `cmp` (e.g. `cmpInit`, `cmpRefresh`, `cmpRender`, `cmpAddItem`, `cmpMarkComplete`).

---

### navTo Hook

Add the equivalent lazy-load hook in `navTo()`:

```javascript
if (sectionKey === 'compliance' && typeof initCompliance === 'function') {
  initCompliance();
}
```

---

### Graph API Calls

Two lists to fetch in parallel:

```
GET /sites/{siteId}/lists/GeckoCompliance/items?expand=fields&$top=500
GET /sites/{siteId}/lists/GeckoClients/items?expand=fields&$top=500
```

The GeckoClients list is only needed for the client dropdown — it's the same list Profitability and Directory use.

**CRUD on `GeckoCompliance`:**
- POST to create new items
- PATCH to edit items, mark complete, update status
- DELETE to remove items

---

### CSS

Add a clearly labelled CSS block scoped to `#section-compliance .cmp-*`:

```css
/* ╔═══════════════════════════════════════════════════════════════════╗
   ║   COMPLIANCE SECTION (Phase 8)                                    ║
   ╚═══════════════════════════════════════════════════════════════════╝ */
```

Reuse design tokens. Match existing patterns:
- Tab strip → same as Mileage/Timesheets (`.tsh-tab` pattern → `.cmp-tab`)
- Filter chips → same pattern (`.cmp-chip`)
- Form layout → same pattern (`.cmp-form` / `.cmp-field`)
- Table → same pattern (`.cmp-tbl`)
- Modal → dedicated `#cmpModalBg`
- Category pills → colour set:
  - Certification → green (var(--green))
  - Insurance → blue (var(--blue))
  - Audit → purple (var(--purple))
  - Registration → teal (var(--teal))
  - Policy → amber (var(--amber))
  - Other → muted (var(--muted))
- Status pills:
  - Current → green
  - Due Soon → amber
  - Overdue → red
  - Expired → red-dim
  - Not Started → muted

---

### Sidebar Update

Remove the "soon" tag from the Compliance sidebar link (it's now being built).

---

### Cross-Links

**Compliance → Directory:** Per-client audit items should have a "View in Directory" link → `navTo('clients')`.

**Overview integration (future):** Add a comment in the CMP module noting that a future phase could add a "Compliance Items Due" KPI card to the Overview dashboard. Do NOT modify the Overview module in this phase.

---

### Edge Cases

1. **No compliance items yet:** Show a seed/onboarding card (same pattern as Profitability's empty state) with suggested items to add: "Cyber Essentials Renewal", "PI Insurance Renewal", "ICO Registration".

2. **Items with no due date:** Treat as "Not Started" — show at the bottom of the dashboard.

3. **Evidence URL:** If present, render as a clickable link (opens in new tab). If it's a SharePoint URL, it opens in the user's browser with their existing M365 session.

4. **Client dropdown:** Include "— Company Wide —" as the first option (empty value). Per-client items should show the client name in the dashboard card/table.

5. **"Mark Complete" on a recurring item:** The old CompletedDate and DueDate are overwritten. If audit trail is needed, the user should note it in the Notes field. Keep it simple for Phase 8.

---

### Constraints — Do Not Touch

- **Do not modify** the Mileage section (CSS, HTML, JS)
- **Do not modify** the Overview section (Phase 7 just shipped — leave it alone)
- **Do not modify** the Client Directory section (Phase 5)
- **Do not modify** the Profitability section (Phase 3)
- **Do not modify** the Timesheets section (Phase 6)
- **Do not modify** the Settings section (Phase 7)
- All existing functions (`milNormaliseDriver`, `cliJsAttr`, `tshResolveClientNames`, `renderSettings`, etc.) must be preserved
- All new code lives between clearly labelled `COMPLIANCE` comment blocks
- Permitted edits outside the Compliance blocks:
  - Add the `navTo('compliance')` lazy-load hook
  - Remove the "soon" tag from the Compliance sidebar link

---

### Definition of Done

- [ ] Navigating to Compliance triggers a parallel fetch of `GeckoCompliance` and `GeckoClients`
- [ ] Dashboard tab shows status summary strip + items grouped by category
- [ ] Status is computed from DueDate (overdue / due soon / current / not started)
- [ ] Items sorted by urgency within each group
- [ ] Overdue items have red left border, Due Soon have amber
- [ ] Expandable items show notes, completed date, recurrence info
- [ ] "Mark Complete" works: sets CompletedDate, recalculates DueDate if recurring
- [ ] Manage Items tab: add form works, creates item in SharePoint
- [ ] All items table shows correct data, filterable, sortable
- [ ] Edit modal works
- [ ] Delete with confirmation works
- [ ] Empty state shows seed/onboarding card
- [ ] Evidence URLs render as clickable links
- [ ] Client dropdown populated from GeckoClients
- [ ] "soon" tag removed from Compliance sidebar link
- [ ] Refresh button re-fetches and re-renders
- [ ] Last sync time updates
- [ ] Loading bar shows during fetch
- [ ] Error toast on failures
- [ ] All other sections still work correctly
- [ ] Design matches the established dark aesthetic

---

## Pre-Flight Checklist (DO BEFORE STARTING THIS PHASE)

**Do not start coding until all of these are confirmed.** Ask the user explicitly to confirm each item.

- [ ] **`GeckoCompliance` SharePoint list created** with all columns listed above:
  - Title (already exists)
  - Category — Choice (`Certification`, `Insurance`, `Audit`, `Registration`, `Policy`, `Other`)
  - Status — Choice (`Current`, `Due Soon`, `Overdue`, `Expired`, `Not Started`)
  - DueDate — Date (date only, no time)
  - CompletedDate — Date (date only, no time)
  - ClientName — Single line of text
  - Owner — Choice (`Philip`, `Jack`, `Both`)
  - Notes — Multiple lines of text (plain text, not rich text)
  - EvidenceUrl — Single line of text
  - Recurring — Yes/No (default: Yes)
  - FrequencyMonths — Number (default: 12)
- [ ] **Confirm the internal names** — SharePoint sometimes mangles column names. If any column was created with a display name that differs from the internal name, provide the actual internal names.
- [ ] **The current `index.html` from the repo root** has been attached to this chat
- [ ] **Confirm whether any initial compliance items should be pre-seeded** (e.g. Cyber Essentials renewal date, PI insurance date, ICO registration date) — if so, provide the dates

---

## Implementation Approach (Suggested)

1. **Read the current `index.html`** — identify the placeholder section, confirm helpers, locate the navTo hook insertion point
2. **Confirm pre-flight items** — explicitly ask the user
3. **Build the data layer first** — `CMP` state, list resolution, loaders, status computation, "Mark Complete" logic. Test with console.log before building UI.
4. **Build the Dashboard tab** — status summary strip, grouped item cards, expand/collapse, "Mark Complete" button
5. **Build the Manage Items tab** — add form, all-items table, filter chips, sort
6. **Build the edit + delete flows** — modal, confirmation
7. **Empty state** — seed card for first-time use
8. **Sidebar update** — remove "soon" tag
9. **Final QA pass** — walk through Definition of Done, run `node --check` on extracted JS, brace-balance check

---

## Key Technical Lessons (Carry Forward)

These lessons from previous phases apply to Phase 8:

1. **Graph paginates at ~100 items per page** — follow `@odata.nextLink` even with `$top=500`
2. **Choice columns may not be returned by Graph** — the `Work_x0020_Type` issue in Timesheets. Test that `Category`, `Status`, and `Owner` Choice columns are returned. If any aren't, fall back to the same scanning pattern used in Phase 6.
3. **Date filtering done client-side** — don't rely on OData `$filter` for dates
4. **Module pattern** — `CMP` state object, `cmp`-prefixed functions, lazy-loaded via `initCompliance()` in `navTo()`
5. **CSS scoped to `#section-compliance .cmp-*`** to avoid bleed
6. **Inline `onclick` attributes** — use `cmpJsAttr()` helper (mirrors `cliJsAttr` / `tshJsAttr`)

---

## Style Reminders

- Emojis replaced with inline stroke-based SVGs throughout
- No frameworks, no build steps — vanilla HTML/CSS/JS
- Single `index.html` output to `/mnt/user-data/outputs/index.html`
- Module pattern: state objects, prefixed functions, lazy-loaded via `init*()` in `navTo()`
- CSS scoped to section IDs to avoid bleed
- Brace-balanced, syntax-checked before delivery

---

## Module Pattern Reference

| Section | State object | Function prefix | Init function | CSS scope |
|---|---|---|---|---|
| Overview | `OVW` | `ovw` | `initOverview()` | `#section-overview .ovw-*` |
| Profitability | `PRF` | `prf` | `initProfitability()` | `#section-profitability .prf-*` |
| Mileage | `MIL` | `mil` | `initMileage()` | `#section-mileage .mil-*` |
| Clients | `CLI` | `cli` | `initClients()` | `#section-clients .cli-*` |
| Timesheets | `TSH` | `tsh` | `initTimesheets()` | `#section-timesheets .tsh-*` |
| Settings | — | `set` / `renderSettings` | `renderSettings()` | `#section-settings .set-*` |
| **Compliance** | **`CMP`** | **`cmp`** | **`initCompliance()`** | **`#section-compliance .cmp-*`** |

---

*Phase 8. Portal build started April 2026. Current `index.html` should be attached at the start of the chat alongside the project files.*
