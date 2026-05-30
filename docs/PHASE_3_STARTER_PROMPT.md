# PHASE 3 STARTER PROMPT
## Gecko IT Services — Intranet Portal: Client Profitability Section

---

Copy and paste everything below into a new Claude chat (within the Gecko Intranet Portal project).

---

I'm building a unified internal web portal for Gecko IT Services, a small two-person IT company (Philip Morris and Jack Morris). The project files contain the full blueprint (`GECKO_INTRANET_PORTAL_BLUEPRINT.md`) and mileage tracker reference (`MILEAGE_TRACKER_PROJECT_SUMMARY.md`) — please read both before starting.

**Where we are:**
- **Phase 1 (Portal Shell) — ✅ Complete.** Single `index.html` on GitHub Pages with dark design system, MSAL auth, sidebar navigation, and section switching. Hosted at `https://jackamo-8bit.github.io/gecko-intranet/`.
- **Phase 2 (Mileage Tracker) — ✅ Complete.** The mileage tracker is fully ported into the portal's Mileage section. It uses the portal's shared `getToken()`, `graphFetch()`, `toast()`, and `showLoading()` helpers. Lazy-loads on first nav to the section. Reads/writes to `MileageJourneys` and `MileageClients` in SharePoint. All four tabs (Journey Log, Client Distances, Monthly Summary, Export/HMRC) are working.
- **Phase 3 (Client Profitability) — 🔲 Today's task.**

The current `index.html` is attached. Please read it carefully before starting — it contains the existing portal structure, all shared helpers, and the `// /* ═══ PROFITABILITY INIT ═══ */` and `/* /* ═══ PROFITABILITY SECTION STYLES ═══ */` markers that are the insertion points for this phase.

---

## Architecture reminders

- **Single HTML file.** All CSS goes in the marked `PROFITABILITY SECTION STYLES` block inside the `<style>` tag. All JS goes in the `PROFITABILITY INIT` block inside the `<script>` tag. All HTML goes inside `<section id="section-profitability">`. Do not touch any other section.
- **Shared helpers — use these, don't reinvent them:**
  - `getToken()` — async, returns a Bearer token for Graph API calls
  - `graphFetch(path, options)` — wraps fetch with auth + error handling; `path` can be a relative Graph path or full URL
  - `toast(message, type, ms)` — shows a notification. Types: `'success'`, `'error'`, `'info'`, `'warning'`
  - `showLoading(true/false)` — toggles the top-of-page loading bar
  - `escapeHtml(s)` — sanitises strings before injecting into innerHTML
  - `CONFIG.SP_HOST`, `CONFIG.SP_SITE`, `CONFIG.GRAPH_BASE` — SharePoint coordinates
- **Lazy load** — wire `initProfitability()` to be called from `navTo()` on first navigation to the section (exactly as `initMileage()` is wired for Mileage). Subsequent visits use cached data. Include a Refresh button in the section header.
- **Design system** — use the portal CSS variables exclusively (`--card`, `--green`, `--border`, etc.). Barlow Condensed for headers and numbers, Instrument Sans for body. Scope all new CSS class names with a `prf-` prefix to avoid collisions with other sections.

---

## Azure / SharePoint details (already configured)

- **Application (Client) ID:** `c41290c7-3747-4fc3-8e79-c452a7cab1f7`
- **Directory (Tenant) ID:** `e508283a-b42d-4afa-bdc2-eb16dcd9933d`
- **SharePoint host:** `geckoitservices812.sharepoint.com`
- **SharePoint site:** `/sites/GeckoITClientPortal`
- **Scope:** `Sites.ReadWrite.All` (already granted)

---

## SharePoint lists for this phase

Both lists need to be created in SharePoint **before starting the build**. I will create them manually before this chat begins. The columns are:

### GeckoClients
| Column name | Type | Notes |
|---|---|---|
| Title | Single line of text | The client name (built-in SharePoint column) |
| Status | Choice | Options: `Active`, `Winding`, `New` |
| ContractStart | Date | Date only, no time |
| Notes | Multiple lines of text | Internal notes |

### GeckoServices
| Column name | Type | Notes |
|---|---|---|
| Title | Single line of text | Service name (built-in SharePoint column) |
| ClientName | Single line of text | Must match a GeckoClients Title exactly |
| Category | Choice | Options: `stack`, `m365`, `hosting`, `retainer`, `other` |
| CostPerMonth | Number | Decimal, 2dp |
| SellPerMonth | Number | Decimal, 2dp |
| Notes | Single line of text | e.g. "11× Std + 1× EX2" |

