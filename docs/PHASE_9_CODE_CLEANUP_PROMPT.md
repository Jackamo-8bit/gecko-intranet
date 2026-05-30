# PHASE 9 BUILD PROMPT — Code Cleanup, Consolidation & Polish
## Gecko IT Services — Intranet Portal

---

Copy and paste everything below into a new Claude chat (within the Gecko Intranet Portal project).

---

I'm continuing the build of the Gecko IT Services internal portal (`index.html`, attached). Please read the project files (`GECKO_INTRANET_PORTAL_BLUEPRINT.md`, `MILEAGE_TRACKER_PROJECT_SUMMARY.md`) and the current `index.html` end-to-end before starting.

This phase is different from previous ones. No new sections, no new SharePoint lists, no new features. This is a **refactoring and polish pass** across the entire file — reducing duplication, fixing inconsistencies that accumulated over 8 phases of additive development, and bringing the codebase up to a professional standard ready for Phase 10 (Xero integration and further enhancements).

Think of it as the "tech debt" phase. The portal works, but it grew organically and it shows. This phase makes it clean.

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
| **Phase 9** | **Code Cleanup & Polish** | 🔲 **This session** |
| Phase 10 | Xero Integration & Enhancements | 🔲 Next |

---

## Azure / Auth — No Changes

- Application (Client) ID: `c41290c7-3747-4fc3-8e79-c452a7cab1f7`
- Directory (Tenant) ID: `e508283a-b42d-4afa-bdc2-eb16dcd9933d`
- SharePoint host: `geckoitservices812.sharepoint.com`
- SharePoint site: `/sites/GeckoITClientPortal`
- Scope: `Sites.ReadWrite.All` — no auth changes in this phase.

---

## Why This Phase Matters

The portal is currently ~10,000 lines in a single file. Each section was built in a separate chat session, following the patterns established at the time. That means:

- **Phase 2 (Mileage) and Phase 3 (Profitability)** were built early, before conventions solidified. Their CSS is globally scoped (`.mil-*`, `.prf-*`) rather than scoped under `#section-*` like later modules.
- **The same utility helpers are copy-pasted across 3–6 modules** — `jsAttr()`, `fmtDate()`, `today()`, `resolveListIds()` all have near-identical copies with different prefixes.
- **Four identical spin animations** exist (`ovwSpin`, `prfSpin`, `milSpin`, `cliSpin`) — the later modules reference `cliSpin` rather than defining their own, but the earlier ones still carry dead weight.
- **Orphaned functions** remain from the Phase 5 surgery (Profitability client CRUD was moved to Directory, but the old functions were deliberately left in case of rollback — rollback is no longer needed).
- **Inconsistent scoping** means future CSS additions risk name collisions.
- **No accessibility to speak of** — only 2 `aria-label` attributes in the entire file.

None of this is broken. But it's the kind of codebase where adding Phase 10 (Xero integration) will be harder than it needs to be, and where a future maintainer will waste hours understanding which copy of `resolveListIds` is the canonical one.

---

## What to Do — The Cleanup Checklist

### 1. Shared Utility Consolidation

**Problem:** The following helpers are duplicated across multiple modules with near-identical implementations:

| Helper | Copies | Modules |
|---|---|---|
| `jsAttr(s)` | 3 | `cliJsAttr`, `tshJsAttr`, `cmpJsAttr` |
| `fmtDate(iso)` | 3 | `milFmtDate`, `tshFmtDate`, `cmpFmtDate` |
| `today()` | 2 | `tshToday`, `cmpToday` |
| `resolveListIds()` | 6 | `ovwResolveListIds`, `prfResolveListIds`, `milResolveListIds`, `cliResolveListIds`, `tshResolveListIds`, `cmpResolveListIds` |

**Action — shared helpers:** Move into the existing `SHARED UI HELPERS` block (where `toast()`, `showLoading()`, `escapeHtml()`, `initialsFor()` already live):

