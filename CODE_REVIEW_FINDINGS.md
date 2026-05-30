# Gecko Intranet — Code Review & Tidy-Up Notes

> **Purpose of this file.** This is a read-only review of the Gecko Intranet folder, written so that a future
> AI agent (Claude Code, Codex, etc.) or developer can understand the project, its current state, and what is
> safe/worth cleaning up — *without* re-deriving all of it from scratch.
>
> **Review date:** 30 May 2026
> **Reviewed by:** Claude (read-only analysis — nothing in the folder was modified)
> **Scope:** Every file in the folder + confirmation that the live site is deployed and matches `index.html`.

---

## 1. What this project is

A self-contained internal portal for Gecko IT Services. It is **one HTML file** — `index.html`
(~13,700 lines / ~728 KB) — that contains everything:

- One `<style>` block (~4,840 lines of CSS).
- One main `<script>` block (~7,700 lines, ~315 functions).
- Third-party libraries loaded from CDN: **MSAL.js v3** (Microsoft sign-in) and **SheetJS / xlsx** (Xero XLSX/CSV import), plus **Google Fonts** (Barlow Condensed + Instrument Sans).

**How it works:** users sign in with Microsoft (MSAL → Entra ID). The app then reads and writes
**SharePoint lists** through the **Microsoft Graph API**, using `localStorage` only as a cache / offline fallback.

**Deployment:** no build step. The file is served directly from **GitHub Pages** at
`https://jackamo-8bit.github.io/gecko-intranet/` (confirmed live and matching `index.html`).

### Sections / modules
The app is split into eight sections, each with its own state object and a CSS namespace prefix to stop
styles bleeding between them:

| Section        | CSS prefix    | Backing SharePoint list(s) |
|----------------|---------------|----------------------------|
| Overview       | `.ovw-`       | MileageJourneys, GeckoServices, GeckoClients (read-only) |
| Profitability  | `.prf-`       | GeckoClients, GeckoServices |
| Profit & Loss  | `.pnl-`       | GeckoPnLReports (Xero import; localStorage fallback) |
| Mileage        | `.mil-`       | MileageJourneys, MileageClients |
| Clients        | `.cli-`       | GeckoClients |
| Timesheets     | `.tsh-`       | (timesheet list) |
| Compliance     | `.cmp-`       | (compliance list) |
| Settings       | `.set-`       | preferences in localStorage |

### Key config (in `CONFIG` block near top of the `<script>`)
- `CLIENT_ID` / `TENANT_ID` — Azure app registration ("Gecko Mileage Tracker", reused for the portal).
  **These are public by design** for a browser SPA OAuth flow — they are *not* secrets and are safe in the source.
- `SP_HOST` / `SP_SITE` — SharePoint site (`geckoitservices812.sharepoint.com/sites/GeckoITClientPortal`).
- `SCOPES` — `User.Read`, `Sites.ReadWrite.All`.
- `GRAPH_PAGE_SIZE` 999 / `GRAPH_SAFETY_LIMIT` 5000 — pagination is handled.

---

## 2. Honest verdict on code quality

**The code itself is in good shape — better than most single-file apps.** The tidy-up need is mostly about
**folder clutter and the absence of version control**, not the code.

Things done well (please preserve these patterns):

- **XSS-conscious.** `escapeHtml()` is used ~117 times — SharePoint/user data is escaped before being injected
  into the DOM via `innerHTML`.
- **Solid error handling.** ~61 `try/catch` blocks, no silent empty catches, and a single shared
  `graphFetch()` wrapper that every section uses and that centrally handles token expiry (401 / expired-token).
- **Modern JS.** `const`/`let` throughout, zero `var`. No `eval`, `new Function`, or `document.write`.
- **CSS design tokens** (CSS variables like `--green`, `--card`) instead of hardcoded colours; section CSS is
  namespaced to avoid collisions.
- **Centralised config.** All deployment-specific values live in one `CONFIG` block — rebrandable for another
  tenant by editing one place.
- **No secrets leaked.** (Client/Tenant IDs are public OAuth identifiers — correct, not a leak.)

---

## 3. Tidy-up recommendations (priority order)

> ⚠️ None of the items below should be assumed safe to delete without a human (Jack) confirming. Prefer moving
> to a `/archive` folder or committing to Git history first, rather than hard-deleting.

### Priority 1 — Put the folder under version control (Git)
There is currently **no Git repository** here. This is the root cause of most of the clutter below: backup
snapshots and "before" copies exist precisely because there's no history to fall back on. Initialising Git
(and pushing to a private remote) is the single highest-value change — it then makes deleting the redundant
files safe, because history preserves them.

### Priority 2 — Remove/stale duplicate copies of the whole app
These look like the real app but are not the deployed file. They are large and confusing:

- **`gecko-dashboard-redesign-preview.html`** (~732 KB) — byte-for-byte identical to `index.html` **plus** a
  ~69-line demo harness appended at the end that *fakes* a login (`Jack Morris / jack@geckoit.local`) and
  injects sample Xero P&L data. It is a local preview/demo build, not for production.
- **`index.html.before-ui-polish.bak`** (~520 KB) — a manual pre-UI-polish backup snapshot. Belongs in Git
  history, not the working folder.
- **`gecko_dashboard_2.html`** (~454 lines) — an older standalone *profitability-only* dashboard, superseded by
  the Profitability section in `index.html`.
- **`gecko-dashboard-phone-preview.html`** — a tiny iframe wrapper used for phone-sizing previews (scratch).

### Priority 3 — Remove redundant archive
- **`files.zip`** — contains only two `.md` files (`GECKO_INTRANET_PORTAL_BLUEPRINT.md` and
  `NEW_CHAT_STARTER_PROMPT.md`) that **already exist uncompressed** in the folder. Redundant.

### Priority 4 — Confirm and likely remove unused `/assets`
The `/assets` folder holds three PNGs (`gecko-logo-transparent.png` ~268 KB, `gecko-favicon.png`,
`gecko-apple-touch-icon.png`). **No HTML file references `assets/` at all** — the logo and both favicons are
embedded as **inline base64** inside `index.html` (4 occurrences). The PNGs appear to be leftovers. Confirm with
Jack, then remove (or, conversely, switch `index.html` to reference the files and drop the inline base64 to
shrink the HTML — a design choice, see §4).

### Priority 5 — Organise the documentation / prompt files
Eleven `.md` files (~190 KB) sit loose in the root and document the build history phase-by-phase. They are
**genuinely useful** (keep them) but clutter the root. Suggest moving them into a `/docs` or `/prompts`
subfolder:
`GECKO_INTRANET_PORTAL_BLUEPRINT.md`, `NEW_CHAT_STARTER_PROMPT.md`,
`PHASE_3_STARTER_PROMPT.md` … `PHASE_10_XERO_INTEGRATION_PROMPT.md`,
`PHASE_9_CODE_CLEANUP_PROMPT.md`, `PHILIP_FILTER_BUG_FIX_PROMPT.md`.

### Priority 6 — Housekeeping
- **`.DS_Store`** — macOS junk; add a `.gitignore` (include `.DS_Store`, `*.bak`).

---

## 4. Longer-term / optional improvements (not urgent)

- **Single-file size.** 13.7k lines in one file is a deliberate, defensible trade-off: self-contained, zero
  build, trivial GitHub Pages deploy. It is well-organised internally, so leaving it is fine. As it keeps
  growing, consider splitting CSS and JS into separate files (or adopting a light build step / bundler). The
  largest function, **`ovwRenderAll` (~268 lines)**, is the first refactor candidate; other large ones:
  `initProfitLoss` (~151), `initMileage` (~134), `prfImportXeroCsv` (~119).
- **Inline event handlers.** ~146 inline `onclick=` attributes mix behaviour into markup and make refactors
  harder. Event delegation would be cleaner long-term.
- **CDN integrity (SRI).** MSAL and SheetJS load from jsDelivr with **pinned versions** (good) but **no
  `integrity=` (SRI) hashes**. Adding SRI is a small supply-chain hardening win.
- **Inline base64 vs `/assets`.** The inline base64 icons make the HTML ~bigger and harder to diff. If a build
  step is ever added, moving images back to `/assets` and referencing them would shrink and clean up the file.

---

## 5. Suggested folder layout after tidy-up

```
Gecko Intranet/
├── index.html                  # the live app (unchanged)
├── CODE_REVIEW_FINDINGS.md      # this file
├── .gitignore                   # .DS_Store, *.bak
├── docs/                        # all PHASE_*/blueprint/starter .md files
│   ├── GECKO_INTRANET_PORTAL_BLUEPRINT.md
│   └── PHASE_*.md ...
└── archive/                     # optional, if not deleting outright
    ├── gecko-dashboard-redesign-preview.html
    ├── index.html.before-ui-polish.bak
    ├── gecko_dashboard_2.html
    └── gecko-dashboard-phone-preview.html
```

(`assets/` and `files.zip` removed once confirmed unused.)

---

## 6. Note for whoever acts on this

- **Do not change `index.html` purely for tidiness** without a reason — it is the live, deployed file. Treat
  any edit as a production change and test the MSAL sign-in + a Graph read afterwards.
- The CLIENT_ID / TENANT_ID are **safe to keep in source**; do not "fix" them as if they were leaked secrets.
- Start with Git (§3.1). Everything else gets safer once history exists.
