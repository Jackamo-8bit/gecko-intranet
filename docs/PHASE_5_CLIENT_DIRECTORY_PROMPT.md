# PHASE 5 BUILD PROMPT — Client Directory Section
## Gecko IT Services — Intranet Portal

---

Copy and paste everything below into a new Claude chat (within the Gecko Intranet Portal project).

---

I'm continuing the build of the Gecko IT Services internal portal (`index.html`, attached). Please read the project files (`GECKO_INTRANET_PORTAL_BLUEPRINT.md`, `MILEAGE_TRACKER_PROJECT_SUMMARY.md`) and the current `index.html` end-to-end before starting.

This phase is more architecturally interesting than previous ones because it joins data across two SharePoint lists — please pay close attention to the schema notes below.

---

## Current Build Status

| Phase | Section | Status |
|---|---|---|
| Phase 1 | Portal Shell | ✅ Complete |
| Phase 2 | Mileage Tracker | ✅ Complete — Philip filter bug fixed |
| Phase 3 | Client Profitability | ✅ Complete — live SharePoint data, Xero reconciliation |
| Phase 4 | Home Overview | ✅ Complete — KPI dashboard, refresh, quick actions |
| **Phase 5** | **Client Directory** | 🔲 **This session** |
| Phase 6+ | Timesheets / Compliance | 🔲 Placeholders only |

---

## Azure / Auth — No Changes

- Application (Client) ID: `c41290c7-3747-4fc3-8e79-c452a7cab1f7`
- Directory (Tenant) ID: `e508283a-b42d-4afa-bdc2-eb16dcd9933d`
- SharePoint host: `geckoitservices812.sharepoint.com`
- SharePoint site: `/sites/GeckoITClientPortal`
- Scope: `Sites.ReadWrite.All` — already covers reads from both lists
- Auth is shared. No changes needed for Phase 5.

---

## SharePoint Lists — Two Lists, Joined By Name

**This is the most important section. Read it carefully.**

Phase 5 reads from **two separate SharePoint lists** and joins them client-side by name. Both lists already exist and are populated — no schema changes are required for this phase.

### List 1 — `GeckoClients` (built in Phase 3, used by Profitability)

The Phase 3 module already reads/writes this list. Phase 5 will continue to be the **only place that edits client metadata** (per the Phase 5 architectural decision below).

| Display name | Internal name | Type | Notes |
|---|---|---|---|
| Title | `Title` | Text | Client name (canonical) |
| Status | `Status` | Choice | `Active` / `Winding` / `New` |
| ContractStart | `ContractStart` | Date | Optional |
| Notes | `Notes` | Multi-line text | Optional |
| XeroActual | `XeroActual` | Number | Phase 3 Xero reconciliation field — **leave alone** |

### List 2 — `Clients` (pre-existing, wired to Timesheets — DO NOT MODIFY)

This list has existing SharePoint automation hanging off it (a `SendTimesheets` workflow, a `ClientFolder` lookup wired into Timesheets). **Phase 5 reads from this list only — never writes to it, never modifies its structure.**

| Display name | Internal name | Type | Notes |
|---|---|---|---|
| Client Name | `Title` | Text | Client name (must match `GeckoClients.Title`) |
| Primary Contact | `PrimaryContact` | Text | Contact name |
| Email | `Email` | Text | Primary contact email |
| Hours Purchased | `HoursPurchased` | Number | SSA bucket size (typically 10) |
| Hours Used | `HoursUsed` | Number | Hours logged this SSA period |
| Hours Remaining | `Hours_x0020_Remaining2` | Number | **⚠️ NOTE THE WEIRD INTERNAL NAME** — column was renamed at some point. The `_x0020_` is SharePoint-encoded whitespace, the trailing `2` is from the rename. Use this exact string in Graph API calls. |
| Client Folder | `ClientFolder` | Text | Used by Timesheets workflow — display only |
| Send Timesheet | `SendTimesheets` | (button) | Don't touch — internal workflow trigger |
| Alert Sent | various | (irrelevant) | Ignore for Phase 5 |

### Joining the two lists

The two lists join by `Title` (client name), case-insensitive, whitespace-collapsed. **Before this phase begins, the names in the `Clients` list have been tidied up to match `GeckoClients` exactly** (see pre-flight checklist below) — so a clean join is possible without any in-code mapping table.

Some clients will exist in only one list:

- **In `GeckoClients` but not in `Clients`:** that client has no SSA agreement. Show their profitability info but display "—" or "No SSA" in the hours column.
- **In `Clients` but not in `GeckoClients`:** that client has an SSA but no profitability stack on file (yet). Show them with an "Add to profitability" hint.

The directory shows the **union** of both lists, anchored on client name.

---

## What to Build — Phase 5: Client Directory

The Client Directory is a unified, searchable view of every Gecko client. It surfaces contact details, status, profitability summary, and SSA hours remaining — all in one place. It is also the **new home for client editing** (Add/Edit/Delete), replacing the equivalent functionality currently in Profitability.

The section already exists in the portal as a placeholder (`id="section-clients"`). Replace its placeholder content with the full working implementation below.

---

### Architectural Decision — Client Editing Migration

**Per the Phase 5 design discussion: client editing moves from Profitability to Directory.**

Specifically:

1. **Directory** owns Add Client, Edit Client (name, status, contractStart, notes), Delete Client. These continue to write to the `GeckoClients` list — no change to the underlying schema.
2. **Profitability** becomes read-only for client metadata. The existing "Add Client" / Edit / Delete buttons in Profitability must be removed or replaced with a "Manage in Directory →" link that navigates to `clients`. The service-line CRUD inside each profitability card (Add/Edit/Delete service rows) is **untouched** — that stays in Profitability.

This means real (limited) edits to the existing Profitability module. Specifically:

- Remove the `prfOpenClientModal` button in the section head, OR replace it with a "Manage clients in Directory" navigation link
- Remove the per-card Edit-client / Delete-client buttons (the ones at the top of each expanded client card)
- Keep the per-card Add-service / Edit-service / Delete-service buttons exactly as they are
- The underlying functions (`prfOpenClientModal`, `prfSubmitClient`, `prfDeleteClient`, etc.) can stay in the file as orphaned code OR be cleanly removed — your call, but if removed, do it carefully and only after verifying no other code path calls them.

If unsure, **leave the Profitability functions in place but remove the UI hooks that call them**. That's the lowest-risk path. Add a comment explaining why they're orphaned (`// Phase 5: client CRUD moved to Directory; functions retained in case of rollback`).

---

### Layout — Hybrid (Table by Default, Card View Toggle)

The Directory has two view modes that the user can toggle between:

**Table view (default):**
- Sortable, dense, accountant-style
- Columns: Client Name | Status | Primary Contact | Email | Hours Remaining | Monthly Revenue | Actions
- Status as a coloured pill (matches Profitability colours: green Active / amber Winding / blue New)
- Hours Remaining as a coloured pill: **green ≥ 2h · amber 1–1.99h · red < 1h** (mirrors the SharePoint conditional formatting in the existing `Clients` list view)
- Monthly Revenue is the sum of that client's `GeckoServices.SellPerMonth` rows — matches what Profitability shows
- Actions: Edit / Delete buttons (icons), plus a "View in Profitability" jump button
- Sortable by clicking column headers (asc/desc toggle)

**Card view:**
- Grid of client cards (responsive: 3 columns desktop, 2 tablet, 1 mobile)
- Each card shows: avatar with initials (matching Profitability style), client name, status pill, primary contact + email, hours remaining pill, monthly revenue, and an "Edit / Delete / View Profitability" action row at the bottom
- Same source data, same sort options, just visually richer

Toggle between them via a two-button switcher (📋 Table | 🗃 Cards) in the section head, near the Refresh button. Remember the user's choice within the session (in `CLI` state — no need to persist to localStorage).

### Section Head Layout

```
CLIENT DIRECTORY
24 clients · 18 with active SSA · Synced 14:23

[+ Add Client]  [📋 Table | 🗃 Cards]  [🔄 Refresh]
```

Below the head: a search bar that filters by client name, primary contact, OR email (case-insensitive, debounced).

The search bar should be in its own toolbar row beneath the section head, similar to the Profitability filter row.

---

### Hours Remaining — Colour Logic

Three states based on the `Hours_x0020_Remaining2` value:

| Range | Colour | Meaning |
|---|---|---|
| ≥ 2.0 | green | Healthy buffer |
| 1.0 to 1.99 | amber | Time to flag |
| < 1.0 (incl. 0 or negative) | red | Urgent — needs invoicing or top-up |
| No SSA | muted (no pill) | Client isn't on an SSA agreement |

The number itself should also display (e.g. "5.5h" or "—"). The colour applies to a pill background containing the number.

