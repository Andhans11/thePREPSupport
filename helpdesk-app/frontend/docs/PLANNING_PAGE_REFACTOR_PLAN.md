# PlanningPage refactor plan: split into smaller components

## Overview

`PlanningPage.tsx` is a single ~2,400-line file that handles the full planning/scheduling UI: week calendar, slot blocks (with drag/resize), user filter, selection popup, right panel (planlagt/godkjenn/søknader), and several modals. This plan splits it into **5–6 components** plus shared utilities and one optional hook, so each file has a clear responsibility and the page becomes an orchestrator.

**Goals:** Reduce file size, improve testability, make changes to calendar vs modals vs list independent, and keep behavior identical.

---

## Architecture decisions

- **State stays in PlanningPage (or a single hook).** Child components receive data and callbacks via props. No new context for planning; the page already has many interdependent state values (selection, modals, drag state, etc.).
- **Shared pure logic and constants** move to `utils/planningUtils.ts` and `types/planning.ts` so calendar, modals, and list can reuse them without prop drilling everything.
- **One folder:** `src/components/planning/` for all new planning UI components. Types/utils can live in `src/types/` and `src/utils/` next to existing code.
- **No behavior change:** Refactor only; no new features or UX changes in this pass.

---

## Current structure (summary)

| Section | Approx. lines | Description |
|--------|----------------|-------------|
| Constants + pure helpers + types | 1–185 | DAYS, SEGMENT_HEIGHT, colors, `computeCalendarHours`, `segmentToDate`, `timeLabel`, `getUserColor`, PlanningSlot types |
| State + refs | 186–240 | ~30+ useState, refs, weekDates, weekStart, weekEnd |
| Data fetching + effects | 246–340 | fetchSlots, fetchMembers, fetchBusinessHours, fetchPendingSlotRequests, fetchManagedTeamMemberIds, useEffects |
| Callbacks + derived data | 358–972 | prevWeek, getSelectionRange, visibleSlots, slotsInWeek, addSlotForMember, updateSlot, drag handlers, etc. |
| Early return (no tenant) | 966–973 | |
| JSX: header + filter + requests banner | 984–1023 | Page title, week nav, “Timeplan for bruker”, intro, user filter, pending requests banner |
| JSX: calendar panel | 1025–1372 | Grid header, time column, 7 day columns, segment cells, selection highlight, drop preview, **slot blocks** (drag/resize, edit/delete, approve/reject) |
| JSX: selection popup modal | 1375–1419 | Add/edit slot: day/time selects + member list (manager) or “Søk om vakt” (agent) |
| JSX: right panel | 1422–1931 | Reminder CTA, tabs (Planlagt / Godkjenn / Søknader), three list UIs, minimize |
| JSX: slot detail modal | 1934–2213 | Assigned user: view slot, request change/remove |
| JSX: schedule-for-user modal | 2216–2342 | Pick user, days, time, recurring |
| JSX: reject modal | 2345–2410 | Reject with optional comment |

---

## Implementation tasks

Execute in order; later tasks depend on earlier ones.

---

### Task 1: Add shared types and utils

- **Goal:** Move pure logic and constants out of `PlanningPage.tsx` so components can import them.
- **New/updated files:**
  - `src/types/planning.ts` (new)
  - `src/utils/planningUtils.ts` (new)

**In `src/types/planning.ts`:**
- Export: `PlanningSlotStatus`, `PlanningSlot`, `PlanningSlotRequest`, `CalendarHours`, `TeamMemberOption` (interface).
- Optionally: a type for “segment range” used in selection/drag, e.g. `{ dayIndex: number; segStart: number; segEnd: number }`.

**In `src/utils/planningUtils.ts`:**
- Constants: `DAYS`, `SEGMENTS_PER_HOUR`, `SEGMENT_HEIGHT`, `DAY_KEYS`, `USER_COLORS`, `BOOKED_SLOT_COLOR`, `REJECTED_SLOT_BG`, `DEFAULT_SCHEDULE`.
- Pure functions: `darkenHex`, `contrastTextOn`, `getUserColor`, `parseTimeToHour`, `computeCalendarHours`, `segmentToDate`, `timeLabel`, `getSlotMemberName`.
- No React, no hooks, no Supabase.

**In `PlanningPage.tsx`:**
- Replace the in-file constants/types/helpers (lines ~1–185) with imports from `types/planning` and `utils/planningUtils`.
- Run app and planning page; confirm layout and behavior unchanged.

