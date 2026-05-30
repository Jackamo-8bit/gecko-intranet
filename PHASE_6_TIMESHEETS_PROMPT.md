# PHASE 6 BUILD PROMPT — Timesheets Section
## Gecko IT Services — Intranet Portal

---

Copy and paste everything below into a new Claude chat (within the Gecko Intranet Portal project).

---

I'm continuing the build of the Gecko IT Services internal portal (`index.html`, attached). Please read the project files (`GECKO_INTRANET_PORTAL_BLUEPRINT.md`, `MILEAGE_TRACKER_PROJECT_SUMMARY.md`) and the current `index.html` end-to-end before starting.

This phase replaces the Timesheets placeholder section with a working web-based time-logging tool that reads and writes to a new SharePoint list (`GeckoTimesheets`), and ties into the existing SSA hours system on the `Clients` list.

---

## Current Build Status

| Phase | Section | Status |
|---|---|---|
| Phase 1 | Portal Shell | ✅ Complete |
| Phase 2 | Mileage Tracker | ✅ Complete |
| Phase 3 | Client Profitability | ✅ Complete |
| Phase 4 | Home Overview | ✅ Complete |
| Phase 5 | Client Directory | ✅ Complete |
| Phase 5.5 | Mileage Claimed Status | ✅ Complete — KPIs show unclaimed totals, bulk-claim mode, CSV export |
| **Phase 6** | **Timesheets** | 🔲 **This session** |
| Phase 7+ | Compliance / Settings | 🔲 Placeholders only |

---

## Azure / Auth — No Changes

- Application (Client) ID: `c41290c7-3747-4fc3-8e79-c452a7cab1f7`
- Directory (Tenant) ID: `e508283a-b42d-4afa-bdc2-eb16dcd9933d`
- SharePoint host: `geckoitservices812.sharepoint.com`
- SharePoint site: `/sites/GeckoITClientPortal`
- Scope: `Sites.ReadWrite.All` — already covers reads and writes to all lists
- Auth is shared. No changes needed for Phase 6.

---

## Context — How Timesheets Work at Gecko IT Today

Gecko IT sells **SSA (Support Service Agreement)** contracts to clients. Each SSA gives the client a bucket of hours (typically 10 hours) per period. When Philip or Jack does work for a client, they log the time. The `Clients` SharePoint list tracks the running total:

- **HoursPurchased** — the SSA bucket size (e.g. 10)
- **HoursUsed** — cumulative hours logged this period
- **Hours_x0020_Remaining2** — remaining hours (may include manual adjustments)

Currently, time is logged via a Power App. The Power App writes to the `Clients` list (incrementing `HoursUsed`) and triggers a `SendTimesheets` Power Automate workflow that emails the client a summary.

**The Power App will remain in use alongside this web version during a transition period.** The web version should NOT attempt to replace the `SendTimesheets` workflow — that stays in Power Automate. The web version's job is:

1. **Log individual time entries** to a new `GeckoTimesheets` list (the audit trail that doesn't currently exist)
2. **Update `HoursUsed`** on the `Clients` list when a new entry is logged (so the SSA hours dashboard stays accurate)
3. **View and manage logged entries** (filter by client, date, engineer)
4. **Surface SSA status** (hours remaining per client) so engineers can see at a glance which clients are running low

The `Clients` list remains the **source of truth** for SSA totals. The `GeckoTimesheets` list provides the **line-item audit trail** (who did what, when, for how long).

---

## SharePoint Lists

### Existing List — `Clients` (READ for SSA data; WRITE only to `HoursUsed`)

This is the same list the Client Directory reads. **Do NOT modify its structure.** The only write operation Phase 6 performs is incrementing `HoursUsed` when a new timesheet entry is logged.

| Display name | Internal name | Type | Notes |
|---|---|---|---|
| Client Name | `Title` | Text | Matches `GeckoClients.Title` |
| Hours Purchased | `HoursPurchased` | Number | SSA bucket size |
| Hours Used | `HoursUsed` | Number | Cumulative hours logged |
| Hours Remaining | `Hours_x0020_Remaining2` | Number | **⚠️ Weird internal name** — see Phase 5 notes |
| Client Folder | `ClientFolder` | Text | Used by SendTimesheets workflow |
| Send Timesheet | `SendTimesheets` | (button) | **Don't touch** — internal workflow trigger |

### New List — `GeckoTimesheets` (CREATE BEFORE BUILDING)

This is the audit trail. Each row = one block of work done for a client.

| Column | Type | Notes |
|---|---|---|
| Title | Single line of text | Short description of work done (e.g. "Mailbox migration", "Printer troubleshooting") |
| ClientName | Single line of text | Must match `Clients.Title` exactly — used for the join |
| Engineer | Single line of text | "Philip Morris" or "Jack Morris" |
| EntryDate | Date (date only) | When the work was done |
| Hours | Number | Duration in hours (decimal — e.g. 0.5, 1.25, 2.0) |
| Category | Choice | `Support` / `Project` / `Internal` / `Travel` / `Admin` |
| Notes | Multiple lines of text | Optional — longer description, follow-up actions, etc. |
| Billable | Yes/No | Whether this counts against the client's SSA hours (default: Yes) |

**Why `Billable`?** Not all work eats SSA hours. Internal admin, travel time, or goodwill fixes shouldn't decrement the client's bucket. When `Billable = No`, the entry is logged for the audit trail but `HoursUsed` on the `Clients` list is NOT incremented.

---

## What to Build — Phase 6: Timesheets

Replace the existing placeholder (`id="section-timesheets"`) with a working timesheet tool.

---

### Layout — Three Sub-Panels (Tab Strip)

Mirror the Mileage Tracker's tab pattern:

**Tab 1: Log Time (default)**
The primary action panel. Contains:

- **Quick-log form** at the top (card layout, matching the Mileage "Add Journey" card):
  - Client dropdown — populated from the `Clients` list (only clients with an SSA — i.e. `HoursPurchased > 0`)
  - When a client is selected, show their current SSA status inline: "ALS Locksmiths — 7.5h remaining of 10h"
  - Engineer dropdown — Philip Morris / Jack Morris
  - Date picker — defaults to today
  - Hours — number input, step 0.25, min 0.25 (quarter-hour increments)
  - Category dropdown — Support / Project / Internal / Travel / Admin
  - Description — text input (required, short — maps to `Title`)
  - Billable toggle — defaults to Yes; shows a small note when set to No: "Won't count against SSA hours"
  - Notes — optional textarea (collapsed by default, expand on click to keep the form compact)
  - "Log Time" submit button

- **Recent entries table** below the form:
  - Columns: Date | Engineer | Client | Description | Category | Hours | Billable | Actions
  - Filterable by engineer (same chip pattern as Mileage driver filter)
  - Filterable by date range: "This week" / "This month" / "All" (defaults to "This month")
  - Sortable by date (most recent first)
  - Actions: Edit / Delete (with confirmation)
  - Editing opens a modal pre-filled with the entry's values — same pattern as the Directory client edit modal

**Tab 2: SSA Dashboard**
A read-only dashboard showing every client's SSA status at a glance:

- Grid of client cards (responsive: 3 columns desktop, 2 tablet, 1 mobile)
- Each card shows:
  - Client name + avatar (initials, matching Directory style)
  - Hours Purchased / Hours Used / Hours Remaining as a visual bar + numbers
  - Progress bar: green when ≥20% remaining, amber when 5-20% remaining, red when <5% remaining
  - "View entries" link → switches to Tab 1 filtered to that client
- Sorted by Hours Remaining ascending (most urgent at top)
- "Jump to Directory" link on each card for quick cross-reference

**Tab 3: Weekly Summary**
A weekly view for Philip to review what was done:

- Grouped by week (Monday–Sunday), most recent first
- Each week block shows:
  - Week label: "Week of 12 May 2026"
  - Per-engineer breakdown: hours logged, by category
  - Per-client breakdown within that week: total hours
  - Grand total hours for the week
- Mirrors the Monthly Summary pattern in Mileage but at weekly granularity (IT support work is typically reviewed weekly, not monthly)

---

### State Object

```javascript
const TSH = {
  initialised: false,
  loading:     false,
  siteId:      null,
  listIds:     { timesheets: null, clients: null },
  entries:     [],   // [{ id, clientName, engineer, date, hours, category, description, notes, billable }]
  ssaClients:  [],   // [{ id, name, hoursPurchased, hoursUsed, hoursRemaining }]
  activeTab:   'log',
  filter:      'all',         // engineer filter: 'all' | 'Philip Morris' | 'Jack Morris'
  dateRange:   'month',       // 'week' | 'month' | 'all'
  clientFilter: '',           // client name filter for entries table (empty = all)
  sortBy:      'date',
  sortDir:     'desc',
  lastSync:    null,
  modalConfirmFn: null
};
```

Prefix all functions with `tsh` (e.g. `tshInit`, `tshRefresh`, `tshRender`, `tshAddEntry`, `tshEditEntry`).

---

### navTo Hook

Add the equivalent lazy-load hook in `navTo()`:

```javascript
if (sectionKey === 'timesheets' && typeof initTimesheets === 'function') {
  initTimesheets();
}
```

---

### Graph API Calls

Two lists to fetch in parallel:

```
GET /sites/{siteId}/lists/GeckoTimesheets/items?expand=fields&$top=2000
GET /sites/{siteId}/lists/Clients/items?expand=fields&$top=500
```

The `Clients` list is the same one the Directory reads. Resolve its ID the same way — `displayName === 'Clients'`.

**CRUD on `GeckoTimesheets`:**
- POST to create new entries
- PATCH to edit entries (description, hours, category, notes, billable)
- DELETE to remove entries

**Write to `Clients` (SSA hours update):**
When a **billable** entry is created:
- Read the client's current `HoursUsed` from the `Clients` list
- Increment by the logged hours
- PATCH the `HoursUsed` field on the `Clients` list item

When a **billable** entry is deleted:
- Decrement `HoursUsed` by the deleted entry's hours (ensure it doesn't go below 0)