If `HoursRemaining` is negative (which the screenshot shows happens — Access Instrumentation is at -2.75 used out of 10 = 12.75 remaining, but ALS is at -0.75 used = 10.75 remaining; Connect Data shows 1.0 in amber), trust the displayed `Hours_x0020_Remaining2` number directly — don't recompute it from `HoursPurchased - HoursUsed` (the SharePoint logic may include adjustments).

---

### Search Behaviour

Single search input, filters clients by:
- Client name (case-insensitive substring match)
- Primary contact name (case-insensitive substring match)
- Email (case-insensitive substring match)

OR-logic: a client matches if ANY of those fields contains the search term.

Debounced (~150ms) to avoid re-rendering on every keystroke.

---

### State Object

Follow the same pattern as `MIL`, `PRF`, `OVW`. Module-level object:

```javascript
const CLI = {
  initialised: false,
  loading:     false,
  siteId:      null,
  listIds:     { geckoClients: null, clients: null, services: null },
  geckoClients: [],   // [{ id, name, status, contractStart, notes }]
  ssaClients:   [],   // [{ id, name, primaryContact, email, hoursPurchased, hoursUsed, hoursRemaining, clientFolder }]
  services:     [],   // [{ clientName, sell }] — minimal, just for the Monthly Revenue column
  joined:       [],   // computed: union of geckoClients + ssaClients, joined by name
  view:         'table',  // 'table' | 'cards'
  search:       '',
  sortBy:       'name',   // 'name' | 'status' | 'hours' | 'revenue'
  sortDir:      'asc',
  lastSync:     null,
  modalConfirmFn: null
};
```

Prefix all functions with `cli` (e.g. `cliInit`, `cliRefresh`, `cliRender`, `cliJoin`, `cliOpenModal`).

---

### navTo Hook

In the existing `navTo()` function, add the equivalent lazy-load hook for `clients` (pattern matches Phases 2/3/4):

```javascript
if (sectionKey === 'clients' && typeof initClients === 'function') {
  initClients();
}
```

Place it next to the existing overview/mileage/profitability hooks.

---

### Graph API Calls Needed

Three lists to fetch in parallel via `Promise.all`:

```
GET /sites/{siteId}/lists/GeckoClients/items?expand=fields&$top=500
GET /sites/{siteId}/lists/Clients/items?expand=fields&$top=500
GET /sites/{siteId}/lists/GeckoServices/items?expand=fields&$top=2000
```

Resolve list IDs the same way Phase 3 and Phase 4 do — `GET /sites/{host}:{path}` then `GET /sites/{siteId}/lists?$select=id,displayName,name` then match by `displayName`.

For the `Clients` list specifically:
- Match by `displayName === 'Clients'` (NOT `GeckoClients`)
- When mapping the fields, use the exact internal names listed above — particularly `Hours_x0020_Remaining2` (this is the one most likely to trip you up; please read that field with that exact key)

CRUD operations (Add/Edit/Delete client) target `GeckoClients` ONLY. The `Clients` list is **read-only from this portal**.

---

### Quick Action Cross-Links

Both directions:
- **Directory → Profitability:** "View in Profitability" button on each row/card → calls `navTo('profitability')` and ideally scrolls to / opens that client's expanded card. The Profitability module's `PRF.openCards` Set already supports this — you can mutate it before navigation.
- **Profitability → Directory:** A small "Manage clients in Directory →" link in the Profitability section head (replacing the removed Add Client button) → calls `navTo('clients')`.

---

### CSS

Add a clearly labelled CSS block scoped to `#section-clients .cli-*`, following the Phase 4 pattern:

```css
/* ╔═══════════════════════════════════════════════════════════════════╗
   ║   CLIENT DIRECTORY SECTION                                        ║
   ╚═══════════════════════════════════════════════════════════════════╝ */
```

Reuse design tokens (`--green`, `--card`, etc.) — no hardcoded colours. Match the pill / table / card patterns already established in Profitability. The `.prf-mp-hi/md/lo` margin pill colour scheme is a perfect template for `.cli-hp-hi/md/lo` (hours remaining).

---

### Constraints — Do Not Touch

- **Do not modify** the `Clients` SharePoint list structure — read only
- **Do not modify** the Mileage section (CSS, HTML, JS)
- **Do not modify** the Overview section (Phase 4 just shipped — leave it alone)
- **Do not modify** the per-service CRUD inside Profitability cards
- The Mileage Philip filter fix (`milNormaliseDriver`) and all other completed work must be preserved
- All new code lives between clearly labelled `CLIENT DIRECTORY` comment blocks
- Permitted edits **outside** the Directory blocks:
  - Add the `navTo('clients')` lazy-load hook
  - Remove/replace the client-CRUD UI hooks in Profitability (the buttons only — leave the underlying functions in place with an explanatory comment)

