# PHASE 4 BUILD PROMPT — Home Overview Section
## Gecko IT Services — Intranet Portal

---

Copy and paste everything below into a new Claude chat (within the Gecko Intranet Portal project).

---

I'm continuing the build of the Gecko IT Services internal portal (`index.html`, attached). Please read the project files (GECKO_INTRANET_PORTAL_BLUEPRINT.md, MILEAGE_TRACKER_PROJECT_SUMMARY.md) and the current `index.html` before starting.

---

## Current Build Status

| Phase | Section | Status |
|---|---|---|
| Phase 1 | Portal Shell | ✅ Complete — auth, sidebar, navigation, toast, loading bar |
| Phase 2 | Mileage Tracker | ✅ Complete — full tracker ported, dark theme, shared auth. Philip filter bug fixed. |
| Phase 3 | Client Profitability | ✅ Complete — live SharePoint data, expandable client cards, Xero reconciliation |
| **Phase 4** | **Home Overview** | 🔲 **This session** |
| Phase 5 | Client Directory | 🔲 Planned |
| Phase 6+ | Timesheets / Compliance | 🔲 Placeholders only |

---

## SharePoint Lists — Current State

All four lists are created and working:

| List | Used By | Status |
|---|---|---|
| MileageJourneys | Mileage Tracker | ✅ Live data |
| MileageClients | Mileage Tracker | ✅ Live data |
| GeckoClients | Profitability | ✅ Live data |
| GeckoServices | Profitability | ✅ Live data |

**No new SharePoint lists are needed for Phase 4.** The Home Overview reads from the existing four lists.

---

## Azure / Auth

- Application (Client) ID: `c41290c7-3747-4fc3-8e79-c452a7cab1f7`
- Directory (Tenant) ID: `e508283a-b42d-4afa-bdc2-eb16dcd9933d`
- SharePoint host: `geckoitservices812.sharepoint.com`
- SharePoint site: `/sites/GeckoITClientPortal`
- Scope: `Sites.ReadWrite.All`
- Auth is shared — sign in once, all sections use the same token. No changes needed to auth for this phase.

---

## What to Build — Phase 4: Home Overview

The Overview section is the landing page of the portal. It should give Philip and Jack a live at-a-glance summary of the business without having to navigate into each individual section. It pulls read-only summary data from SharePoint — no writes happen from this section.

The section already exists in the portal as a placeholder (`id="section-overview"`). Replace its placeholder content with the full working implementation described below.

---

### Data to Pull and Display

#### 1. Mileage This Month
- Source: `MileageJourneys` SharePoint list
- Filter: journeys where `JourneyDate` falls within the current calendar month
- Display:
  - Combined total miles this month (Philip + Jack)
  - Combined reimbursement amount this month (Philip + Jack)
  - Per-driver split: Philip's miles / amount, Jack's miles / amount
  - Journey count this month

#### 2. Revenue Summary
- Source: `GeckoServices` SharePoint list
- Display:
  - Total monthly sell price across all services (`SellPerMonth` summed)
  - Total monthly cost across all services (`CostPerMonth` summed)
  - Gross profit (sell minus cost)
  - Overall margin % ((sell - cost) / sell × 100)
- Note: these are static monthly figures from the services list — not time-series data. Just sum all rows.

#### 3. Client Count
- Source: `GeckoClients` SharePoint list
- Display:
  - Total active clients (where `Status` = `Active`)
  - Total clients including winding/new (all rows)

#### 4. Quick Action Buttons
- **Add Journey** — clicking this should navigate to the Mileage section (`navTo('mileage')`) and ideally scroll to / focus the add journey form
- **View Profitability** — clicking this should navigate to the Profitability section (`navTo('profitability')`)

---

### UI Layout

The section should follow the established portal design system exactly. Key design rules:

- Dark background (`var(--dark)`), card background (`var(--card)`)
- Green accent (`var(--green)`) for positive/revenue numbers, red (`var(--red)`) for costs, standard white for neutral
- `Barlow Condensed` font for all numbers and headings
- `Instrument Sans` for body/labels
- Card border-radius: `14px`, subtle green border
- Status pills: rounded, coloured background with matching text

**Suggested layout — top row of KPI cards:**

```
[ This Month's Mileage ]  [ Monthly Revenue ]  [ Active Clients ]  [ Gross Profit ]
```

Each KPI card should show:
- A large primary number (Barlow Condensed, ~28–32px, coloured)
- A short label below it (small, muted, uppercase)
- A secondary line with supporting detail (e.g. "Philip £xx · Jack £xx", or "xx% margin")

**Below the KPI row:**

A two-column detail area:

- **Left — Mileage breakdown card**: per-driver mileage table for this month. Columns: Driver | Miles | Amount. Show both Philip and Jack even if one has zero journeys this month.
- **Right — Revenue breakdown card**: top-level P&L table. Rows: Revenue | Cost | Gross Profit | Margin %. Keep it simple — just the summary figures, not a per-client breakdown (that's what the Profitability section is for).

**Below that:**

A quick actions card with two buttons side by side:
- `+ Add Journey` (primary green button) → `navTo('mileage')`
- `📊 View Profitability` (ghost button) → `navTo('profitability')`

**Section header:**

```
OVERVIEW
Live summary · Updated [time]
```

Include a small refresh button (matching the mileage section style) that re-fetches all three data sources and re-renders.

---

### Loading Behaviour

- On first navigation to Overview (`navTo('overview')`), call `initOverview()` — lazy-load pattern matching Phase 2 and 3.
- Show the shared `showLoading(true)` spinner while fetching.
- Fetch all three lists in parallel using `Promise.all([...])`.
- Use `graphFetch()` for all Graph API calls — this is already defined in the portal.
- On error, show a toast (`toast('Could not load overview data', 'error')`) and leave cards showing `—`.
- On subsequent visits, use cached data (don't re-fetch unless the user hits refresh).

---

### Graph API Calls Needed

Use the same pattern as the Mileage and Profitability sections. The site ID will already be resolved if either section has been visited — but Overview should resolve it independently via the same `CONFIG.SP_HOST` and `CONFIG.SP_SITE` constants if needed.

```
GET /sites/{siteId}/lists/MileageJourneys/items?expand=fields&$top=2000
GET /sites/{siteId}/lists/GeckoServices/items?expand=fields&$top=500
GET /sites/{siteId}/lists/GeckoClients/items?expand=fields&$top=500
```

For mileage this month: filter client-side after fetching all journeys (same approach used in the mileage tracker's monthly summary tab — don't rely on OData `$filter` for date comparisons as it can be unreliable with SharePoint's date format).

---

### State Object

Follow the same pattern as `MIL` (mileage) and `PROF` (profitability). Scope all state to a module-level object:

```javascript
const OVW = {
  initialised: false,
  loading:     false,
  siteId:      null,
  journeys:    [],
  services:    [],
  clients:     [],
  lastSync:    null
};
```

Prefix all Overview functions with `ovw` (e.g. `ovwInit`, `ovwRefresh`, `ovwRender`).

---

### navTo Hook

In the existing `navTo()` function, there is already a lazy-load hook for `mileage` and `profitability`. Add the equivalent for `overview`:

```javascript
if (sectionKey === 'overview' && typeof initOverview === 'function') {
  initOverview();
}
```

The Overview section should also be the **default section on login** — when the user signs in and the portal loads, it should start on Overview rather than whichever section is currently default.

---

### CSS

Add a clearly labelled CSS block for the Overview section, following the existing comment block pattern:

```css
/* ╔═══════════════════════════════════════════════════════════════════╗
   ║   HOME / OVERVIEW SECTION                                         ║
   ╚═══════════════════════════════════════════════════════════════════╝ */
```

Keep Overview styles scoped with `#section-overview` prefix where possible to avoid bleed into other sections.

---

### Constraints — Do Not Touch

- **Do not modify** the Mileage section (CSS, HTML, JS) — Phase 2 is complete and the Philip filter bug has been fixed
- **Do not modify** the Profitability section — Phase 3 is complete
- **Do not modify** the portal shell, auth, sidebar, or toast/loading components
- The fix to `milNormaliseDriver` and `milRenderLog`/`milRenderKpis` in the attached `index.html` must be preserved exactly as-is
- All changes should live between the Overview section comment blocks
- The `navTo('overview')` hook addition and the default section change on login are the only permitted edits outside the Overview section blocks

---

### Definition of Done

- [ ] Navigating to Overview triggers a data fetch from all three SharePoint lists
- [ ] KPI cards show: this month's combined miles, this month's combined reimbursement, total monthly revenue, active client count
- [ ] Mileage breakdown card shows per-driver split for current month
- [ ] Revenue breakdown card shows revenue / cost / profit / margin
- [ ] Quick action buttons navigate correctly
- [ ] Refresh button re-fetches and re-renders
- [ ] Last sync time updates after each successful fetch
- [ ] Loading spinner shows during fetch, hides after
- [ ] Error toast shown if any fetch fails
- [ ] Subsequent visits to Overview use cached data (no unnecessary re-fetch)
- [ ] Overview is the default section shown after sign-in
- [ ] All other sections (Mileage, Profitability, placeholders) still work correctly
- [ ] Design matches the established dark aesthetic — no off-brand colours or fonts

---

*Phase 4 of 6. Portal build started April 2026. Current file attached.*
