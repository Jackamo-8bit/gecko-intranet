# Projects Board — Design

**Date:** 2026-08-12
**Branch:** `feat/projects-board`
**Status:** Approved for planning

---

## Why this exists

Gecko records day-to-day work as Atera tickets. That works. Project work —
website builds, the MSA Control Centre, the CRM build — is also recorded as
Atera tickets, and that does not work, because a ticket has two meaningful
states (open, closed) and a project has more.

The evidence is in Atera's own ticket list. Of thirteen open tickets, four are
projects: #137 Website for Sam's firm, #132 Website creation and transfer,
#131 MSA Control Centre Phase 2, #106 Close out Cost Calculator. All sit at
`Low` / `Open` / `Unassigned`. #106 has been open two months, #93 three. A
six-week project in progress and a job that has been forgotten look identical,
because there is no field that distinguishes them.

This board gives project work the states it needs, in one place both Jack and
Philip can see, without duplicating anything Atera is doing well.

**The one job:** answer "where are we at?" without a meeting.

### Non-goals

Not a ticketing system. Not a task manager. Not a replacement for Atera.
Day-to-day work stays in Atera and nothing about that changes.

## Scope decision: why not just use Atera

Considered and rejected. A second store of project state next to Atera would
be two homes that disagree. But projects genuinely do not fit Atera's ticket
model — there is no field for project state, so the state lives in Jack's head
regardless. A project record in the portal is new information, not a copy.

**Relationship to Atera: a link, and nothing more.** Projects carry an optional
`AteraRef` rendered as a hyperlink to the ticket. No API, no key, no sync, no
scheduled job. A link cannot drift out of sync with its target.

**API sync is ruled out, not deferred** — recorded here so it is not
re-derived. Atera's REST API (`app.atera.com/api/v3`) is included in all paid
plans, but authenticates with a single static key. This app is a public static
file served by GitHub Pages, so any key in it is readable by anyone, and it
would grant read access to every ticket, customer and device in the tenant.
Atera also does not permit browser origins, so the call would fail regardless.
A Power Automate flow could carry the key server-side, but the value is low:
projects do not fit tickets, which is the premise of this entire build.

## Context: where this sits

This is sub-project **P3** of four identified during brainstorming:

| | Project | Status |
|---|---|---|
| P1 | Software, not a file — ES modules, no bundler | Started by this build |
| P2 | Live margin — TD Synnex costs + Xero revenue into `GeckoServices` without typing | Next |
| P3 | **Projects board** | **This spec** |
| P4 | Instant — cache-first load, plus merging the PWA branch | After P1 |

P1 is delivered incrementally ("strangle"), not as a big-bang refactor. This
build creates the module structure and is its reference implementation. The
nine existing sections stay in `index.html`, untouched and working, and get
extracted one at a time whenever there is another reason to touch them.

Rejected alternative: one clean split of all 16,445 lines before adding
anything new. Rejected because the app runs the business, the safety net is
three test files, and the work happens in evenings. Half-migrated and working
beats fully-migrated and broken.

---

## Architecture

### Shell and module boundary

`index.html` keeps `<head>`, the login screen, the sidebar, the section mounts,
and all nine existing sections. Two additions:

```html
<link rel="stylesheet" href="src/styles/projects.css">
<script type="module" src="src/main.js"></script>
```

Module scripts are deferred, so they execute after the inline `<script>` has
defined `navTo`, `graphFetch`, `toast` and MSAL setup. Module code may
therefore call outward to existing globals at runtime.

### Registration hook

`navTo` must reach module code. Rather than exposing many globals, a module
registers one entry:

```js
window.GeckoSections = window.GeckoSections || {};
window.GeckoSections.projects = { init };
```

`navTo` gains four lines: if the target section has an entry in `GeckoSections`
and has not started yet, call `init()` and record it in a `startedSections` set.
This matches the existing lazy-load convention (`initProfitability()` and
equivalents). Every future extracted section registers the same way, so the
ninth extraction is no harder than the first.

**The contract is `{ init }` only.** An earlier draft of this spec had `navTo`
call `refresh()` on every later visit; that was reversed during implementation
because it would re-fetch SharePoint on every navigation, which no other section
does. Refreshing is a manual act via each section's Refresh button, so `refresh`
stays a private function of the module and is not part of the contract.

The started-section bookkeeping lives in that separate set rather than being
stamped onto the registration object, so the contract stays a pure contract and
a section whose `init()` throws can be retried by navigating away and back
instead of needing a page reload.

