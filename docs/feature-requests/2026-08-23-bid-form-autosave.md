# Feature Request: Bid Form Autosave

**Status:** Implemented
**Area:** `src/pages/Form/BidForm.tsx`

## Summary

Autosave the bid form on a fixed 3-minute interval while a user is actively
on the Bid Form screen, using the exact same save path as the existing
**Save Draft** button. Also stop both Save Draft and autosave from
navigating the user away from the form.

## Current behavior (before this change)

- `handleSaveDraft()` calls `persistBidRecord("draft")`, which creates a
  `bidForms` doc if none exists yet (`currentBidId` unset), or updates the
  existing one. It does **not** run `validateForm()` — a draft can be saved
  with most fields blank, unlike Submit.
- On success it shows a modal ("Draft Saved") whose **Finish** button
  navigates to `/bids/{bidFormId}`.

## Requirements

1. **Timer** — starts a 3-minute autosave timer as soon as the Bid Form
   screen mounts, on a fixed cadence (ticks every 3 minutes regardless of
   when the last edit happened). The timer is cleared when the user
   navigates away from the Bid Form screen (component unmount); it never
   runs anywhere else in the app.
2. **Dirty tracking** — each autosave tick only writes if something has
   changed since the last save (manual or auto). If nothing changed, the
   tick is a no-op — nothing is written to Firestore.
3. **Same save path as Save Draft** — autosave reuses `persistBidRecord`
   and the workspace overview refresh. If no bid workspace exists yet, it
   creates one; if one exists, it updates it. No form validation is
   required, matching today's Save Draft behavior.
4. **Guardrails** — autosave is skipped when the user doesn't have edit
   permission on the bid (`canEditThisBid` is false), or when a save
   (manual Save Draft, Submit, or another autosave tick) is already in
   flight, to avoid overlapping writes.
5. **No more navigation on save** — both Save Draft and autosave keep the
   user on the Bid Form screen after saving:
   - Save Draft still shows the "Draft Saved" success modal with a
     **Finish** button, but Finish now just closes the modal instead of
     navigating away.
   - Autosave shows no modal at all.
6. **Autosave feedback** — a small, non-clickable banner appears fixed in
   the bottom-right corner of the screen (same visual convention as the
   existing bottom-right success banner on the Edit Profile screen),
   reading "Draft autosaved," and disappears on its own after 2 seconds.

7. **Unsaved-changes guard on Back** — clicking the Back button while the
   form is dirty no longer navigates immediately. Instead it shows an
   "Unsaved Changes" modal with two options:
   - **Save & Leave** — saves via the same path as Save Draft, then
     navigates back once the save completes.
   - **Keep Editing** — dismisses the modal and stays on the form; no
     navigation.
   If the form isn't dirty, Back navigates immediately as before, with no
   modal.

## Edge cases

- A brand-new, untouched bid form: the timer runs, but never writes,
  since nothing is dirty.
- User navigates away mid-form: the interval is cleared on unmount, so no
  stray save fires after they've left.
- A 3-minute tick lands while a manual save (or another autosave) is
  already in progress: the tick is skipped, not queued — it simply waits
  for the next 3-minute tick.
- An autosave tick fires while the "Unsaved Changes" modal is open (form
  became clean out from under it): the modal auto-closes since there's
  nothing left to warn about.

## Implementation notes

- `isDirty` state is set by every user-editing entry point (field
  changes, N/A toggles, line item add/edit/delete/reorder, AI-estimate
  apply) and cleared after any successful save, manual or auto. It is
  never set by the effects that hydrate the form from a profile or an
  existing bid record on load.
- The 3-minute `setInterval` is created once on mount (empty dependency
  array) so re-renders don't reset the cadence; it calls through a ref to
  always run the latest autosave logic with fresh form state.
- The Save Draft success modal gained a `closeOnly` flag so its Finish
  button can close the modal without the previous auto-navigate.
- The Back button's `onClick` was changed from `navigateBack` to
  `handleBackClick`, which branches on `isDirty` to either navigate
  immediately or open the new unsaved-changes modal.