**Dependencies:** None.

---

### Task 2: Extract PlanningCalendar component

- **Goal:** Move the calendar grid (header row + time column + day columns + segment cells + selection highlight + drop preview + slot blocks) into a single component.
- **New file:** `src/components/planning/PlanningCalendar.tsx`

**Component API (props):**
- **Data:** `weekDates`, `calendarHours` (or firstHour, segmentCount, daySegRange), `slots` (filtered for week + user filter), `businessHoursSchedule` (only if needed for “closed” styling), `selection`, `dropPreview`, `resizePreview`, `slotDragState`, `hoveredSlotId`, `recentlyUpdatedSlotId`.
- **Config / role:** `canManageSlots`, `members`, `teamMemberId`.
- **Callbacks:** `onCellMouseDown`, `onCellMouseEnter`, `onCellMouseUp`, `onSlotDragEnd`, `onOpenEditSlot`, `onOpenSlotDetail`, `onDeleteSlot`, `onSetSlotStatus`, `onDayAddClick` (for “+ Legg til” on day header), `getCellFromEvent` (or pass a stable handler from parent).
- **Refs:** Parent keeps `calendarGridRef` and passes it as `gridRef` if needed for getCellFromEvent; otherwise the component can own the ref and expose a callback or imperative handle. Prefer parent owning ref so `getCellFromEvent` and drag logic stay in one place.

**Implementation notes:**
- Keep slot block rendering (the `weekDates.map` → `daySlots.map` with layout, drag handles, edit/delete, approve/reject) inside this component.
- Keep segment grid rendering (time labels, cell mouse handlers, selection highlight, drop preview div) here.
- All slot layout logic (`getSlotColumnLayout`, `buildOverlapGroups`, `slotSegmentsByDay`, `getSlotDayIndex`) can stay in the page and be passed in as props, or move into this component; if moved, they need `weekDates`, `firstHour`, `slots` (filtered), so passing as props is simpler for a first cut. Alternatively, pass `slotSegmentsByDay` and `getSlotColumnLayout` and `getSlotDayIndex` from parent so the page remains the single place for “which slots are visible”.
- After extraction, `PlanningPage` renders `<PlanningCalendar ... />` and the calendar panel div wraps only this component (and possibly a sticky header if you split that later).

**Dependencies:** Task 1 (so the new component can import from `utils/planningUtils` and `types/planning`).

---

### Task 3: Extract PlanningSelectionPopup component

- **Goal:** Modal for “Valgt tid” / “Ledig tid”: when manager selects a range, show day/time dropdowns and member list (add/remove slot); when agent selects a free range, show “Søk om vakt”.
- **New file:** `src/components/planning/PlanningSelectionPopup.tsx`

**Component API (props):**
- **Open state:** `open: boolean`, `onClose: () => void`.
- **Selection state:** `selection`, `modalEdit`, `editingSlotId`, `setModalEdit`, `effectiveSelection` (or derive inside from showSelectionPopup + modalEdit).
- **Data:** `slotsOverlappingSelection`, `membersForFilterAndAdd`, `addingMemberId`, `weekDates`, `segmentCount`, `firstHour`, `canManageSlots`, `teamMemberId`.
- **Callbacks:** `onAddForMember(memberId)`, `onDeleteSlot(slotId)`, `onCloseSelectionPopup(skipSave?: boolean)`, `getSelectionRange(selection)`.
- **Constants:** Can import `DAYS`, `timeLabel` from `planningUtils`.

**Implementation notes:**
- The modal content has two branches: manager (day/time selects + list of members with Legg til/Fjern) and agent (text + “Søk om vakt” / Avbryt). Keep both branches in this component.
- Parent still owns `showSelectionPopup`, `selection`, `modalEdit`, `editingSlotId`, `addingMemberId` and passes them in; parent keeps `closeSelectionPopup` and `addSlotForMember` and passes as callbacks.

**Dependencies:** Task 1.

---

### Task 4: Extract PlanningRightPanel component

- **Goal:** Right column: reminder CTA, tabs (Planlagt / Godkjenn / Søknader), and the three list views (planlagte timer, dine godkjennelser, søknader). Includes minimize button and collapsed state.
- **New file:** `src/components/planning/PlanningRightPanel.tsx`

