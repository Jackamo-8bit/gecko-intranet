# Phase 11 — Annual Leave Planner Prompt

Use this prompt to start a fresh Codex/Claude chat for adding an Annual Leave function to the Gecko IT internal portal.

## Project Context

We are working on the Gecko IT Services internal portal.

Workspace:

```text
/Users/jack/Documents/Gecko Intranet
```

Live repository:

```text
https://github.com/Jackamo-8bit/gecko-intranet
```

Production site:

```text
https://jackamo-8bit.github.io/gecko-intranet/
```

Current branch:

```text
main
```

The portal is intentionally a self-contained GitHub Pages app. The live app is:

```text
index.html
```

It contains:

- One large CSS block.
- One large JavaScript block.
- Microsoft MSAL browser auth.
- Microsoft Graph calls into SharePoint lists.
- SheetJS for Xero P&L XLSX/CSV import.

There is no build step. Keep it that way unless there is a very strong reason.

Before editing, run:

```bash
git status --short --branch
```

After editing, validate the script block:

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('index.html','utf8');const scripts=[...html.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]).join('\\n');new Function(scripts);console.log('index.html syntax ok');"
```

Then commit and push with a focused message.

## Existing Portal Shape

Navigation currently includes:

- Overview
- Profitability
- P&L
- Mileage
- Clients
- Timesheets
- Compliance
- Settings

Add a new navigation item for:

```text
Leave
```

or:

```text
Annual Leave
```

Use the existing operational design language:

- Dark Gecko green hero band.
- Light/dark theme compatibility.
- Rounded but clipped cards.
- Mobile-first enough to work well as an iPhone web app.
- No marketing/landing-page style UI.
- Dense, useful operational dashboard style.

Relevant existing patterns to copy:

- Timesheets module for request/form/list style.
- Compliance module for status workflow.
- Mileage/P&L modules for month/tax-year calculations and summary cards.
- Settings health cards for small status indicators.

Important recent fixes already made:

- SharePoint date-only fields must not be read with `split('T')[0]`.
- Use the shared `spDateToLocalDateKey()` helper for SharePoint/Graph date fields so British Summer Time does not shift dates back one day.
- Rounded card children should be clipped with `overflow: hidden` where needed.

## Feature Goal

Add an Annual Leave function for Gecko IT.

Business context:

- Gecko IT is a small business run by Philip Morris and Jack Morris.
- Xero is used, but its annual leave accrual behaviour is not wanted.
- Gecko wants leave entitlement available upfront at the start of the tax year.
- The portal should show where each person is against their annual allowance in real time.
- The leave year should reset at the start of the UK tax year, expected to be 6 April unless confirmed otherwise.

User roles:

- Jack is an employee.
- Philip is the employer/director.

Workflow:

### Jack

Jack should be able to request leave.

He should be able to request:

- A number of hours.
- A set date range/time period.
- Optionally a half day or partial day if that fits the chosen data model.

When Jack submits a request:

- A leave request item is created in SharePoint.
- The status starts as `Pending`.
- Philip receives an email notification asking him to approve/reject.
- Once Philip approves, the request status becomes `Approved`.
- Approved leave appears in the shared calendar.
- Pending/rejected leave should be visible in Jack’s own request list/status area.

### Philip

Philip is the director/employer, so it does not make sense for him to request approval from himself.

Philip should be able to:

- Book his own leave directly.
- Have it immediately appear as approved/booked.
- See Jack’s requests and approve/reject them.

## Key Design Requirements

Create a single Leave section with:

### 1. Summary Cards

Show for Jack and Philip:

- Annual entitlement.
- Leave taken/booked.
- Pending leave.
- Remaining leave.
- Tax-year label, e.g. `2026/27`.

Use hours as the internal calculation unit, because Jack mentioned requesting leave by hours. Display days where useful if working-day hours are known.

### 2. Shared Calendar

Show a shared leave calendar for Jack and Philip.

Minimum viable approach:

- Month view.
- Previous/next month controls.
- Each day shows approved leave blocks.
- Pending leave could show with a muted/amber style.

Better if simple:

- List/calendar hybrid is acceptable if a full calendar becomes too much for the first version.

### 3. Request / Booking Form

For Jack:

- Request leave.
- Select date/start date/end date or hours.
- Add optional notes.
- Submit as pending.

For Philip:

- Book leave directly.
- Select person if needed.
- Mark as approved automatically for Philip’s own leave.
- Approve/reject Jack’s pending leave.

### 4. Requests Table

Show leave records with:

- Person.
- Date range.
- Hours.
- Status.
- Requested by.
- Approved by.
- Created date.
- Notes.
- Actions where appropriate.

### 5. Real-Time Calculations

The leave dashboard should calculate:

- Entitlement for the selected tax year.
- Approved/taken leave.
- Pending leave.
- Remaining leave.

Use SharePoint as the shared source of truth, not localStorage.

## SharePoint / Graph Architecture

The current portal resolves SharePoint site/list IDs via:

- `resolveSiteId()`
- `fetchAllLists()`
- `graphFetch()`

Use the existing patterns:

- Add a new module state object, likely `LEV`.
- Add `initLeave()` and lazy-load on `navTo('leave')`.
- Add CSS scoped under `#section-leave .lev-*`.
- Add a new SharePoint list, likely:

```text
GeckoLeaveRequests
```

Suggested SharePoint columns:

```text
Title                  Single line text
Person                 Choice or text: Jack, Philip
StartDate              Date only
EndDate                Date only
Hours                  Number
Status                 Choice: Pending, Approved, Rejected, Cancelled
LeaveType              Choice: Annual Leave, Sick, Other (optional)
Notes                  Multiple lines text
RequestedBy            Text/email
ApprovedBy             Text/email
ApprovedAt             Date/time
TaxYear                Text, e.g. 2026/27
CreatedByPortal        Yes/No or text (optional)
```

Optional second list:

```text
GeckoLeaveEntitlements
```

Suggested columns:

```text
Title                  e.g. Jack 2026/27
Person                 Jack/Philip
TaxYear                2026/27
EntitlementHours       Number
CarryOverHours         Number
AdjustmentHours        Number
Notes                  Text
```

Alternatively, keep entitlements in `CONFIG` if Jack and Philip prefer a simpler first version. SharePoint is better if entitlement needs changing without editing code.

## Email / Approval Reality Check

This is a static browser app with MSAL and Graph. There is no server backend.

There are three realistic ways to handle approval emails:

### Option A — Portal approval link

The portal creates a SharePoint item and sends Philip an email via Microsoft Graph `/me/sendMail` or another available mail route.

Email includes a link back to the portal, ideally with a request ID in the URL hash/query.

Philip signs in, opens Leave, and approves/rejects from inside the portal.

This is probably the best no-backend option.

### Option B — Power Automate approval

Create a Power Automate flow triggered by a new SharePoint item with `Status = Pending`.

Flow emails Philip and records approval/rejection back into SharePoint.

This is probably the best “proper approval email” option if Gecko already uses M365/Power Automate.

### Option C — Email only, manual portal approval

The portal creates a SharePoint item and sends/opens an email notification.

Philip manually approves in the portal.

Simpler, but less slick.

Do not pretend a static GitHub Pages app can securely process one-click email approvals without either:

- routing Philip back through the authenticated portal, or
- using Power Automate/SharePoint approval infrastructure.

## Clarification Needed Before Implementation

Ask Jack these questions before building:

1. What is the annual leave entitlement for Jack and Philip?
   - In days or hours.
   - What is a standard working day in hours?

2. Should the leave year definitely follow the UK tax year?
   - Expected: 6 April to 5 April.
   - Confirm whether they mean tax year or company holiday year.

3. How much leave has already been taken/booked this year?
   - Jack remaining entitlement.
   - Philip remaining entitlement.
   - Any historical leave that needs seeding.

4. Should bank holidays count against entitlement?
   - Yes/no.
   - If no, should the portal show them separately?

5. Should weekends be excluded automatically when calculating date ranges?
   - Probably yes.

6. Is leave calculated in hours, days, or both?
   - Recommended: store hours, display both.

7. Should Jack be able to cancel/edit a pending request?
   - Should approved leave require Philip to cancel?

8. What email approval path is preferred?
   - Portal approval link.
   - Power Automate approval.
   - Email notification only.

9. What should the SharePoint list be called?
   - Recommended: `GeckoLeaveRequests`.
   - Optional: `GeckoLeaveEntitlements`.

10. Should this be visible only to Jack and Philip?
    - Current portal login already restricts to signed-in Microsoft users, but UI permissions may still need role-aware behaviour.

## Implementation Sketch

Once clarified:

1. Add sidebar nav item.
2. Add `<section id="section-leave">`.
3. Add `SECTION_TITLES.leave = 'LEAVE'` or similar.
4. Add `if (sectionKey === 'leave') initLeave();` to `navTo()`.
5. Add CSS under `#section-leave .lev-*`.
6. Add `LEV` module state:

```js
const LEV = {
  initialised: false,
  loading: false,
  siteId: null,
  listIds: { requests: null, entitlements: null },
  requests: [],
  entitlements: [],
  selectedMonth: today().slice(0, 7),
  selectedTaxYear: leaveCurrentTaxYear(),
  filter: 'all'
};
```

7. Add SharePoint list resolution using `fetchAllLists()`.
8. Add read/write helpers using `graphFetch()`.
9. Add tax-year helper based on 6 April.
10. Add calendar/list rendering.
11. Add request/book/approve/reject actions.
12. Test with real SharePoint list(s).
13. Run syntax check.
14. Commit and push.

## Design Tone

This is not an HR SaaS product. It is a lightweight operational tool for two people.

Keep it:

- Clear.
- Low admin.
- Mobile usable.
- Quick to scan.
- Trustworthy with dates.
- Consistent with the existing Gecko portal style.

