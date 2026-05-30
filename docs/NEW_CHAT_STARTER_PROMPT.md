# NEW CHAT STARTER PROMPT
## Gecko IT Services — Intranet Portal Build

---

Copy and paste the following into a new Claude chat (within the Gecko Intranet Portal project):

---

I'm building a unified internal web portal for Gecko IT Services, a small two-person IT company (Philip Morris and Jack Morris). The project files contain the full blueprint (GECKO_INTRANET_PORTAL_BLUEPRINT.md) and the full mileage tracker reference (MILEAGE_TRACKER_PROJECT_SUMMARY.md) — please read both before starting.

**Quick context:**
- We already have a fully working mileage tracker at https://jackamo-8bit.github.io/mileage-tracker/ — it uses MSAL.js v3 for Microsoft 365 auth and Microsoft Graph API to read/write SharePoint lists. This is the proven foundation.
- The portal will be a single index.html file hosted on GitHub Pages, structured with clearly labelled section comment blocks so each tool is self-contained and easy to debug independently.
- The design system is Philip's dark aesthetic — dark backgrounds (#0d1117), green accent (#52b02e), Barlow Condensed for headers/numbers, Instrument Sans for body text.
- Auth is shared — sign in once at portal level, all sections use the same MSAL token.

**Azure App Registration (already exists — Gecko Mileage Tracker):**
- Application (Client) ID: c41290c7-3747-4fc3-8e79-c452a7cab1f7
- Directory (Tenant) ID: e508283a-b42d-4afa-bdc2-eb16dcd9933d
- SharePoint host: geckoitservices812.sharepoint.com
- SharePoint site: /sites/GeckoITClientPortal
- I will add the new portal redirect URI to this same app registration before we start

**Existing SharePoint lists (already created and working):**
- MileageJourneys (columns: Title/Destination, Driver, JourneyDate, Miles, Purpose, Amount, RateType)
- MileageClients (columns: Title/ClientName, TypicalMiles)

**New SharePoint lists (I will create these before we start building Phase 3):**
- GeckoClients (Title, Status, ContractStart, Notes, PrimaryContact, ContactEmail, ContactPhone, RenewalDate, ContractValue)
- GeckoServices (Title, ClientName, Category, CostPerMonth, SellPerMonth, Notes)

**Today's task — Phase 1: Portal Shell**

Please build the portal shell — a complete, working index.html that includes:
1. The dark design system (CSS variables, typography, shared card/button/badge components)
2. A sidebar with navigation links for: Overview, Profitability, Mileage, Clients, Timesheets (placeholder), Compliance (placeholder), Settings (placeholder)
3. MSAL auth — login screen, sign in with Microsoft popup, user chip showing signed-in name, sign out button
4. Section switching — clicking nav items shows/hides the correct content panel, all others hidden
5. Empty placeholder panels for each section (just a heading and "coming soon" message) — except Mileage which should have a note saying "mileage tracker will load here"
6. Gecko IT logo favicon (I will provide the PNG — please embed as base64)
7. Toast notification component (shared, used by all sections)
8. Loading bar (shared, shown during any async operation)

The shell should be structured with clear comment block separators so that when we add section content in later phases, each section's HTML, CSS, and JS is clearly grouped and easy to find.

Do not add any section functionality yet — just the shell, auth, and navigation. We will add each section in subsequent chats.

Please confirm you have read the blueprint and summary documents before starting, and flag any questions.