**Component API (props):**
- **State:** `listColumnMinimized`, `setListColumnMinimized`, `rightPanelTab`, `setRightPanelTab`, `sendingReminderAll`, `rejectSlotModal`, `setRejectSlotModal`, `rejectComment`, `setRejectComment`, `rejectSubmitting`, `setRejectSubmitting`.
- **Data:** `slotsInWeekForList`, `myPendingInWeek`, `myApprovablePendingInWeek`, `pendingFromOthersInWeek`, `weekDates`, `monthCapitalized`, `members`, `canManageSlots`, `currentTenantId`.
- **Callbacks:** `onSendReminder`, `setSlotsStatusOptimistic`, `fetchSlots`, `onOpenSlotDetail`, `onEditSlot`, `onDeleteSlot`, `onSetSlotStatus`, `onRejectSlot` (open reject modal with slot), `canApproveRejectSlot(slot)`.
- **Constants:** `DAYS` from planningUtils; `getSlotMemberName` from planningUtils.

**Implementation notes:**
- The right panel contains the “Send påminnelse” block, the tab bar, and three different list UIs. Keep all three list implementations inside this component (Planlagt by day, Godkjenn list with approve/reject, Søknader list). Reject modal can stay in parent and be opened via `onRejectSlot(slot)`; if you prefer, the reject modal can be moved into this component and receive `rejectSlotModal`, `rejectComment`, etc. as props and call parent to submit.
- Minimized view: same component, just conditional layout (narrow strip with icon + “Planlagte timer” vertical text).

**Dependencies:** Task 1.

---

### Task 5: Extract Slot Detail and Schedule/Reject modals (2–3 components)

- **Goal:** Replace the three large modal blocks in `PlanningPage` with components so the page JSX is short and readable.

**5a – PlanningSlotDetailModal**  
- **New file:** `src/components/planning/PlanningSlotDetailModal.tsx`
- **Props:** `slot`, `existingRequestForSlot`, `requestChangeRange`, `setRequestChangeRange`, `requestSubmitting`, `onClose`, `onSubmitRequest(type, requestedStartAt?, requestedEndAt?)`, `weekDates`, `segmentCount`, `firstHour`, `getSelectionRange`, `getSlotSegmentRange`. Uses `DAYS`, `timeLabel`, `Select` from UI.

**5b – PlanningScheduleForUserModal**  
- **New file:** `src/components/planning/PlanningScheduleForUserModal.tsx`
- **Props:** `open`, `onClose`, `scheduleMemberId`, `setScheduleMemberId`, `scheduleDays`, `toggleScheduleDay`, `scheduleStartSeg`, `setScheduleStartSeg`, `scheduleEndSeg`, `setScheduleEndSeg`, `scheduleRecurringUntil`, `setScheduleRecurringUntil`, `membersForFilterAndAdd`, `segmentCount`, `firstHour`, `currentWeekStart`, `onSubmit` (e.g. `addScheduleForUser`), `canManageSlots`, `teamMemberId`. Uses `DAYS`, `timeLabel`, `Select`.

**5c – PlanningRejectSlotModal**  
- **New file:** `src/components/planning/PlanningRejectSlotModal.tsx`
- **Props:** `slot`, `members`, `rejectComment`, `setRejectComment`, `submitting`, `onClose`, `onConfirm(comment: string | null)`. Uses `getSlotMemberName`, `format` from date-fns.

**In PlanningPage:** Replace the three modal blocks with:
- `<PlanningSlotDetailModal ... />`
- `<PlanningScheduleForUserModal ... />`
- `<PlanningRejectSlotModal ... />`

**Dependencies:** Task 1.

---

### Task 6: Optional – usePlanningData hook

- **Goal:** Move data fetching and derived lists into a single hook so `PlanningPage` is mostly “state + handlers + composition”. Optional; you can do Tasks 2–5 with state and fetch logic still in the page.
- **New file:** `src/hooks/usePlanningData.ts`

