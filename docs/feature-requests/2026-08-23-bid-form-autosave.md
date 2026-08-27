# Feature Request: Bid Form Autosave

**Status:** Implemented
**Area:** `src/pages/Form/BidForm.tsx`

## Summary

Autosave the bid form on a ~5-minute cadence while a user is actively
on the Bid Form screen, using the exact same save path as the existing
**Save Draft** button. Also stop both Save Draft and autosave from
navigating the user away from the form.

### 2026-08-26 update — never clear text the user is entering

The original fixed `setInterval` could fire mid-keystroke. Autosave's
`updateDoc` bounces back through the `onSnapshot` listener on the bid doc,
which re-hydrated `form` / `lineItems` from the just-written (already stale)
snapshot and wiped the characters typed since the tick started. Two changes
fix this:

1. **Typing-aware cadence.** `markDirty()` records `lastTypedAtRef` (a
   wall-clock timestamp). The autosave scheduler waits the full 5 minutes,
   then — if the user has typed within the last 3 seconds — keeps deferring
   until there is a clean 3-second gap with no typing before it writes. The
   next 5-minute countdown starts only after the save finishes. Implemented
   as a self-rescheduling `setTimeout` chain rather than `setInterval`.
2. **Hydrate the form once per bid.** The effect that copies `prefillBid`
   into `form` / `lineItems` / `numLineItems` now runs only the first time it
   sees a given bid (`hydratedBidKeyRef`, keyed on `prefillBid.id`, or
   `"__new_bid__"` for an unsaved one). Later snapshots for that same bid —
   including the ones autosave's own writes trigger — still refresh the
   record id and timeline stage but never overwrite live form state. If the
   route switches to a different bid while the screen stays mounted, the key
   changes and the new bid hydrates fresh. Trade-off: a concurrent edit to
   the same draft from another device is not reflected until reload, which is
   acceptable for this single-user editing flow.

   This guard — not the typing pause in (1) — is what guarantees autosave
   never clears text the user has entered. The typing pause only keeps a
   save from firing mid-edit.

3. **Tax "N/A" no longer reverts.** Pre-existing bug surfaced by autosave:
   loading a bid saved with tax marked N/A hydrated `form.tax_percentage`
   as the default `"7"` (while `isTaxAmountNA` was set to `true` separately).
   Since `persistBidRecord` writes `form` verbatim, the next Save Draft or
   autosave overwrote the stored `"N/A"` with `"7"`, so the toggle reverted
   on the following load — and 7% tax silently reappeared in the total. The
   hydration effect now keeps `"N/A"` in `form.tax_percentage`, matching how
   `customer_phone` / `customer_email` N/A is already handled.

4. **Workspace-overview generation moved to the cheapest model.** Autosave
   still regenerates the overview on every cycle (same path as Save Draft),
   but since that now runs every ~5 minutes per open bid form, the
   `generateBidWorkspaceOverview` function was switched from `gpt-5-mini`
   / `reasoning_effort: "low"` to `gpt-5-nano` / `reasoning_effort:
   "minimal"`, with `max_completion_tokens: 500` and `response_format:
   { type: "json_object" }`. It's a 2–4 sentence summary from structured
   fields, so nano is more than enough and roughly 5× cheaper per call.

5. **Edits made mid-save are no longer dropped from the dirty flag.**
   `persistBidRecord` captures `form` / `lineItems` when it's called, but the
   write plus the overview AI refresh take a few seconds. Anything typed in
   that window isn't in the written snapshot, yet the trailing
   `setIsDirty(false)` used to clear the flag anyway — so the edits weren't
   saved and the Back "unsaved changes" guard wouldn't warn. `markDirty()`
   now bumps `editSeqRef`; `runAutosave` and `handleSaveDraft` snapshot it
   before the save and only clear `isDirty` if it's unchanged afterward,
   leaving the form dirty (and the next autosave cycle / Back guard armed)
   otherwise.

## Current behavior (before this change)

- `handleSaveDraft()` calls `persistBidRecord("draft")`, which creates a
  `bidForms` doc if none exists yet (`currentBidId` unset), or updates the
  existing one. It does **not** run `validateForm()` — a draft can be saved
  with most fields blank, unlike Submit.
- On success it shows a modal ("Draft Saved") whose **Finish** button
  navigates to `/bids/{bidFormId}`.

## Requirements

1. **Timer** — starts a 5-minute autosave timer as soon as the Bid Form
   screen mounts. When the 5 minutes elapse, if the user has typed within
   the last 3 seconds the write is deferred until there is a 3-second gap
   with no typing; the next 5-minute countdown then starts from when the
   save completes. The timer is cleared when the user navigates away from
   the Bid Form screen (component unmount); it never runs anywhere else in
   the app.
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
- A 5-minute tick lands while a manual save (or another autosave) is
  already in progress: `runAutosave` no-ops on the in-flight guard, and the
  scheduler starts the next 5-minute countdown.
- The user is typing continuously across the 5-minute mark: the write is
  held until they pause for 3 seconds, so it never lands on top of text
  still being entered.
- An autosave tick fires while the "Unsaved Changes" modal is open (form
  became clean out from under it): the modal auto-closes since there's
  nothing left to warn about.

## Implementation notes

- `isDirty` state is set by every user-editing entry point (field
  changes, N/A toggles, line item add/edit/delete/reorder, AI-estimate
  apply) and cleared after a successful save (manual or auto) **unless the
  user edited again while that save was in flight** — see update note 5. It
  is never set by the effects that hydrate the form from a profile or an
  existing bid record on load.
- The autosave scheduler is a self-rescheduling `setTimeout` chain created
  once on mount (empty dependency array) so re-renders don't reset the
  cadence; it calls through a ref to always run the latest autosave logic
  with fresh form state. `lastTypedAtRef` is updated in `markDirty()` and
  read by the scheduler to hold off while the user is mid-keystroke.
- `hydratedBidKeyRef` gates the `prefillBid` → form/lineItems effect so it
  only populates fields the first time it sees a given bid; later snapshots
  for that bid (including autosave's own write echoed back through
  `onSnapshot`) can't clobber live edits. A route change to a different bid
  changes the key and re-hydrates.
- The Save Draft success modal gained a `closeOnly` flag so its Finish
  button can close the modal without the previous auto-navigate.
- The Back button's `onClick` was changed from `navigateBack` to
  `handleBackClick`, which branches on `isDirty` to either navigate
  immediately or open the new unsaved-changes modal.