**Important:** Link clients to services via `ClientName` (plain text match against `GeckoClients.Title`). Do not use SharePoint lookup columns — they add complexity for no gain when read via Graph API.

---

## What to build

### Section UI

Replace the current `<section id="section-profitability">` placeholder with the full profitability dashboard. Model it on `gecko_dashboard_2.html` (Philip's standalone prototype, available in the project files), but adapted to:

1. **Read live data from SharePoint** instead of the hardcoded JS object in the prototype
2. **Support add / edit / delete** for both clients and services (the prototype was read-only)
3. **Fit inside the portal section panel** (no standalone header, no sticky top bar — those belong to the portal shell)
4. **Use shared helpers** rather than its own fetch/toast/loading logic

### Specific features to implement

**Summary strip** — a row of KPI tiles at the top of the section (matching the prototype's `sum-strip`):
- Active client count
- Total stack revenue (sum of all SellPerMonth)
- Total stack cost (sum of all CostPerMonth)
- Gross profit (revenue − cost)
- Overall margin %
- Total retainer revenue
- Total Xero billing (from the XeroActual field — see below)

**Filter bar** — filter buttons: All / Stack / M365 / Hosting / Retainers / Other. Search box to filter by client name.

**Expand All / Collapse All** buttons.

**Client cards** — one expandable card per client (matching the prototype design):
- Collapsed: avatar initials, client name, status badge (Active / Winding Down / New), Cost / Revenue / Profit numbers, margin % pill
- Expanded: service line table (Category pill, Service name, notes, Cost/mo, Sell/mo, Margin £, Margin %)
  - Services with `cat = 'retainer'` shown first with a purple retainer notice banner ("Retainer revenue — product cost £0. Labour cost not allocated.")
  - Services with `sell = 0` and `cost = 0` shown as "Pending setup" rather than £0.00
  - Client total row at the bottom of the table (bold, green-tinted background)
- **Xero reconciliation row** — below the total row inside each expanded card:
  - Shows the calculated total from services
  - Input field for actual Xero invoice amount (ex VAT) — stored in a `XeroActual` field in `GeckoClients` (add this column: Number type, optional)
  - Status indicator: ✓ Match (within £0.50) / ~ Close (within £5) / ✕ Mismatch (> £5) — updates live as user types, saves to SharePoint on blur
- **Edit client** — pencil icon on card header opens an inline edit form (status, notes, contract start)
- **Add service** — plus icon on expanded card opens an inline form to add a new service row
- **Edit service** — pencil icon on each service row for inline editing (name, category, cost, sell, notes)
- **Delete service** — bin icon with confirm modal
- **Delete client** — bin icon on card header with confirm modal (warn that all associated services will also be deleted)

**Add new client** — a button at the top of the section (or in the section header row) that opens a modal or inline form: client name, status, contract start, notes.

**Grand total row** — below all client cards:
- Total cost, total revenue, gross profit, overall margin %, total retainer revenue, total Xero billing

**Refresh button** — in the section head, same pattern as the Mileage section's refresh button.

### Category colour coding (match the prototype exactly)
- `stack` — green (`--green-glow` background, `--green` text)
- `m365` — blue (`--blue-dim` background, `--blue` text)
- `hosting` — teal (`--teal-dim` background, `--teal` text)
- `retainer` — purple (`--purple-dim` background, `--purple` text)
- `other` — yellow (`rgba(255,204,51,0.1)` background, `#ffcc33` text)

### Margin % pill colours (match the prototype exactly)
- ≥ 70% — green pill
- 40–69% — amber pill
- < 40% — red pill

---

## Data loading strategy

Same pattern as the Mileage section:

1. Resolve site ID and list IDs on first load (cache them in module state)
2. Load `GeckoClients` and `GeckoServices` in parallel (`Promise.all`)
3. Join them client-side: for each client, filter services where `ClientName === client.Title`
4. Cache everything in a module-level `PRF` state object
5. Re-render from cache on subsequent section visits
6. Manual refresh button reloads from SharePoint

Graph API URLs follow the same pattern as the mileage tracker:
- `GET /sites/{siteId}/lists/{listId}/items?expand=fields&$top=500`
- `POST /sites/{siteId}/lists/{listId}/items` (body: `{ fields: { ... } }`)
- `PATCH /sites/{siteId}/lists/{listId}/items/{itemId}/fields` (body: `{ fieldName: value }`)
- `DELETE /sites/{siteId}/lists/{listId}/items/{itemId}`

---

## Seeding initial data

The `GeckoClients` and `GeckoServices` lists will be empty when first created. The section should detect this on first load and offer to seed the data from the existing hardcoded dataset in `gecko_dashboard_2.html` (which is included in the project files and contains the full current client/service list as of April 2026).

Implement this as a **one-time seed function** — if both lists are empty on first load, show a prompt or toast offering to seed. The seed data is the complete client list from the prototype. Do not auto-seed silently — ask first, because Philip may want to enter data manually.

The full dataset to use as seed data (from `gecko_dashboard_2.html`) is:

```javascript
// This is the reference data. Use it ONLY for the first-run seed prompt.
// After seeding, all data lives in SharePoint. Never hardcode this into the live rendering path.
const SEED_DATA = [
  { client: { name:'ALS Locksmiths',                status:'Active' }, services: [
    { name:'Internet Security',       cat:'stack',    sell:46.98,  cost:3.49,  note:'1 workstation' },
    { name:'M365 Reselling',          cat:'m365',     sell:184.95, cost:109.63,note:'11× Std + 1× Additional Mailbox' },
    { name:'Wix Platform',            cat:'stack',    sell:17.00,  cost:0.00,  note:'Pass-through' },
    { name:'Web Hosting',             cat:'hosting',  sell:16.58,  cost:0.67,  note:'alslocksmiths.co.uk — £199/yr' }]},
  { client: { name:'Brazier Interiors',             status:'Active' }, services: [
    { name:'Internet Security',       cat:'stack',    sell:14.25,  cost:6.00,  note:'IS only' },
    { name:'Web Hosting — RAMHLTD',   cat:'hosting',  sell:10.42,  cost:0.67,  note:'ramhltd.co.uk — £125/yr' },
    { name:'Web Hosting — purdeypups',cat:'hosting',  sell:8.25,   cost:1.08,  note:'purdeypups.com — £99/yr' }]},
  { client: { name:'Can Can Services',              status:'Active' }, services: [
    { name:'Internet Security',       cat:'stack',    sell:9.00,   cost:3.49,  note:'2 seats @ £4.50 each' },
    { name:'M365 Reselling',          cat:'m365',     sell:52.50,  cost:28.75, note:'3× Std + 2× EX1' },
    { name:'Web Hosting',             cat:'hosting',  sell:16.58,  cost:1.58,  note:'cancanservices.co.uk — £199/yr' }]},
  { client: { name:'CDA Ltd',                       status:'Active' }, services: [
    { name:'Internet Security',       cat:'stack',    sell:75.12,  cost:3.49,  note:'1 WS + Webroot' },
    { name:'Cloud Backup',            cat:'stack',    sell:35.00,  cost:3.49,  note:'1 workstation' },
    { name:'M365 Reselling',          cat:'m365',     sell:122.69, cost:73.99, note:'7× Std + 1× EX2' },
    { name:'Password Keeper',         cat:'stack',    sell:25.00,  cost:10.30, note:'5 seats' },
    { name:'Web Hosting / Domain',    cat:'hosting',  sell:14.50,  cost:0.00,  note:'cdaluminium.uk.com — £174/yr' }]},
  { client: { name:'Clarke Lane Engineering',       status:'Active' }, services: [
    { name:'IS + Backup + WFH',       cat:'stack',    sell:263.97, cost:30.52, note:'Bundled — 1 WS + Backup + 2× WFH' },
    { name:'M365 Reselling',          cat:'m365',     sell:84.00,  cost:47.99, note:'4× Std + 2× Basic' },
    { name:'Web Hosting',             cat:'hosting',  sell:18.67,  cost:0.00,  note:'clarke-is.co.uk — £224/yr' }]},
  { client: { name:'Connect Data Services',         status:'Winding' }, services: [
    { name:'M365 Reselling',          cat:'m365',     sell:20.00,  cost:9.68,  note:'1 seat — reducing' },
    { name:'Web Hosting',             cat:'hosting',  sell:26.25,  cost:0.67,  note:'Annual hosting £216/yr + domain £99/yr' }]},
  { client: { name:'Cowan Consultancy',             status:'Active' }, services: [
    { name:'IS + Backup + WFH + VirtualBox', cat:'stack', sell:428.05, cost:58.82, note:'Bundled — 1 WS + 5× WFH + VirtualBox £105' },
    { name:'M365 + Exclaimer',        cat:'m365',     sell:273.70, cost:165.18,note:'13× Std + 2× OneDrive + 13× Exclaimer + 1× Basic' },
    { name:'Web Hosting / Domain',    cat:'hosting',  sell:15.33,  cost:0.67,  note:'cowanconsult.co.uk — £163.88/yr + domain £20/yr' }]},
  { client: { name:'Daron Motors',                  status:'Active' }, services: [
    { name:'IT Support Retainer',     cat:'retainer', sell:1000.00,cost:0.00,  note:'Monthly retainer — time cost only' },
    { name:'IS + Backup + WFH',       cat:'stack',    sell:381.45, cost:38.42, note:'Bundled — IS + Backup + 2× WFH' },
    { name:'M365 + Exclaimer',        cat:'m365',     sell:258.00, cost:119.07,note:'12× Std incl Plan 2 + 12× Exclaimer' },
    { name:'Web Hosting',             cat:'hosting',  sell:10.42,  cost:1.08,  note:'rogate.com — £125/yr' }]},
  { client: { name:'Freeston Water Treatment',      status:'Active' }, services: [
    { name:'IS + Backup + M365 SCC',  cat:'stack',    sell:338.52, cost:34.88, note:'Bundled — 2 WS + M365 SCC. Google Workspace user' },
    { name:'Web Hosting',             cat:'hosting',  sell:33.17,  cost:0.67,  note:'2 sites freeston.co.uk — £398/yr' }]},
  { client: { name:'H2O Homes',                     status:'Active' }, services: [
    { name:'IS + Exclaimer',          cat:'stack',    sell:56.08,  cost:6.00,  note:'IS + Exclaimer bundled. M365 confirmed — sell price TBC' }]},
  { client: { name:'Hillcrest Engineering',         status:'Active' }, services: [
    { name:'IS + Backup',             cat:'stack',    sell:69.35,  cost:9.69,  note:'1 WS + Backup (Sage PC). Google Workspace' }]},
  { client: { name:'J&T Building Maintenance',      status:'Active' }, services: [
    { name:'M365 Reselling',          cat:'m365',     sell:29.55,  cost:10.09, note:'Hosted Exchange + OneDrive' }]},
  { client: { name:'Kingdom Products',              status:'Active' }, services: [
    { name:'Web Hosting',             cat:'hosting',  sell:16.58,  cost:0.67,  note:'kingdomproducts.co.uk — £199/yr' }]},
  { client: { name:'LS Commercials',                status:'Active' }, services: [
    { name:'Web Hosting / Email',     cat:'hosting',  sell:3.75,   cost:0.00,  note:'£45/yr — below standard rate. Review at renewal' },
    { name:'Domain Renewals',         cat:'hosting',  sell:2.50,   cost:0.00,  note:'2× domains £15/yr each' }]},
  { client: { name:'MSA Safety',                    status:'Active' }, services: [
    { name:'IS + Backup + Exclaimer + Keeper + M365', cat:'stack', sell:320.25, cost:101.72, note:'Full service — bundled monthly' },
    { name:'Web Hosting',             cat:'hosting',  sell:16.58,  cost:0.00,  note:'msasafety.co.uk — £199/yr' }]},
  { client: { name:'Onsite Commercial Services',    status:'Active' }, services: [
    { name:'Cloud Backup + WFH',      cat:'stack',    sell:70.00,  cost:48.95, note:'O365 & SharePoint backup + 1× WFH (Pam)' },
    { name:'M365 + Exclaimer',        cat:'m365',     sell:356.45, cost:131.77,note:'16× Hosted Exchange + 10× Apps + 15× Exclaimer' },
    { name:'Web Hosting',             cat:'hosting',  sell:22.91,  cost:0.67,  note:'2 sites £250/yr + domain £25/yr' },
    { name:'Starlink Resale',         cat:'other',    sell:96.00,  cost:80.00, note:'Roam Unlimited — cost £80/mo, sell £96/mo' }]},
  { client: { name:'PM Packing',                    status:'Active' }, services: [
    { name:'IS + Backup',             cat:'stack',    sell:129.33, cost:16.62, note:'IS £111.33 + Backup Sage PC £18.00' },
    { name:'M365 + Exclaimer',        cat:'m365',     sell:211.40, cost:115.87,note:'9× Std + 1× Basic + 2× EX2 + 1× EX1 + 9× Exclaimer' },
    { name:'Web Hosting',             cat:'hosting',  sell:31.58,  cost:1.33,  note:'£199/yr hosting + £180/yr group domains' }]},
  { client: { name:'Quality Mouldings',             status:'Active' }, services: [
    { name:'Web Hosting + Domain',    cat:'hosting',  sell:21.08,  cost:1.08,  note:'wibco.com £199/yr + domain £54/yr' }]},
  { client: { name:'Regal Autosport',               status:'Active' }, services: [
    { name:'IS + Backup',             cat:'stack',    sell:104.42, cost:9.69,  note:'1 WS + Webroot + Backup' }]},
  { client: { name:'Solent Rewinds',                status:'Active' }, services: [
    { name:'Web Hosting',             cat:'hosting',  sell:16.58,  cost:0.00,  note:'£199/yr — active customer' }]},
  { client: { name:'Southern Glass Services',       status:'Active' }, services: [
    { name:'IS + Backup + Exclaimer', cat:'stack',    sell:112.18, cost:25.75, note:'10 WS + 7 Exclaimer. M365 paid direct' },
    { name:'Web Hosting',             cat:'hosting',  sell:20.00,  cost:0.67,  note:'sykesglasscompany.co.uk — £240/yr' }]},
  { client: { name:'Taurus Contractors',            status:'Active' }, services: [
    { name:'Internet Security (Annual)', cat:'stack', sell:4.08,   cost:0.50,  note:'£49/yr annual billing. M365 sits with Can Can' }]},
  { client: { name:'Technix Rubber & Plastics',     status:'Active' }, services: [
    { name:'IT Support Retainer',     cat:'retainer', sell:210.90, cost:0.00,  note:'Fixed monthly retainer — basic IT support. M365 opportunity pending' }]},
  { client: { name:'West Country Fires',            status:'Active' }, services: [
    { name:'IS + Backup',             cat:'stack',    sell:133.50, cost:23.26, note:'2 VMs + 1 WS. ESXi/RDP for Sage. DR removed Apr 2026' }]},
  { client: { name:'Wired Services',                status:'New' }, services: [
    { name:'Web Hosting',             cat:'hosting',  sell:16.58,  cost:0.00,  note:'£199/yr — new customer' },
    { name:'M365 Reselling',          cat:'m365',     sell:0.00,   cost:0.00,  note:'TBC — being set up' }]}
];
```

The `xero` field from the prototype (the "Xero billing" reference amount per client) is **not** in the seed data above — it was a hardcoded reference value in the prototype. It should become a live `XeroActual` field (Number column) in `GeckoClients` that Philip enters manually from Xero each month. Leave it blank/null in seeded records.

---

## Xero reconciliation field

The prototype has a Xero reconciliation row per client where Philip types in the actual Xero invoice amount and it flags Match / Close / Mismatch. This should be preserved in Phase 3, but made persistent:

- Add a `XeroActual` column (Number, optional) to `GeckoClients`
- When Philip types an amount and tabs away, PATCH the value to SharePoint
- The Match/Close/Mismatch comparison is `XeroActual` vs the sum of `SellPerMonth` across all that client's services
- Thresholds: within £0.50 = Match ✓, within £5 = Close ~, more than £5 = Mismatch ✕
- Reset to blank state if the field is cleared

---

## What the end state looks like

When Phase 3 is complete, clicking **Profitability** in the sidebar should:

1. Lazy-load on first visit — fetch both SharePoint lists, join them, render
2. Show a summary strip with 7 KPI tiles (client count, stack revenue, cost, gross profit, margin %, retainer revenue, Xero billing total)
3. Show a filter/search toolbar
4. Show one expandable card per client, collapsed by default — cost, revenue, profit, margin pill visible without expanding
5. Expanding a card shows the service line table with category pills, costs, margins
6. A Xero reconciliation row at the bottom of each expanded card
7. Add/edit/delete for clients and services
8. Grand total row at the bottom
9. Refresh button that reloads from SharePoint

The visual style must match the `gecko_dashboard_2.html` prototype exactly — same card layout, same category pill colours, same margin pill thresholds — just inside the portal shell rather than as a standalone page.

---

## Pre-build checklist (do before starting this chat)

- [x] Phase 1 complete — portal shell deployed
- [x] Phase 2 complete — mileage tracker working
- [ ] Create `GeckoClients` list in SharePoint with columns: Title, Status, ContractStart, Notes, XeroActual
- [ ] Create `GeckoServices` list in SharePoint with columns: Title, ClientName, Category, CostPerMonth, SellPerMonth, Notes
- [ ] Have the current `index.html` (post Phase 2) ready to attach to this chat

---

*Generated: April 2026. Phase 3 of 6 in the Gecko IT Intranet Portal build.*