When a **billable** entry is edited and the hours change:
- Adjust `HoursUsed` by the delta (new hours − old hours)

When the **billable** flag is toggled on an existing entry:
- If changed from Yes → No: decrement `HoursUsed` by the entry's hours
- If changed from No → Yes: increment `HoursUsed` by the entry's hours

**Important:** `Hours_x0020_Remaining2` is likely a calculated column or manually adjusted. Do NOT write to it directly — only write to `HoursUsed`. SharePoint (or the existing workflow) handles the remaining-hours calculation.

---

### Cross-Links

**Timesheets → Directory:** "View in Directory" link on each SSA client card → `navTo('clients')`

**Timesheets → Overview:** The Overview section (Phase 4) should ideally show a "Hours logged this week" KPI. However, do NOT modify the Overview module in this phase — that would require careful integration and is better done as a follow-up. Just note it in a comment at the top of the TSH module as a future enhancement.

**Directory → Timesheets:** The Directory (Phase 5) already shows `Hours Remaining` per client from the `Clients` list. Consider adding a small "Log time →" link or icon button on each Directory row that navigates to the Timesheets section and pre-selects that client in the dropdown. This is a NICE-TO-HAVE — only do it if it's clean and minimal. If it risks disturbing the Directory module, skip it and note it for later.

---

### CSS

Add a clearly labelled CSS block scoped to `#section-timesheets .tsh-*`:

```css
/* ╔═══════════════════════════════════════════════════════════════════╗
   ║   TIMESHEETS SECTION (Phase 6)                                    ║
   ╚═══════════════════════════════════════════════════════════════════╝ */
```

Reuse design tokens. Match existing patterns:
- Tab strip → same as Mileage (`.mil-tab` pattern → `.tsh-tab`)
- Filter chips → same as Mileage (`.mil-chip` pattern → `.tsh-chip`)
- Form layout → same as Mileage (`.mil-form` / `.mil-field` pattern → `.tsh-form` / `.tsh-field`)
- Client cards in SSA Dashboard → same as Directory cards (`.cli-card` pattern)
- Table → same as Mileage journey log (`.mil-tbl` pattern → `.tsh-tbl`)
- Modal → dedicated `#tshModalBg` (same structure as CLI and MIL modals, keep modules independent)
- Category pills → new colour set:
  - Support → green (var(--green))
  - Project → blue (var(--blue))
  - Internal → purple (var(--purple))
  - Travel → amber (var(--amber))
  - Admin → muted (var(--muted))
- SSA progress bar → green/amber/red based on remaining percentage

---

### Edge Cases to Handle

1. **Client with no SSA (HoursPurchased = 0 or null):** Exclude from the SSA Dashboard cards. In the quick-log form dropdown, show all clients from the `Clients` list but mark non-SSA ones with a "(No SSA)" suffix and default `Billable` to No when one is selected.

2. **Logging more hours than remaining:** Allow it (SSA can go negative), but show a warning toast: "⚠ ALS Locksmiths now has -1.5h remaining — consider invoicing for additional hours."

3. **Editing hours on an old entry:** Adjust `HoursUsed` by the delta (new − old). If the entry was previously non-billable and is now billable, add the full amount. If it was billable and is now non-billable, subtract the full amount.

4. **Deleting an entry:** Show a confirmation modal. If billable, also decrement `HoursUsed`. If the decrement would make `HoursUsed` negative, set it to 0 and show a warning.

5. **Race condition with Power App:** During the transition period, both this web tool and the Power App may be updating `HoursUsed`. Because both do read-then-write, there's a theoretical race condition. This is accepted — the workaround is to refresh the section before logging if you suspect the other person was using the Power App. Add a small note in the SSA Dashboard: "SSA hours sync from SharePoint — if the Power App was used recently, click Refresh."

6. **Clients list is read-only for structure** — do NOT create/delete rows. Only PATCH `HoursUsed` on existing rows.

---

### Constraints — Do Not Touch

