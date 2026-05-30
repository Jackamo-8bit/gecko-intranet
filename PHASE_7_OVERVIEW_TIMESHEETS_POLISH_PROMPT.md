# PHASE 7 BUILD PROMPT — Overview Integration & Timesheets Polish
## Gecko IT Services — Intranet Portal

---

Copy and paste everything below into a new Claude chat (within the Gecko Intranet Portal project).

---

I'm continuing the build of the Gecko IT Services internal portal (`index.html`, attached). Please read the project files (`GECKO_INTRANET_PORTAL_BLUEPRINT.md`, `MILEAGE_TRACKER_PROJECT_SUMMARY.md`) and the current `index.html` end-to-end before starting.

This phase covers two things: integrating Timesheets data into the Home Overview dashboard, and polishing the Timesheets section based on real-world usage since the Phase 6 launch.

---

## Current Build Status

| Phase | Section | Status |
|---|---|---|
| Phase 1 | Portal Shell | ✅ Complete |
| Phase 2 | Mileage Tracker | ✅ Complete |
| Phase 3 | Client Profitability | ✅ Complete |
| Phase 4 | Home Overview | ✅ Complete — KPI cards, per-driver mileage, P&L summary, quick actions |
| Phase 5 | Client Directory | ✅ Complete — table/card views, SSA hours, search, CRUD |
| Phase 5.5 | Mileage Claimed Status | ✅ Complete — KPIs show unclaimed totals, bulk-claim mode, CSV export |
| Phase 6 | Timesheets | ✅ Complete — log time, SSA dashboard, weekly summary, edit/delete |
| **Phase 7** | **Overview Integration & Polish** | 🔲 **This session** |
| Phase 8+ | Compliance / Settings | 🔲 Placeholders only |

---

## Azure / Auth — No Changes

- Application (Client) ID: `c41290c7-3747-4fc3-8e79-c452a7cab1f7`
- Directory (Tenant) ID: `e508283a-b42d-4afa-bdc2-eb16dcd9933d`
- SharePoint host: `geckoitservices812.sharepoint.com`
- SharePoint site: `/sites/GeckoITClientPortal`
- Scope: `Sites.ReadWrite.All` — already covers all lists
- Auth is shared. No changes needed for Phase 7.

---

## Key Learnings from Phase 6 (READ BEFORE STARTING)

These are hard-won discoveries from the Phase 6 build. They apply to any further work on the Timesheets list.

### 1. The `Timesheets` SharePoint list schema is NOT what the Phase 6 prompt assumed

The list was already created (not new), with different column names and types. The actual schema:

| Display Name | Internal Name (Graph API) | Type | Notes |
|---|---|---|---|
| Title | `Title` | Text | Short description — often empty; `WorkDescription` is the primary content |
| Client | `ClientLookupId` | Lookup → Clients list | **Lookup column.** Graph returns the ID only, not the display name. Must be resolved against the Clients list items by matching `ClientLookupId` to item IDs. |
| Date | `Date` | Date and Time | When the work was done |
| Engineer | `Engineer` | Choice | `Philip` / `Jack` / `System` |
| Hours Spent | `HoursSpent` | Number | Duration in hours (decimal) |
| Work Description | `WorkDescription` | Multiple lines | The actual work log — primary description field |
| Work Type | `Work_x0020_Type` | Choice | `Remote Support` / `Onsite Support` / `Project Work` / `Maintenance` / `Misc` / `PC Set Up` |
| ATERA Ticket ID | `ATERATicketID` | Number | Optional — links to Atera PSA |
| Internal Notes | `InternalNotes` | Multiple lines | Optional — private notes |
| Archived | `Archived` | Yes/No | Archived entries are filtered out of the portal view |

### 2. Graph API does NOT return the `Work_x0020_Type` Choice column

**This is the single most important known issue.** The `Work_x0020_Type` field is confirmed to exist (visible in SharePoint UI, confirmed via the Graph `/columns` endpoint, and writable via POST/PATCH). However, **Graph API does not return it in any read operation** — not in bulk `$expand=fields`, not in individual `/items/{id}/fields`, not with `$select`. This appears to be a SharePoint/Graph bug or quirk with certain Choice columns, possibly related to how the column was created (site column, content type inheritance, or similar).

**Current workaround:** Work Type is written to SharePoint when entries are created via the portal, but reading it back isn't possible. The Work Type column in the portal's Recent Entries table shows blank for all entries. This is accepted as a known limitation.

**Possible future fix:** Add a second plain-text column (e.g. `WorkTypeText`) that mirrors the Choice value. The portal would write to both columns on create/edit, and read from the text column (which Graph DOES return). This would require creating the new column in SharePoint first.

### 3. Client column is a Lookup — requires name resolution

The `Client` column is a Lookup to the `Clients` list. Graph returns `ClientLookupId` (a number — the SP item ID in the Clients list) but does NOT return the display name inline. The portal resolves client names by:
1. Loading both `Timesheets` entries and `Clients` list items in parallel
2. After both complete, running `tshResolveClientNames()` which maps `ClientLookupId` → client name using the Clients list item IDs