- `jsAttr(s)` — one copy, unprefixed. Update all call sites from `cliJsAttr(...)` / `tshJsAttr(...)` / `cmpJsAttr(...)` to `jsAttr(...)`.
- `fmtDate(iso)` — one copy, unprefixed. Replaces `milFmtDate`, `tshFmtDate`, `cmpFmtDate`. Verify format string consistency first — they should all be `{ day: '2-digit', month: 'short', year: 'numeric' }` in `en-GB` locale, but `milFmtDate` may differ slightly due to its older origin. Normalise to the same format.
- `today()` — one copy, unprefixed. Returns `YYYY-MM-DD`.

**Action — site ID resolution:** The siteId is resolved up to 6 times independently. Create a single shared resolver:

```javascript
/**
 * Resolve the SharePoint siteId. Called once; all modules share the result.
 * Caches in CONFIG.siteId so subsequent calls are instant.
 */
async function resolveSiteId() {
  if (CONFIG.siteId) return CONFIG.siteId;
  const sitePath = `/sites/${CONFIG.SP_HOST}:${CONFIG.SP_SITE}`;
  const site = await graphFetch(sitePath);
  CONFIG.siteId = site.id;
  return CONFIG.siteId;
}
```

Then update every module's `resolveListIds()` to call `await resolveSiteId()` instead of doing their own siteId lookup + cross-module reuse chain (`if (CLI.siteId) { TSH.siteId = CLI.siteId; } else if ...`). Each module still keeps its own `xxxResolveListIds()` for list-specific discovery, but the siteId portion is shared.

Each module should still set its own `.siteId` from `CONFIG.siteId` for backwards compatibility (so `PRF.siteId` etc. still work in the data-loading functions), but the actual resolution happens once.

**Action — list discovery helper:** The list resolution pattern is also repeated — every module does `GET /sites/{siteId}/lists?$select=id,displayName,name` then loops to match by displayName. Consider a shared helper:

```javascript
/**
 * Fetch all lists for the resolved site. Cached after first call.
 * Returns the raw array from Graph so modules can pick what they need.
 */
async function fetchAllLists() {
  const siteId = await resolveSiteId();
  if (CONFIG._listsCache) return CONFIG._listsCache;
  const res = await graphFetch(`/sites/${siteId}/lists?$select=id,displayName,name`);
  CONFIG._listsCache = res.value || [];
  return CONFIG._listsCache;
}
```

Each module's `resolveListIds()` then becomes a few lines matching names from the cached list, rather than its own Graph call.

**Be careful:** the Mileage module's `milFmtDate` may have a slightly different format from the others. Check before unifying — if it's intentionally different (e.g. shorter format for table columns), keep `milFmtDate` as a thin wrapper around the shared helper with a format override, or introduce a format parameter.

---

### 2. CSS Scoping Consistency

**Problem:** Phases 2 (Mileage) and 3 (Profitability) use globally scoped CSS classes (`.mil-*`, `.prf-*`) while Phases 4+ scope correctly (`#section-overview .ovw-*`, `#section-clients .cli-*`, etc.). This is an inconsistency — and although the prefixes prevent collisions today, it's not future-proof.

**Action:** Prefix all `.mil-*` rules with `#section-mileage` and all `.prf-*` rules with `#section-profitability`. This is a mechanical find-and-replace within the `<style>` block:

For Mileage CSS (~135 rules):
- `.mil-wrap` → `#section-mileage .mil-wrap`
- `.mil-head-actions` → `#section-mileage .mil-head-actions`
- etc.

For Profitability CSS (~151 rules):
- `.prf-head-actions` → `#section-profitability .prf-head-actions`
- `.prf-refresh` → `#section-profitability .prf-refresh`
- etc.

**Watch out for:** a few MIL rules already reference `#section-mileage` (the `.claim-mode` rules at ~line 1507). Don't double-scope those. Also `.prf-manage-link` is used globally in the Profitability section head — confirm it lives inside `#section-profitability` in the DOM before scoping.

---

### 3. Spinner Animation Consolidation

**Problem:** Four identical `@keyframes` declarations exist:

```css
@keyframes ovwSpin  { to { transform: rotate(360deg); } }
@keyframes prfSpin  { to { transform: rotate(360deg); } }
@keyframes milSpin  { to { transform: rotate(360deg); } }
@keyframes cliSpin  { to { transform: rotate(360deg); } }
```

Timesheets and Compliance already reference `cliSpin` rather than defining their own.

**Action:** Replace all four with a single shared `@keyframes spin` in the Design System CSS block. Update all references:
- `animation: ovwSpin 1s linear infinite` → `animation: spin 1s linear infinite`
- `animation: prfSpin 1s linear infinite` → `animation: spin 1s linear infinite`
- `animation: milSpin 1s linear infinite` → `animation: spin 1s linear infinite`
- `animation: cliSpin 1s linear infinite` → `animation: spin 1s linear infinite`

Delete the four old `@keyframes` declarations.

---

### 4. Orphaned Function Removal

**Problem:** Phase 5 moved client CRUD from Profitability to Directory. The old Profitability functions were deliberately kept for rollback safety. Rollback is no longer needed (5 phases later).

**Action:** Remove these orphaned functions from the Profitability JS block:
- `prfOpenClientModal(id)` (~line 5525)
- `prfSaveClient(id)` (if it still exists)
- `prfDeleteClient(id)` (~line 5058)
- Any supporting functions that are only called by these (e.g. `prfDoDeleteClient`)