- **Do not modify** the `Clients` SharePoint list structure — only PATCH `HoursUsed`
- **Do not modify** the Mileage section (CSS, HTML, JS) — including the Phase 5.5 claimed-status code
- **Do not modify** the Overview section (Phase 4)
- **Do not modify** the Client Directory section (Phase 5) — unless doing the optional cross-link, and even then only add a small button, don't restructure
- **Do not modify** the Profitability section (Phase 3)
- All `milNormaliseDriver`, `prfOpenClientModal` (orphaned), and other existing functions must be preserved
- All new code lives between clearly labelled `TIMESHEETS` comment blocks
- Permitted edits outside the Timesheets blocks:
  - Add the `navTo('timesheets')` lazy-load hook
  - Optionally add a small cross-link button in the Directory (if clean and minimal)

---

### Definition of Done

- [ ] Navigating to Timesheets triggers a parallel fetch of `GeckoTimesheets` and `Clients`
- [ ] Quick-log form works: select client, see SSA status, fill fields, submit → entry appears in table + `HoursUsed` incremented on `Clients` list
- [ ] Billable toggle works: Non-billable entries log to `GeckoTimesheets` but do NOT increment `HoursUsed`
- [ ] SSA warning toast fires when logging pushes a client into negative hours
- [ ] Recent entries table shows correct data, filters by engineer / date range, sorts by date
- [ ] Edit modal works: changes entry + adjusts `HoursUsed` delta if hours/billable changed
- [ ] Delete confirmation works: removes entry + decrements `HoursUsed` if billable
- [ ] SSA Dashboard tab shows all SSA clients with visual progress bars, sorted by urgency
- [ ] Weekly Summary tab groups entries by week with per-engineer and per-client breakdowns
- [ ] Category pills render with correct colours
- [ ] Refresh button re-fetches and re-renders
- [ ] Last sync time updates
- [ ] Loading bar shows during fetch
- [ ] Error toast on failures
- [ ] All other sections still work correctly
- [ ] Design matches the established dark aesthetic

---

## Pre-Flight Checklist (DO BEFORE STARTING THIS PHASE)

**Do not start coding until all of these are confirmed.** Ask the user explicitly to confirm each item.

- [ ] **`GeckoTimesheets` SharePoint list created** with all columns listed above:
  - Title (already exists — short description of work)
  - ClientName — Single line of text
  - Engineer — Single line of text
  - EntryDate — Date (date only, no time)
  - Hours — Number
  - Category — Choice (`Support`, `Project`, `Internal`, `Travel`, `Admin`)
  - Notes — Multiple lines of text (plain text, not rich text)
  - Billable — Yes/No (default: Yes)
- [ ] **Confirm the internal names** — SharePoint sometimes mangles column names. If any column was created with a display name that differs from the internal name (e.g. if "EntryDate" got internally stored as `EntryDate0` or similar), provide the actual internal names
- [ ] **The current `index.html` from the repo root** has been attached to this chat
- [ ] **Confirm whether the optional Directory → Timesheets cross-link is wanted** (small "Log time" icon on each Directory row that pre-selects the client)

---

## Implementation Approach (Suggested)

1. **Read the current `index.html`** — identify the placeholder section, confirm helpers, locate the navTo hook insertion point
2. **Confirm pre-flight items** — explicitly ask the user
3. **Build the data layer first** — `TSH` state, list resolution, loaders, the SSA-hours updater. Test with console.log before building UI.
4. **Build the quick-log form + entries table (Tab 1)** — form, validation, submit, table render, filter, sort
5. **Build the edit + delete flows** — modal, delta-based `HoursUsed` adjustment
6. **Build the SSA Dashboard (Tab 2)** — client cards with progress bars
7. **Build the Weekly Summary (Tab 3)** — grouped view
8. **Cross-links** — Directory → Timesheets (if confirmed)
9. **Final QA pass** — walk through Definition of Done, run `node --check` on extracted JS, brace-balance check

---

## Style Reminders

- Emojis replaced with inline stroke-based SVGs throughout (consistent with previous phases)
- No frameworks, no build steps — vanilla HTML/CSS/JS
- Single `index.html` output to `/mnt/user-data/outputs/index.html`
- The `Clients` list is **structurally read-only** from this portal — only PATCH `HoursUsed`, never create/delete rows, never add/remove columns
- Brace-balanced, syntax-checked before delivery (run `node --check` on the extracted JS)
- Module pattern: `TSH` state object, `tsh`-prefixed functions, lazy-loaded via `initTimesheets()` in `navTo()`
- CSS scoped to `#section-timesheets .tsh-*` to avoid bleed

---

*Phase 6 of 7+. Portal build started April 2026. Current `index.html` should be attached at the start of the chat alongside the project files.*