---

### Definition of Done

- [ ] Navigating to Directory triggers a parallel fetch of `GeckoClients`, `Clients`, and `GeckoServices`
- [ ] Both lists join cleanly by name with no in-code mapping table needed (because pre-flight tidy-up was done)
- [ ] Table view shows all columns with correct data; sortable; default sort is by name asc
- [ ] Card view toggles cleanly with the same data; responsive grid
- [ ] Search filters by name, contact, OR email
- [ ] Hours Remaining pill colours: green ≥2 / amber 1–2 / red <1; muted "—" for non-SSA clients
- [ ] Negative HoursUsed values (Access Instrumentation, ALS, etc.) display correctly — trust the source value, don't recompute
- [ ] Status pill colours match Profitability: Active=green, Winding=amber, New=blue
- [ ] Add Client / Edit Client / Delete Client modals work, write to `GeckoClients`, update view in place
- [ ] "View in Profitability" cross-links work and open the right client's card
- [ ] Profitability section's client-CRUD UI is removed/replaced; service-CRUD untouched
- [ ] Refresh button re-fetches and re-renders
- [ ] Last sync time updates after each successful fetch
- [ ] Loading bar shows during fetch, hides after
- [ ] Error toast shown if any fetch fails; section shows error state
- [ ] Subsequent visits use cached data (no unnecessary re-fetch)
- [ ] All other sections still work correctly (Overview, Mileage, Profitability, placeholders)
- [ ] Design matches the established dark aesthetic — no off-brand colours or fonts

---

## Pre-Flight Checklist (DO BEFORE STARTING THIS PHASE)

**Do not start coding until all of these are confirmed.** Ask the user explicitly to confirm each item.

- [ ] **`Clients` list name tidy-up complete.** The following client names in the `Clients` list have been renamed to match `GeckoClients` exactly:
  - `CD Aluminium` → `CDA Ltd`
  - `CanCan Services` → `Can Can Services`
  - `H2o Homes` → `H2O Homes`
  - `Connect Data` → `Connect Data Services`
  - (Any other mismatches the user has spotted)
- [ ] **`SendTimesheets` workflow has been spot-checked** — confirmed that renaming the Title field doesn't break the workflow (workflows reference rows by ID, not by Title string, so renames should be safe — but worth a quick verification by clicking the button on a renamed row before relying on it)
- [ ] **The current `index.html` from the project root** has been read end-to-end so the existing patterns (state objects, helper signatures, modal patterns from Profitability, design system) are understood
- [ ] **The Phase 4 OVW module is understood** as the most recent reference — its Promise.all parallel-fetch pattern, its render flow, and its scoping convention (`#section-overview .ovw-*`) are the templates to follow

If any of these are not confirmed, stop and ask before writing any code.

---

## Implementation Approach (Suggested)

To keep the build manageable, suggest tackling it in this order during the chat:

1. **Read the current `index.html`** — identify the placeholder section, confirm helpers, locate where to insert the navTo hook
2. **Confirm pre-flight items** — explicitly ask the user
3. **Build the data layer first** — `CLI` state, list resolution, three loaders, the join function. Test with a temporary `console.log` of the joined data structure before building any UI.
4. **Build the table view** — sortable columns, hours pill, status pill, search filter
5. **Build the card view + toggle** — same data, different render function
6. **Build the modals** — Add Client / Edit Client / Delete Client (mirror the Profitability modal pattern but slimmer; same fields)
7. **Cross-link work** — "View in Profitability" plumbing both directions
8. **Profitability surgery** — remove client-CRUD UI hooks, add the "Manage in Directory" link
9. **Final QA pass** — manually walk through the Definition of Done checklist before outputting the file

---

## Style Reminders

- The user (Jack) is a hands-on engineer — clear, professional code, future-proofing comments where the architecture might be non-obvious to a future reader (especially the two-list join)
- Emojis replaced with inline stroke-based SVGs throughout (consistent with previous phases)
- No frameworks, no build steps — vanilla HTML/CSS/JS
- Single `index.html` output to `/mnt/user-data/outputs/index.html`
- Brace-balanced, syntax-checked before delivery (run `node --check` on the extracted JS as Phase 4 did)

---

*Phase 5 of 6. Portal build started April 2026. Current `index.html` should be attached at the start of the chat alongside the project files.*