### Reuse, not reimplementation

`src/core/*.js` files begin as thin re-exports of existing globals, not copies:

```js
// src/core/graph.js
export const graphFetch = (...args) => window.graphFetch(...args);
export const resolveSiteId = () => window.resolveSiteId();
```

The board imports from `core/`. When those helpers are genuinely extracted
during a later P1 step, one file changes and no consumer does. Copying the
implementations instead would create a second Graph client that drifts — the
same failure mode rejected for Atera.

Reused: `graphFetch`, `resolveSiteId`, `fetchAllLists` (and its cache),
`toast`, `escapeHtml`, existing modal markup and CSS conventions, design
tokens, and the generic `syncTableLabels` responsive machinery (not needed by
the board's own layout, but not to be duplicated either).

### File layout

```
index.html            shell + the nine existing sections (unchanged)
src/
  main.js             registers sections into window.GeckoSections
  core/
    graph.js          re-exports graphFetch / resolveSiteId / fetchAllLists
    ui.js             re-exports toast / escapeHtml
  sections/
    projects.js       board: state, fetch, render, mutate, pure helpers
  styles/
    projects.css      section-scoped styles, existing tokens only
```

### Explicitly not included

No bundler, no npm, no `node_modules`, no CI, no framework, no state library,
no router, no TypeScript. Deploy remains `git push` to `main`, served by
GitHub Pages from the repo root. Adding Vite later is possible without redoing
this work — it is the same module graph.

### Inline handlers

`index.html` contains 193 inline `onclick`/`onchange`/`oninput` handlers, which
depend on functions being on `window`. Module scope breaks that. The board is
new code and uses `addEventListener` with event delegation, so it is not
affected. When existing sections are extracted later, each module ends with a
one-line `Object.assign(window, { ... })` re-export to keep its inline handlers
working; that line is deleted per section if and when the section converts to
delegation. This is deliberately deferred, not solved here.

---

## Data model

SharePoint list **`GeckoProjects`**, on the existing site
`geckoitservices812.sharepoint.com/sites/GeckoITClientPortal`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `Title` | Single line of text (built-in) | Yes | Project name |
| `ClientName` | Single line of text | No | Matched by name against `GeckoClients` |
| `Owner` | Choice: `Jack`, `Philip` | No | |
| `Status` | Choice: `Quoted`, `Agreed`, `In progress`, `Done` | Yes | Defaults to `Quoted` |
| `WaitingOn` | Single line of text | No | Empty = not waiting. Non-empty = waiting, and this is the reason. |
| `NextAction` | Single line of text | No | One line of prose |
| `AteraRef` | Single line of text | No | Ticket number, e.g. `131` |
| `Notes` | Multiple lines of text (plain) | No | |
| `Modified` | Built-in | — | Free from SharePoint; powers staleness |

### Field rationale

**`ClientName` is text, not a lookup column.** `GeckoServices` already uses this
pattern. Lookup columns complicate Graph writes (they need `LookupId` and a
resolved list reference) for no benefit at this scale. The client dropdown in
the UI is populated from `GeckoClients` and writes the name string.

**`WaitingOn` is one field doing two jobs.** A separate boolean plus a reason
field can contradict each other — flagged with no reason, reason with no flag.
One field cannot disagree with itself.

**No value field and no target date.** Both were considered and declined. Value
lives in Xero once invoiced; a duplicate here goes stale. Target dates on
project work would not be kept accurate, and a board of red overdue badges that
have been mentally written off is worse than a board with no dates. The
staleness badge below covers the same need without anything to maintain.

### List creation

Created by hand in SharePoint, once, before first use. Programmatic
provisioning via Graph would be code that runs successfully once in the
lifetime of the app. If the list is absent, the board renders a setup message
naming the list and its fields, rather than throwing the raw
`GeckoProjects list not found` error the other sections throw.

---

## Behaviour

### Layout

**Desktop:** four columns — `Quoted`, `Agreed`, `In progress`, `Done` — each a
stack of cards, using existing card tokens and radii.

**Phone:** a single grouped list. Status headings stack vertically with their
cards beneath, headings sticky on scroll. Horizontal-scrolling columns were
rejected: only one column is visible at a time, which destroys the overview the
board exists to provide, and it is more code.

The switch is a container query on the board wrapper at **720px**, matching the
existing `@container rtable` table transform's breakpoint — what constrains the
board is its own column, not the viewport, and the sidebar collapse state
changes that. Four columns above 720px, grouped list below.

### The card

Title, client, owner, next action, and — when set — a waiting chip showing the
`WaitingOn` text, a staleness badge, and an Atera link.

### Moving a card

A native `<select>` on each card, bound to `Status`. **Not drag-and-drop.**

Rationale, recorded because it will come up again: HTML5 drag-and-drop does not
work on touch without a library or several hundred lines of pointer-event
handling; it is invisible to keyboard and screen-reader users; and it would be
the largest single body of code in this build. A dropdown works identically on
desktop and iPhone, is accessible with no extra work, and is faster to operate.

### Staleness badge

A card shows a muted "no movement Nw" badge when `Modified` is more than 21 days
ago **and** `Status` is `Agreed` or `In progress`. Never on `Quoted` (quotes
legitimately sit) or `Done`.

This is the project-drift detector. It is derived, so there is nothing to keep
up to date. It would have surfaced #106 and #93.

### Done column

Collapsed by default, showing a count, expanding on click. All items are
fetched — there will be tens, not thousands — and the collapse is client-side.
Without this the column grows without limit.

### Editing

Click a card to open a modal following the existing client-edit pattern.
Create, edit, delete. Writes are a plain Graph `PATCH`/`POST`/`DELETE` followed
by a re-render. No optimistic updates, therefore no rollback logic. A failed
write toasts the error and leaves the card as it was.

### Navigation

New sidebar entry `Projects`, and an entry in `SECTION_TITLES`. Placed after
`Clients` and before `Timesheets`.

---

## Failure and edge cases

| Case | Behaviour |
|---|---|
| Fetch fails | Error panel with a Retry button. An empty board and a failed load must never look the same. |
| Write fails | Toast with the error; card unchanged. |
| List missing | Setup message naming `GeckoProjects` and its fields. |
| No projects yet | Empty state with an Add button. |
| Unknown/blank `Status` | Grouped into `Quoted` and never silently dropped. |
| Concurrent edit | Last write wins. |

**Concurrent edits** are accepted as a known ceiling. Two users who speak daily
do not justify ETag conflict handling. Recorded in source:

```js
// ponytail: last-write-wins. Add If-Match/ETag if a third person ever uses this.
```

**Auth:** no change. `Sites.ReadWrite.All` is already granted and consented.
No Entra changes, no new admin consent, no risk to existing sign-in.

**Escaping:** every rendered field passes through the existing `escapeHtml`.
Not negotiable and not subject to "it's only us".

---

## Testing

One new file, `tests/projects-board.mjs`, matching the existing style
(`node:assert/strict`, run directly with `node tests/projects-board.mjs`).

Unlike the existing tests, it imports `src/sections/projects.js` directly — no
regex extraction from `index.html`, no `vm` sandbox. This is a concrete benefit
of the module structure and the pattern later extractions should follow.

Two pure functions are exported and tested:

1. **`isStale(project, now)`** — false below the 21-day boundary, true above it,
   and always false for `Quoted` and `Done` regardless of age.
2. **`groupByStatus(projects)`** — every project lands in exactly one column;
   unknown, empty and missing `Status` values fall into `Quoted` rather than
   disappearing.

Rendering and Graph calls are not unit-tested: that needs a browser and a live
tenant, and would be testing SharePoint rather than this code. Manual
verification uses the existing mock preview harness.

---

## Deferred, with triggers

Nothing below is rejected on merit; each is sequenced behind evidence that it
is needed.

| Item | Build it when |
|---|---|
| **Projects tile on Overview** | The board has been used for a month, so its contents are known to be worth surfacing. |
| **File attachments** | Never as an upload pipeline. If needed, add one `FolderUrl` field linking to the existing SharePoint/OneDrive folder. |
| **Sub-tasks** | When `NextAction` is visibly being used to hold a list. |
| **Drag-and-drop** | Only if the dropdown proves annoying in daily use. See rationale above. |

**Dropped outright** (2026-08-12, Jack's call): Atera API sync — see the
constraint above. Time per project (`ProjectRef` on timesheet entries) and
project templates — not wanted; do not reintroduce them as "obvious next
steps".

---

## Success criteria

1. Jack and Philip can both see every live project and its state without a
   meeting or a message.
2. A stalled project is visibly distinct from an active one.
3. "Waiting on the client" is visibly distinct from "not started".
4. Nothing about the Atera day-to-day workflow changes.
5. All nine existing sections behave exactly as before.
6. Deploy is still `git push`.