**Hook responsibilities:**
- Takes `currentTenantId`, `canManageSlots`, `role`, `teamMemberId`, `currentWeekStart`, `filterUserIds`.
- Fetches: slots (for week), members, business hours, pending slot requests, managed team member ids (for manager).
- Returns: `slots`, `setSlots`, `members`, `businessHoursSchedule`, `setBusinessHoursSchedule`, `pendingSlotRequests`, `managedTeamMemberIds`, `loading`, `fetchSlots`, `fetchMembers`, `fetchBusinessHours`, `fetchPendingSlotRequests`, `fetchManagedTeamMemberIds`, and derived: `visibleSlots`, `slotsInWeek`, `filteredSlotsInWeek`, `slotsInWeekForList`, `membersForFilterAndAdd`, `calendarHours` (from businessHoursSchedule).
- Page keeps: UI state (selection, modals, drag, filterUserIds, listColumnMinimized, rightPanelTab, etc.) and event handlers that call hook’s fetch/setters and the extracted components’ callbacks.

**Dependencies:** Task 1. Can be done after Task 2 or in parallel with 3–5.

---

### Task 7: Slim down PlanningPage and wire everything

- **Goal:** `PlanningPage` only: tenant check, state (or usePlanningData), handlers, and composition of header + filter + requests banner + `<PlanningCalendar />` + `<PlanningSelectionPopup />` + `<PlanningRightPanel />` + the three modals.
- **File:** `src/pages/PlanningPage.tsx`

**Steps:**
- Ensure all extracted components are imported and rendered with the correct props.
- Remove any duplicated logic that now lives in utils or children.
- Keep in the page: `weekDates`, `weekStart`, `weekEnd`, all UI state (selection, showSelectionPopup, modalEdit, listColumnMinimized, rightPanelTab, slotDetailSlot, scheduleForUserOpen, rejectSlotModal, slotDragState, dropPreview, resizePreview, etc.), and all handlers that coordinate between components (e.g. open edit → set selection + modalEdit + showSelectionPopup; closeSelectionPopup → clear selection and optionally save).
- Optional: introduce `usePlanningData` and replace local fetch + derived state with the hook.
- Final pass: run the app, go through manager and agent flows (add slot, edit, delete, approve/reject, request change/remove, schedule for user, reject with comment), and confirm no regressions.

**Dependencies:** Tasks 2, 3, 4, 5 (and 6 if you implemented it).

---

## File layout after refactor

```
src/
  types/
    planning.ts              # PlanningSlot, PlanningSlotRequest, CalendarHours, etc.
  utils/
    planningUtils.ts         # constants + pure helpers (getUserColor, segmentToDate, …)
  hooks/
    usePlanningData.ts      # (optional) fetch + derived slots/members/calendar
  components/
    planning/
      PlanningCalendar.tsx       # grid + slot blocks + selection + drop preview
      PlanningSelectionPopup.tsx # add/edit slot modal (manager + agent)
      PlanningRightPanel.tsx     # reminder + tabs + planlagt/godkjenn/søknader lists
      PlanningSlotDetailModal.tsx # assigned user: view slot, request change/remove
      PlanningScheduleForUserModal.tsx # recurring schedule modal
      PlanningRejectSlotModal.tsx # reject with comment
  pages/
    PlanningPage.tsx         # orchestrator: state, handlers, layout + above components
```

---

## Testing strategy

- **Manual:** After each extraction, run the app and:
  - Change week, open “Timeplan for bruker”, add slots (single and recurring).
  - Select range in calendar: add slot (manager), “Søk om vakt” (agent).
  - Edit slot (day/time), delete slot, approve/reject pending slots (own and others).
  - Open slot detail (assigned user), request change, request remove; reject with comment.
  - Toggle user filter, minimize right panel, switch tabs (Planlagt / Godkjenn / Søknader), send reminder.
- **Regression:** Drag/resize slot, selection highlight and drop preview during drag, “+ Legg til” on day header.
- **Unit tests (optional):** Add tests for `planningUtils` (e.g. `computeCalendarHours`, `segmentToDate`, `getUserColor`) and for pure helpers; test components with mock props later if desired.

---

## Order summary

1. **Task 1** – Types + utils (no UI change).
2. **Task 2** – PlanningCalendar (biggest UI chunk).
3. **Task 3** – PlanningSelectionPopup.
4. **Task 4** – PlanningRightPanel.
5. **Task 5** – Slot detail, Schedule for user, Reject modals.
6. **Task 6** – (Optional) usePlanningData.
7. **Task 7** – Slim page, wire all components, manual regression.

Doing 1 → 2 → 3 → 4 → 5 → 7 (skipping the hook) is enough to get the page split into 5–6 components; add Task 6 if you want the page to be even thinner.
