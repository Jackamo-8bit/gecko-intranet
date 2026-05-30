# Gecko IT Services — Intranet Portal
## Architecture Blueprint & Build Plan

---

## Vision

A single-URL internal web portal for Gecko IT Services. Both Philip and Jack open the same URL, sign in once with their Microsoft 365 accounts, and have access to all internal operational tools in one place. No separate apps, no paper, no spreadsheets.

The portal is a shell that houses individual tools as sections. Each section is self-contained within the codebase. Adding a new tool means adding a new section — nothing else changes.

---

## Current State

The Mileage Tracker is fully built and working. It is the proven foundation the portal will be built around — not the other way around.

| Tool | Status |
|---|---|
| Mileage Tracker | ✅ Live at https://jackamo-8bit.github.io/mileage-tracker/ |
| Client Profitability Dashboard | 🔶 Prototype exists (Philip's gecko_dashboard_2.html) — data hardcoded, needs SharePoint |
| Client Directory | 🔲 Planned |
| Timesheets | 🔶 Exists as Power App — web version planned |
| Cyber / Compliance | 🔲 Future |
| Home / Overview | 🔲 Planned — aggregates data from other sections |

---

## Architecture Decision

**Single HTML file with clear internal section structure.** Not multiple pages, not a framework.

Each section is wrapped in clearly labelled comment blocks so it can be found, debugged, and edited in isolation. When something breaks in the profitability section, the fix lives between two comment markers — nothing else is touched.

```
index.html
│
├── <head>
│   └── fonts, favicon, MSAL CDN (loads once)
│
├── <style>
│   ├── /* ═══ DESIGN SYSTEM — shared variables, layout, components ═══ */
│   ├── /* ═══ SIDEBAR & SHELL ═══ */
│   ├── /* ═══ HOME SECTION ═══ */
│   ├── /* ═══ MILEAGE TRACKER ═══ */
│   ├── /* ═══ CLIENT PROFITABILITY ═══ */
│   ├── /* ═══ CLIENT DIRECTORY ═══ */
│   └── /* ═══ [FUTURE SECTIONS] ═══ */
│
├── <body>
│   ├── Login screen (shown when not authenticated)
│   ├── Portal shell
│   │   ├── Sidebar navigation
│   │   ├── Header bar (user chip, sign out)
│   │   └── Content area (only active section visible)
│   └── Toast notification
│
└── <script>
    ├── // ═══ CONFIG & CONSTANTS ════════════════════════════════════
    ├── // ═══ MSAL AUTH ══════════════════════════════════════════════
    ├── // ═══ MICROSOFT GRAPH HELPERS ════════════════════════════════
    ├── // ═══ NAVIGATION ════════════════════════════════════════════
    ├── // ═══ HOME SECTION ══════════════════════════════════════════
    ├── // ═══ MILEAGE TRACKER ════════════════════════════════════════
    ├── // ═══ CLIENT PROFITABILITY ══════════════════════════════════
    ├── // ═══ CLIENT DIRECTORY ══════════════════════════════════════
    └── // ═══ INIT ══════════════════════════════════════════════════
```

---

## Design System

Philip's dark aesthetic is the standard. The mileage tracker will be reskinned to match when it moves into the portal.

### Colour Palette
```css
--black:     #07090a   /* page background */
--dark:      #0d1117   /* section background */
--card:      #111820   /* card background */
--card-hover:#141d27   /* card hover state */
--green:     #52b02e   /* primary accent */
--green-dark:#3a7d20   /* hover/active */
--green-glow:rgba(82,176,46,0.13)
--green-line:rgba(82,176,46,0.22)
--white:     #eef2ee   /* primary text */
--muted:     #7a8f80   /* secondary text */
--border:    rgba(82,176,46,0.18)
--red:       #e05252   /* negative/cost */
--amber:     #e09a2e   /* warning */
--blue:      #4a9edd   /* info */
--purple:    #9b6dff   /* retainer */
--teal:      #2dd4bf   /* hosting */
```

### Typography
- **Headers / Numbers:** Barlow Condensed (700/800 weight) — bold, compact, data-friendly
- **Body / UI:** Instrument Sans (400/500/600) — clean, readable

### Component Standards
- Card border-radius: 14px
- Cards have dark background with subtle green border
- Active nav item: green accent left border + green text
- All monetary values: Barlow Condensed font
- Status pills: coloured background with matching text, rounded

---

## Sidebar Navigation Structure

```
🦎 GECKO IT                    ← logo + brand name
   Internal Portal

─────────────────
🏠  Overview                   ← live summary dashboard
📊  Profitability               ← client revenue/margin
🚗  Mileage                    ← existing mileage tracker
👥  Clients                    ← client directory
🕐  Timesheets                 ← placeholder → links to Power App
🔒  Compliance                 ← placeholder
─────────────────
⚙️  Settings                   ← future

[Jack Morris]  ← user chip
[Sign out]
```

---

## Section Plans

### 1. Home / Overview
Aggregates live data from SharePoint. Shows at a glance:
- This month's combined mileage and reimbursement due (from MileageJourneys)
- Total monthly revenue vs last month (from GeckoServices)
- Number of active clients (from GeckoClients)
- Quick action buttons: Add Journey, Add Client

SharePoint lists needed: uses existing lists from other sections — no new lists.

---

### 2. Client Profitability Dashboard
Based on Philip's gecko_dashboard_2.html prototype. Expandable client cards showing:
- Cost / Revenue / Gross Profit / Margin % per client
- Service line breakdown (Stack, M365, Hosting, Retainer, Other)
- Xero reconciliation field per client
- Grand total row across all clients
- Filter by service category
- Search by client name

**SharePoint lists needed:**

`GeckoClients`
| Column | Type |
|---|---|
| Title | Single line of text (client name) |
| Status | Choice: Active / Winding / New |
| ContractStart | Date |
| Notes | Multiple lines of text |

`GeckoServices`
| Column | Type |
|---|---|
| Title | Single line of text (service name) |
| ClientName | Single line of text (matches GeckoClients Title) |
| Category | Choice: stack / m365 / hosting / retainer / other |
| CostPerMonth | Number |
| SellPerMonth | Number |
| Notes | Single line of text |

---

### 3. Mileage Tracker
Existing working tool, moved into the portal shell. Reskinned to dark theme. Auth is shared — no separate sign-in needed.

**SharePoint lists:** MileageJourneys, MileageClients (already created and working)

No functional changes needed — just visual reskin and integration into navigation.

---

### 4. Client Directory
A clean, searchable list of all Gecko clients. Contact details, contract status, renewal dates, notes. Uses the same `GeckoClients` SharePoint list as the profitability section — one source of truth.

Additional columns needed on GeckoClients:
- `PrimaryContact` — Single line of text
- `ContactEmail` — Single line of text  
- `ContactPhone` — Single line of text
- `RenewalDate` — Date
- `ContractValue` — Number (monthly)

---

### 5. Timesheets (Placeholder)
Links through to the existing Power Apps timesheet tool. Placeholder panel with a launch button for now. Future: web version built directly into the portal.

---

### 6. Compliance (Placeholder)
Future home for Cyber Essentials evidence, client audit records, network audit reports. Placeholder for now.

---

## Authentication

MSAL.js v3 via jsDelivr CDN. Same Azure App Registration as the mileage tracker — just add the new portal URL as an additional redirect URI.

- **Library:** `https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.27.0/lib/msal-browser.min.js`
- **Scope:** `Sites.ReadWrite.All`
- **Cache:** localStorage
- **Auth flow:** loginPopup (not redirect — avoids page reload on auth)
- **Token refresh:** silent first, popup fallback on expiry

Sign in happens once at portal load. All sections share the same token. No re-authentication when switching sections.

---

## GitHub Deployment

- **Repo:** github.com/Jackamo-8bit/gecko-intranet (new repo — separate from mileage tracker)
- **Hosting:** GitHub Pages (public repo, free tier)
- **URL:** https://jackamo-8bit.github.io/gecko-intranet/
- **File:** single index.html + favicon.png + apple-touch-icon.png

Azure App Registration: add `https://jackamo-8bit.github.io/gecko-intranet/` as an additional SPA redirect URI alongside the existing mileage tracker URI. Same app registration, same permissions — no new Azure setup needed.

---

## SharePoint Lists Summary

| List | Used By | Status |
|---|---|---|
| MileageJourneys | Mileage Tracker | ✅ Created |
| MileageClients | Mileage Tracker | ✅ Created |
| GeckoClients | Profitability, Client Directory | 🔲 Create before building |
| GeckoServices | Profitability | 🔲 Create before building |

---

## Build Order

**Phase 1 — Portal Shell**
- Dark theme design system (CSS variables, typography, shared components)
- Sidebar navigation with section switching
- MSAL auth (sign in / sign out / user chip)
- Empty placeholder panels for all sections
- Gecko logo favicon

**Phase 2 — Mileage Tracker Integration**
- Copy working mileage tracker logic into the portal section
- Reskin to dark theme
- Wire into shared auth token
- Test: add journey, delete journey, all tabs work

**Phase 3 — Client Profitability**
- Create GeckoClients and GeckoServices SharePoint lists
- Build section UI based on Philip's prototype
- Connect to SharePoint via Graph API
- Add/edit/remove clients and services
- Xero reconciliation field

**Phase 4 — Home Overview**
- Pull summary data from MileageJourneys and GeckoServices
- Render summary cards and quick actions

**Phase 5 — Client Directory**
- Extend GeckoClients with contact columns
- Build searchable directory UI

**Phase 6+ — Placeholders to real features**
- Timesheets web version
- Compliance tracking

---

## Pre-Build Checklist (Do Before Starting)

- [ ] Create new GitHub repo: `gecko-intranet`
- [ ] Enable GitHub Pages on main branch
- [ ] Add `https://jackamo-8bit.github.io/gecko-intranet/` as SPA redirect URI in Azure App Registration
- [ ] Create `GeckoClients` SharePoint list with columns listed above
- [ ] Create `GeckoServices` SharePoint list with columns listed above
- [ ] Have Philip's `gecko_dashboard_2.html` available for reference

---

## Key Technical Lessons (From Mileage Tracker Build)

Refer to MILEAGE_TRACKER_PROJECT_SUMMARY.md for full detail. Critical points:

1. **Always use Microsoft Graph API** — not SharePoint REST API. Graph works from any origin. SharePoint REST only works when served from within SharePoint.
2. **Scope must be `Sites.ReadWrite.All`** — not a SharePoint-specific scope URL. Wrong scope = 401 Invalid Audience errors on every call.
3. **Load MSAL from jsDelivr CDN** — Microsoft's own CDN (`alcdn.msauth.net`) is blocked by some browser extensions.
4. **Create msalInstance inside init()** — not at script parse time. Must wait for `window.load` event before initialising MSAL.
5. **Redirect URI must be SPA type in Azure** — not Web. SPA type enables the popup flow correctly.
6. **After changing scopes, user must sign out and clear localStorage** — old tokens with wrong scope are cached and reused until manually cleared.

---

*Created: April 2026*
*Next action: Start building Phase 1 — portal shell*