### 4. Graph paginates at ~100 items per page

Even with `$top=2000`, Graph returns max ~100 items per page. The `tshLoadEntries()` function follows `@odata.nextLink` to load all pages. The `tshLoadSsaClients()` function typically fits in one page (< 30 clients).

### 5. The list is called `Timesheets` (not `GeckoTimesheets`)

Resolved by `displayName === 'Timesheets'` in `tshResolveListIds()`.

---

## SharePoint Lists — Reference

### `Timesheets` (Phase 6 — read/write)

See schema above. The portal creates entries via POST, edits via PATCH, and deletes via DELETE. The `Archived` field is not used by the portal (it's a Power Automate workflow flag) — the portal filters out `Archived: true` entries.

### `Clients` (pre-existing — read for SSA data; PATCH `HoursUsed` only)

| Display name | Internal name | Type | Notes |
|---|---|---|---|
| Client Name | `Title` | Text | Matches `GeckoClients.Title` |
| Hours Purchased | `HoursPurchased` | Number | SSA bucket size |
| Hours Used | `HoursUsed` | Number | Cumulative hours logged |
| Hours Remaining | `Hours_x0020_Remaining2` | Number | **⚠️ Weird internal name** — `_x0020_` is encoded whitespace, trailing `2` from a rename |
| Primary Contact | `PrimaryContact` | Text | Contact name |
| Email | `Email` | Text | Primary contact email |
| Client Folder | `ClientFolder` | Text | Used by SendTimesheets workflow |

### `MileageJourneys`, `MileageClients`, `GeckoClients`, `GeckoServices`

No changes from previous phases. See blueprint and Phase 5 prompt for details.

---

## What to Build — Phase 7

### Part A: Overview Dashboard — Timesheets KPI Integration

The Home Overview section (Phase 4) currently shows mileage KPIs, P&L summary, and quick actions. Add **two new KPI cards** to surface Timesheets data:

**KPI Card 1 — "Hours Logged This Week"**
- Pulls from `TSH.entries` (if loaded) or fetches directly from the Timesheets list
- Shows total hours logged by all engineers for the current week (Monday–Sunday)
- Sub-text: per-engineer breakdown (e.g. "Philip: 4.5h · Jack: 8.25h")
- Accent colour: same as other KPI cards

**KPI Card 2 — "SSA Clients At Risk"**
- Pulls from `TSH.ssaClients` (if loaded) or fetches from the Clients list
- Shows count of SSA clients with Hours Remaining < 2.0 (the amber/red threshold from Phase 5/6)
- Sub-text: names of the top 3 most urgent clients (lowest hours remaining)
- If no clients at risk, show "All healthy" in green

**Implementation approach:**
- The Overview module (`OVW`) currently loads from `MileageJourneys`, `GeckoServices`, and `GeckoClients`. It will need to additionally load from `Timesheets` and `Clients`.
- If the Timesheets or Clients data is already loaded by the TSH module, reuse it (check `TSH.initialised`). If not, fetch independently — don't force the user to visit Timesheets first.
- Add the new list IDs to `OVW.listIds` and the resolution logic to `ovwResolveListIds()`.
- The existing Overview KPI cards use a grid layout — the new cards should slot in naturally.

**Quick action addition:**
- Add a "Log Time" quick-action button alongside the existing ones (Add Journey, Add Client). This navigates to the Timesheets section via `navTo('timesheets')`.

---

### Part B: Timesheets Polish

Based on real-world usage since Phase 6 launched, apply the following improvements:

**1. Work Type text column workaround (if confirmed by user)**

If the user has created a `WorkTypeText` plain-text column on the Timesheets list:
- Read `WorkTypeText` instead of (or in addition to) `Work_x0020_Type`
- Write to BOTH `Work_x0020_Type` (the original Choice column) and `WorkTypeText` (the mirror) on create and edit
- This lets the portal display Work Type in the Recent Entries table

**Pre-flight:** Ask the user if they've created this column before implementing. If not, skip this item.

**2. Client dropdown — show client names, not IDs**

The client dropdown in the Log Time form uses the Clients list item ID as the `<option>` value and the client name as the display text. Verify this is working correctly after Phase 7 changes. The `ClientLookupId` written to the Timesheets list must match the SP item ID, not the client name string.

**3. Weekly Summary — include Work Type breakdown**

In the Weekly Summary tab, add a per-Work-Type breakdown within each week block (e.g. "Remote Support: 6.5h · Project Work: 3h · Onsite Support: 2h"). This only works for entries that have Work Type set — show "Uncategorised: Xh" for entries without it.

**4. Review existing entries for negative hours display**

The Timesheets list contains "Credit" entries with negative hours (e.g. "Credit - 10 Hours" at -10h). Ensure these display correctly in:
- The Recent Entries table (hours column — should show as negative, e.g. "-10h")
- The Weekly Summary (should subtract from the week's total)
- The SSA Dashboard (the credit entries shouldn't increment HoursUsed — they're system adjustments)

---

### Part C: Settings Section (Optional — Time Permitting)

If Parts A and B are complete and stable, replace the Settings placeholder with a basic portal information panel showing:

- Signed-in user name and email
- Azure App Registration info (Client ID, Tenant ID — read-only display)
- SharePoint site URL
- List of all SharePoint lists the portal accesses, with their resolved IDs
- Portal version / build date
- A "Clear cache & sign out" button (clears localStorage and signs out)

This is a nice-to-have, not a requirement. Skip if it risks destabilising the build.

---

## Constraints — Do Not Touch

- **Do not modify** the Mileage section (CSS, HTML, JS) — including Phase 5.5 claimed-status code
- **Do not modify** the Client Directory section (Phase 5)
- **Do not modify** the Profitability section (Phase 3)
- **Do not modify** the Timesheets section's core CRUD or data loading logic unless specifically fixing an issue listed above
- All `milNormaliseDriver`, `cliJsAttr`, `tshResolveClientNames` and other existing functions must be preserved
- The `Clients` list is **structurally read-only** from this portal — only PATCH `HoursUsed`, never create/delete rows
- Permitted edits outside new code blocks:
  - Add new list IDs and loaders to the OVW module
  - Add new KPI cards to the Overview section HTML
  - Add the "Log Time" quick action
  - Minor fixes to TSH rendering (Work Type display, negative hours)

---

## Module Pattern Reference

| Section | State object | Function prefix | Init function | CSS scope |
|---|---|---|---|---|
| Overview | `OVW` | `ovw` | `initOverview()` | `#section-overview .ovw-*` |
| Profitability | `PRF` | `prf` | `initProfitability()` | `#section-profitability .prf-*` |
| Mileage | `MIL` | `mil` | `initMileage()` | `#section-mileage .mil-*` |
| Clients | `CLI` | `cli` | `initClients()` | `#section-clients .cli-*` |
| Timesheets | `TSH` | `tsh` | `initTimesheets()` | `#section-timesheets .tsh-*` |

---

## Definition of Done

### Part A — Overview Integration
- [ ] "Hours Logged This Week" KPI card displays on the Overview dashboard
- [ ] Per-engineer breakdown shows in the card's sub-text
- [ ] "SSA Clients At Risk" KPI card shows count and names of clients with < 2h remaining
- [ ] Both cards load data independently (don't require visiting Timesheets first)
- [ ] "Log Time" quick action button navigates to the Timesheets section
- [ ] Overview refresh updates the new KPI cards alongside existing ones

### Part B — Timesheets Polish
- [ ] Work Type displays in Recent Entries (if `WorkTypeText` column exists — confirm with user)
- [ ] Weekly Summary includes Work Type breakdown per week
- [ ] Negative hours (credit entries) display correctly across all views
- [ ] No regressions in existing Timesheets functionality (log, edit, delete, SSA dashboard)

### Part C — Settings (Optional)
- [ ] Settings section shows portal info and signed-in user details
- [ ] "Clear cache & sign out" button works

### General
- [ ] All other sections still work correctly
- [ ] Design matches the established dark aesthetic
- [ ] JS syntax-checked (`node --check` on extracted script)
- [ ] Brace/tag balance verified

---

## Pre-Flight Checklist (DO BEFORE STARTING THIS PHASE)

**Do not start coding until all of these are confirmed.** Ask the user explicitly to confirm each item.

- [ ] **The current `index.html` from the repo root** has been attached to this chat
- [ ] **Confirm whether `WorkTypeText` column has been created** on the Timesheets SharePoint list (plain text column mirroring the Work Type choice). If not, the Work Type display fix will be skipped.
- [ ] **Confirm whether any other issues have been noticed** since Phase 6 launched (bugs, missing data, layout problems on mobile, etc.)

---

## Implementation Approach (Suggested)

1. **Read the current `index.html`** — identify the OVW module structure, confirm TSH module state
2. **Confirm pre-flight items** — especially the WorkTypeText column
3. **Part A first** — Overview KPI integration (smaller, self-contained)
4. **Part B second** — Timesheets polish items
5. **Part C last** — Settings (only if time permits)
6. **Final QA pass** — walk through Definition of Done, run `node --check`, brace-balance check

---

## Style Reminders

- Emojis replaced with inline stroke-based SVGs throughout
- No frameworks, no build steps — vanilla HTML/CSS/JS
- Single `index.html` output to `/mnt/user-data/outputs/index.html`
- Module pattern: state objects, prefixed functions, lazy-loaded via `init*()` in `navTo()`
- CSS scoped to section IDs to avoid bleed
- Brace-balanced, syntax-checked before delivery

---

*Phase 7. Portal build started April 2026. Current `index.html` should be attached at the start of the chat alongside the project files.*