Also remove the orphaned PRF modal HTML if it exists in the DOM (check `#section-profitability` for a modal-bg div that's no longer triggered by any UI).

**Before removing:** verify with a grep that NO other code calls these functions. The Directory module has its own `cliSaveClient` / `cliDeleteClient` — those stay. Only remove functions that are truly unreachable.

Update the explanatory comment that references them (the Phase 5 surgery comment block) to note they were cleaned up in Phase 9.

---

### 5. Repeated `rgba()` Values → CSS Custom Properties

**Problem:** Several `rgba()` colour values are hardcoded across the file and repeated many times:

| Value | Count | What it is |
|---|---|---|
| `rgba(224,154,46,0.3)` | 7 | amber border |
| `rgba(74,158,221,0.3)` | 6 | blue border |
| `rgba(224,82,82,0.3)` | 5 | red border |
| `rgba(155,109,255,0.3)` | 4 | purple border |
| `rgba(0,0,0,0.65)` | 5 | modal overlay |
| `rgba(0,0,0,0.6)` | 5 | shadow |
| `rgba(255,255,255,0.015)` | 5 | row hover |

**Action:** Add CSS custom properties in `:root` for the most-repeated values:

```css
--amber-border: rgba(224,154,46,0.3);
--blue-border:  rgba(74,158,221,0.3);
--red-border:   rgba(224,82,82,0.3);
--purple-border:rgba(155,109,255,0.3);
--overlay:      rgba(0,0,0,0.65);
--shadow-heavy: rgba(0,0,0,0.6);
--row-hover:    rgba(255,255,255,0.015);
```

Then find-and-replace all occurrences. This makes future colour tweaks one-line changes instead of multi-file hunts.

---

### 6. Accessibility Improvements

**Problem:** The portal has only 2 `aria-label` attributes and no `tabindex` management. Screen readers and keyboard navigation are essentially unsupported.

**Action — minimum viable accessibility (don't over-engineer):**

- Add `role="navigation"` to the sidebar `<nav>` element
- Add `aria-label` to all icon-only buttons (edit, delete, refresh, etc.) — these currently rely on `title=` attributes which aren't announced by all screen readers
- Add `aria-live="polite"` to the toast container so screen readers announce notifications
- Add `role="dialog"` and `aria-modal="true"` to modal backgrounds (CLI, TSH, CMP)
- Ensure all form `<input>` and `<select>` elements have associated `<label>` elements (most do from the form patterns, but verify the search inputs — the sidebar search and the CLI/PRF search bars may be missing labels)
- Add `aria-current="page"` to the active sidebar link (update in `navTo()`)

**Do not:** add ARIA roles to every div, over-annotate tables, or introduce a keyboard-trap pattern for modals (that's a future enhancement). Keep it proportionate.

---

### 7. Error Handling Consistency

**Problem:** Catch blocks inconsistently use `err` vs `e` as the exception variable name. Some error toasts include `err.message`, others just say `'unknown'`, and some use different timeout values.

**Action:**
- Standardise on `err` everywhere (the dominant pattern — 34 vs 9 instances)
- Standardise error toast format: `toast('Action failed: ' + (err.message || 'unknown error'), 'error', 5000)`
- Ensure every `async function` that calls `graphFetch` has a try/catch with a user-facing toast (scan for bare `await graphFetch` calls without surrounding try/catch)

---

### 8. Magic Number Cleanup

**Problem:** Graph API pagination limits are hardcoded as magic numbers: `$top=999`, `$top=500`, `$top=2000`. Safety valve limits (`5000`, `2000`) are also scattered.

**Action:** Add constants to CONFIG:

```javascript
// — Graph API pagination —
GRAPH_PAGE_SIZE: 999,        // items per page request
GRAPH_SAFETY_LIMIT: 5000,    // max items to fetch before breaking
```

Update all Graph API URLs to use `CONFIG.GRAPH_PAGE_SIZE` and safety-valve checks to use `CONFIG.GRAPH_SAFETY_LIMIT`. The `$top=500` calls (client lists — small lists that don't need pagination) can stay as-is if you prefer, since they genuinely are "fetch everything in one call" — but note the reasoning in a comment.

---

### 9. Inline Style Reduction

**Problem:** ~94 inline `style=` attributes across the file. Many are structural (grid layout in modals, KPI colours) where a CSS class would be cleaner and more maintainable.

**Action — targeted, not exhaustive:**
- KPI value colours (`style="color:var(--green)"` etc.) — these are per-value and context-dependent, so leaving them inline is acceptable. Don't waste time extracting these.
- Modal form layout (`style="display:grid;grid-template-columns:1fr 1fr;..."`) — extract to shared modal-form CSS classes if the pattern repeats across CLI/TSH/CMP modals.
- Anything else that's truly repeated 3+ times with the same inline style — extract to a class.

**Do not:** chase every inline style. Some are genuinely one-offs and are clearer inline. Use judgment.

---

### 10. Comment Block & Section Header Consistency

**Problem:** The section comment blocks use slightly different box-drawing characters and formatting across phases. Some use `╔═══`, some use `/* ═══`, some have descriptive paragraphs, some don't.

**Action:** Normalise all section headers (both CSS and JS) to the established box-drawing format:

```
/* ╔═══════════════════════════════════════════════════════════════════╗
   ║   SECTION NAME (Phase N)                                          ║
   ║   Brief description.                                              ║
   ╚═══════════════════════════════════════════════════════════════════╝ */
```

Ensure every section has:
- A CSS block header
- A JS block header
- A brief description of what the module does
- The phase number it was built in

---

### 11. Settings Version Update

**Action:** Update the version string in the Settings section from `Phase 7 — May 2026` to `Phase 9 — May 2026` (or current date).

---

## Constraints — What NOT to Do

This phase is about improving what exists, not adding features. Specifically:

- **Do not add any new sections, tabs, or features**
- **Do not change any SharePoint list structures or API call shapes** — the data flowing in and out must be identical
- **Do not change any UI layouts or visual designs** — the user should not notice any difference in how the portal looks or behaves
- **Do not rename CSS classes** that are generated dynamically in JS template literals (e.g. `cmp-sp-current`, `tsh-wt-remote`) — renaming these requires updating both the CSS and the JS that generates them, which is risky
- **Do not modify the MSAL auth flow** — it works, don't touch it
- **Do not "improve" the data models** — the SharePoint column names, internal names, and workarounds (like `Hours_x0020_Remaining2`) are battle-tested and must stay exactly as they are
- **Do not break the Phase 5.5 claimed-status Mileage functionality** — it was hard-won
- **Do not remove `console.warn` / `console.error` statements** — these are intentional diagnostic breadcrumbs for debugging in production

---

## How to Approach This

This is a refactoring session, not a feature-building one. The risk profile is different: every change touches existing working code, so the chance of regression is higher than in a fresh-build phase.

### Suggested order:

1. **Read the current `index.html` end-to-end** — map out every module, every helper, every CSS block
2. **Start with the lowest-risk changes:** comment block normalisation, version string update, orphaned function removal (item 10, 11, 4)
3. **Then do the mechanical find-and-replace work:** CSS scoping (item 2), spinner consolidation (item 3), rgba→vars (item 5)
4. **Then the shared helper consolidation** (item 1) — this is the highest-risk change because it touches call sites across every module. Do it carefully, function by function. After consolidating each helper, grep for the old prefixed name to ensure zero references remain.
5. **Accessibility** (item 6) — low risk, additive only
6. **Error handling** (item 7) and magic numbers (item 8) — medium risk, moderate value
7. **Inline style reduction** (item 9) — low priority, use remaining time
8. **Final validation** — the usual `node --check`, brace-balance, and manual walk-through

### Testing approach:

After the refactor, every section should behave identically. The easiest way to verify is:

- All sections navigate correctly
- All data loads (no JS errors in console)
- Add/edit/delete operations work on at least one module (test CLI or CMP)
- Modals open and close
- Filters, search, and sort work
- Mobile responsive layout still works

Since we can't run the portal in this environment, the testing is limited to:
- `node --check` on extracted JS (syntax validation)
- Python brace/tag balance checks
- Manual code review of every changed call site
- Grep verification that no old function names remain unreferenced

---

## Definition of Done

- [ ] **Shared helpers:** `jsAttr`, `fmtDate`, `today` exist once in the shared helpers block; all call sites updated; zero references to old prefixed names remain
- [ ] **Shared siteId resolution:** `resolveSiteId()` and `fetchAllLists()` exist in shared helpers; all module `resolveListIds` functions use them; no raw `CONFIG.SP_HOST:CONFIG.SP_SITE` string construction outside the shared helper
- [ ] **CSS scoping:** all `.mil-*` rules prefixed with `#section-mileage`; all `.prf-*` rules prefixed with `#section-profitability`; no double-scoping of already-scoped rules
- [ ] **Spinner consolidation:** one `@keyframes spin`; zero references to `ovwSpin`, `prfSpin`, `milSpin`, `cliSpin`
- [ ] **Orphaned functions removed:** `prfOpenClientModal`, `prfDeleteClient` (and any supporting functions) deleted; no call sites reference them; Phase 5 surgery comment updated
- [ ] **CSS variables for repeated colours:** `--amber-border`, `--blue-border`, `--red-border`, `--purple-border`, `--overlay`, `--shadow-heavy`, `--row-hover` defined in `:root` and used throughout
- [ ] **Accessibility:** `role="navigation"`, `aria-label` on icon buttons, `aria-live="polite"` on toast, `role="dialog"` on modals, `aria-current="page"` on active nav link
- [ ] **Error handling:** all catch blocks use `err`; all error toasts follow the standard format
- [ ] **Magic numbers:** `CONFIG.GRAPH_PAGE_SIZE` and `CONFIG.GRAPH_SAFETY_LIMIT` defined and used
- [ ] **Comment blocks:** all section CSS and JS headers use the box-drawing format with phase number
- [ ] **Version string:** updated to Phase 9 with current date
- [ ] **Zero functional regressions:** `node --check` passes; brace/tag balance checks pass; all section HTML IDs still match JS references; all onclick handlers reference valid functions
- [ ] **All other sections still work correctly** — no visual, layout, or behavioural changes visible to the user

---

## Style Reminders

- No frameworks, no build steps — vanilla HTML/CSS/JS
- Single `index.html` output to `/mnt/user-data/outputs/index.html`
- Brace-balanced, syntax-checked before delivery (`node --check` on extracted JS)
- Every change is a refactor, not a rewrite — if in doubt, leave it alone
- The goal is a cleaner starting point for Phase 10 (Xero API integration), not perfection

---

*Phase 9 of 10+. Portal build started April 2026. Current `index.html` should be attached at the start of the chat alongside the project files.*
