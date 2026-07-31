# Child Account Seats — Design / Architecture Spec

**Date:** 2026-07-23
**Status:** Approved design (brainstormed and approved section-by-section in a prior conversation). This document is the written spec only; it does not include implementation code.

## Overview

This feature adds paid **child account seats** to an existing Suros Logic subscription. One company (one Suros Logic account) can have multiple logged-in users: a parent/owner account plus up to **3** child/member seats. All users belong to the **same company** — this is a team-seats feature (like adding teammates), not multi-tenant SaaS-for-resale and not separate companies/DBAs. Each child seat is a genuinely separate Firebase Auth user (own email/password) linked to the parent through data rather than shared credentials. Child seats are priced as additional line items on the parent's single subscription, tiered by the AI plan-analyzer quota purchased for that seat, and are governed by an owner-configurable per-seat access level. Company branding is always inherited from the owner and rendered read-only for members, reflecting the one-company reality.

## Data Model

### Approach chosen: denormalized `accountId` (not a separate `accounts` collection)

Ownership is represented by a denormalized `accountId` field on every relevant document rather than by introducing a first-class `accounts` collection.

**Rationale:** nothing in scope requires ownership transfer, account merging, or a user belonging to multiple accounts. A separate `accounts` collection would be the "textbook" multi-tenant shape but is unnecessary migration weight right now. If a first-class collection is ever needed later, migrating from this denormalized approach is a contained, mechanical change because the shape is already implicit in the data.

### `users/{uid}` — new fields

| Field | Type | Applies to | Meaning |
|---|---|---|---|
| `accountId` | `string` | all users | The user's own uid if owner/standalone; the **parent's** uid if this is a child/member seat. |
| `accountRole` | `'owner' \| 'member'` | all users | Whether this user owns the account or is a member seat within someone else's account. |
| `memberPermission` | `'own' \| 'view_all_edit_own' \| 'full'` | members only | Per-seat access level, chosen by the owner. Only set when `accountRole === 'member'`. |
| `seatPlanAnalyzerLimit` | `number` (`1 \| 2 \| 3`) | members only | The plan-analyzer monthly quota purchased for this seat. Drives the member's `planAnalyzerUsage.monthlyLimit`. |
| `stripeSubscriptionItemId` | `string` | members only | The Stripe subscription line item billing this specific seat. |
| `stripeSubscriptionId` | `string` | owners | **New field required on the owner's doc.** Today only `stripeCustomerId` is stored, but attaching/removing seat line items requires the actual subscription id. This must be captured in the webhook alongside the existing fields (see Billing / Stripe). |

Existing users implicitly become standalone **owner** accounts (`accountId` = own uid, `accountRole = 'owner'`). Because Firestore queries cannot fall back to "field missing → use doc id," a one-time backfill script is required (see Migration) even though the default is conceptually obvious.

### Data documents — new `accountId` field

The following top-level collections each get an `accountId` field, set at creation time and denormalized from the creator's own `users` doc `accountId`:

- `planProjects` (`PlanProjectDocument`)
- `bidForms`
- `bidFormProposals`
- `changeOrder` (note: the Firestore collection name is singular, per `firestore.rules`, even though the TS model is `ChangeOrder`)
- `changeOrderProposals`
- `projectFiles` (bid workspace file uploads; top-level collection referenced by `bidFormId`; TS model name is `ProjectFile`)

The existing `userId` field on these documents is **unchanged in meaning** — it remains creator/attribution and is used for permission checks.

**Exception — `PlanProjectFileRecord`:** the Plan Analyzer files subcollection under `planProjects/{projectId}` does **not** need its own `accountId`. It lives in a true Firestore subcollection (not a separate top-level collection) and inherits access from its parent `planProjects` doc.

### Company branding resolution

Child seats do **not** have their own company profile. A shared helper — e.g. `getEffectiveCompanyProfile(profile)` — returns the branding fields as follows:

- If `accountRole === 'member'`: return the **owner's** branding fields (`companyName`, `companyAddress`, `slogan`, `companyLogoUrl`). This requires a lookup/join to the owner's `users` doc via `accountId`.
- Otherwise: return the profile's own branding fields.

This helper is used everywhere branding is rendered (bid PDFs, proposals, profile page, etc.) and in the onboarding / edit-profile form to pre-fill the read-only fields for members. Centralizing resolution avoids branding drift and matches the one-company reality.

**Per-document override across the bid workspace:** today, `company_name` and `company_address` can also be manually edited per-document in **all four** bid-workspace tabs — a document-level override distinct from the profile-level fields:

- `src/pages/Form/BidForm.tsx` (Bid Form tab)
- `src/pages/Proposals/BidFormProposalEditor.tsx` (Bid Proposal tab)
- `src/pages/Form/ChangeOrderForm.tsx` (Change Order Form tab)
- `src/pages/Proposals/ChangeOrderProposalEditor.tsx` (Change Order Proposal tab)

For **child/member accounts, this override must be disabled in all four**: the `company_name` / `company_address` fields render **read-only**, always reflecting the owner's values via `getEffectiveCompanyProfile`. This is consistent with branding being inherited, not editable, for members — the same rule as the onboarding form, just applied across the whole bid workspace.

### Onboarding / `profileComplete`

The existing `profileComplete` gate and edit-profile flow stay exactly as they are today — same route (`/edit-profile`), same form, same `profileComplete` computation logic (unchanged). For child seats, the `companyName` / `companyAddress` / `slogan` / `companyLogoUrl` fields render **pre-filled** (from the owner, via `getEffectiveCompanyProfile`) and **read-only/disabled**. Only `displayName`, `email`, and `phone` are editable by the child. `profileComplete` resolves to `true` the same way it does today — it just naturally becomes true once the child fills in their own editable fields, because the inherited branding fields are already populated.

## Permissions & Access Control

Three access levels, set by the owner per child seat:

| Level | Read | Write / Delete |
|---|---|---|
| `own` | only docs where `userId == self` | only docs where `userId == self` |
| `view_all_edit_own` | all docs where `accountId == own accountId` | only docs where `userId == self` |
| `full` | all docs where `accountId == own accountId` | all docs where `accountId == own accountId` |

The **owner** always has full read/write across the entire `accountId`. No permission field is needed for the owner.

### Workspace-file nuance (read at the workspace level, not per file)

Read-access permission checks apply at the **workspace** level, not fragmented per individual file. Specifically, `projectFiles` records (bid workspace file uploads — a top-level collection referenced by `bidFormId`, each with its own `userId`) must be **readable** by a `view_all_edit_own` or `full` member whenever that member can read the parent bid form (i.e. the bid form's `accountId` matches). It would be broken UX to show a member a bid workspace but selectively hide files inside it based on which teammate uploaded each one.

Edit/delete of a specific file still follows the normal per-document `userId == self` restriction:

- Under `own` and `view_all_edit_own`: a member can edit/delete only files they uploaded themselves.
- Under `full`: a member can edit/delete files uploaded by anyone in the account.

**This rule applies consistently to `projectFiles` and any other workspace-attached records:** read access is granted at the workspace level (parent-document `accountId` match), while edit/delete follows the per-document `userId == self` rule except under `full`.

### Enforcement — two places

Enforcement happens in two layers, and both must be implemented:

1. **Firestore security rules.** Rules must look up the requesting user's own `users/{uid}` doc (via `get()`) to read `accountId` / `accountRole` / `memberPermission`, then compare those against the target document's `accountId` / `userId` to authorize reads and writes according to the table above (and the workspace-file nuance).

2. **Client queries.** List views must query by `accountId` (not `userId`) for shared visibility, with an additional client-side `userId == self` filter applied when `memberPermission === 'own'`.

Rules live in `firestore.rules` at the repo root (registered in `firebase.json` under `"firestore": { "rules": "firestore.rules" }`). Today they are simple per-`userId` ownership checks for `users`, `projectFiles`, `bidForms`, `bidFormProposals`, `changeOrder`, `changeOrderProposals`, and `planProjects` (plus its subcollections, which check the parent `planProjects` doc's `userId` via `get()`). Every one of these `match` blocks will need to be rewritten to the `accountId` / `accountRole` / `memberPermission` model described above — currently they hard-code `request.auth.uid == resource.data.userId`, which has no notion of accounts or shared access at all.

### Seat management authorization

Seat management — adding/removing/upgrading seats and changing a member's permission level — is **owner-only**. This is enforced in **both**:

- **UI:** seat-management controls are hidden from members entirely.
- **Server:** the Cloud Function endpoint must verify `accountRole === 'owner'` server-side. Client-supplied role claims are never trusted.

## Billing / Stripe & Seat Lifecycle

### New Stripe recurring Prices

Add three new recurring Price env vars, following the existing `STRIPE_PRICE_ID_MONTHLY_150` pattern:

| Env var | Price/mo | Plan-analyzer quota for the seat |
|---|---|---|
| `STRIPE_PRICE_ID_CHILD_SEAT_1` | $55 | 1 analysis/month |
| `STRIPE_PRICE_ID_CHILD_SEAT_2` | $65 | 2 analyses/month |
| `STRIPE_PRICE_ID_CHILD_SEAT_3` | $75 | 3 analyses/month |

For comparison, the standalone owner plan is $150/mo and includes 3 analyses/month, so a maxed-out child seat ($75 for 3 analyses/month) is exactly **half** the standalone price for the same AI quota. This "not full price but not cheap" pricing is the deliberate anti-gaming lever.

**Seat cap:** hard cap of **3** child seats per parent account.

### Trial behavior

An owner still inside their initial free trial (`stripeSubscriptionStatus === 'trialing'`, from the existing `QUICKSTART_TRIAL_DAYS` landing-checkout trial) **can** add child seats during the trial:

- **No charge for seats until the original trial ends.** When a seat's Stripe subscription item is added to a subscription that is currently `trialing`, it must inherit the subscription's existing `trial_end` rather than billing immediately — Stripe's default behavior when adding an item to a trialing subscription already does this (the item rides the subscription-level trial), so the seat-creation call must **not** override `proration_behavior`/`trial_end` in a way that forces an immediate charge. Once the trial ends, normal billing (at the seat's chosen tier price) begins for that item along with the rest of the subscription.
- **Every team member is capped at 1 plan analysis/month while the account is in trial, regardless of the tier purchased for that seat.** A seat purchased at the 2 or 3/month tier still only gets 1 analysis/month during the trial — the higher tier only takes effect once the trial ends and normal billing begins. This reuses the existing `TRIAL_PLAN_ANALYSIS_MONTHLY_LIMIT` constant (already `1`, already used for the owner's own trial quota in `planAnalyzerQuota.js`) rather than introducing a new constant.

This means `getPlanAnalyzerMonthlyLimit(profile)` (see Plan-analyzer quota logic change, below) needs to check trial status for members too, not just owners. Since members don't carry their own Stripe subscription — they mirror the owner's `stripeSubscriptionStatus` via the webhook propagation described below — that mirrored field is what drives the trial check for members as well.

A new child seat created while the owner is `trialing` must have its `users/{childUid}` doc's `stripeSubscriptionStatus` set to `'trialing'` at creation time (not just wait for the next webhook event) so the 1/month trial cap applies from the moment the seat is created, not only after the next webhook fires.

### Billing structure

**One subscription per parent account**, with child seats added as **additional line items** on that same subscription (not separate subscriptions). This yields a single invoice, a single payment method, and automatic Stripe proration when seats are added, changed, or removed.

### Seat management endpoint

Seat management runs through a new owner-only Cloud Function endpoint — likely a new route file, e.g. `functions/routes/manageSeats.js`, mounted in `functions/index.js` the same way `stripe.js` is mounted; alternatively it may be added to `stripe.js` directly.

#### Add a seat (owner-only)

1. Verify the caller is `accountRole: 'owner'`, has an active or trialing subscription, and currently has **fewer than 3** active child seats. (`trialing` is explicitly allowed — see Trial Behavior above.)
2. **Check whether the submitted email already belongs to an existing Firebase Auth user** (`auth().getUserByEmail(email)`, same helper pattern as `getAuthUserByEmail` in `stripe.js`). If it does — whether that's an existing standalone owner account or a member seat under any account — **reject the request with an error** (e.g. HTTP 409, "An account with this email already exists") and take no further action. An email can only ever belong to one account; existing accounts cannot be converted into a seat this way.
3. `stripe.subscriptionItems.create()` on the parent's subscription (using the owner's new `stripeSubscriptionId` field) with the chosen tier's Price. Do not override `proration_behavior`/`trial_end` in a way that forces an immediate charge — if the subscription is currently `trialing`, the new item must ride the existing `trial_end` (Stripe's default when adding an item to a trialing subscription).
4. Create the Firebase Auth user for the child's email **with no password set** (`admin.auth().createUser({ email })`) plus a `users/{childUid}` doc with all the member fields described in Data Model, **plus `stripeSubscriptionStatus` set to match the owner's current status right now** (e.g. `'trialing'` if the owner is mid-trial) so the trial quota cap (see Trial Behavior) applies immediately rather than waiting for the next webhook event. Company branding fields are left **blank** (inherited via `getEffectiveCompanyProfile`, not copied).
5. Generate a password-reset link (`admin.auth().generatePasswordResetLink(email)`) and send it via the existing `sendResetEmail` helper in `stripe.js`, with copy adjusted for an invite context (e.g. "You've been added to [Company Name]'s team on Suros Logic — set your password to log in" instead of "your account has been created"). The teammate sets their password via that link and logs in directly — no separate "accept invite" step.

#### Change a seat's tier

`stripe.subscriptionItems.update()` to swap the Price (prorated automatically by Stripe), then update `seatPlanAnalyzerLimit` and `planAnalyzerUsage.monthlyLimit` in the child's Firestore doc.

#### Change a seat's permission level

A pure Firestore update to `memberPermission`. No Stripe interaction is involved.

#### Remove a seat

1. `stripe.subscriptionItems.del()` to remove the seat's line item from the subscription.
2. `admin.auth().updateUser(childUid, { disabled: true })` to revoke login access.

The child's `users` doc and **all data they created are left completely intact** — do not delete or archive anything. Historical data (bids, plan projects, files, etc.) is **company data, not personal data**: it stays and remains fully visible/editable by the owner and any remaining `full` / `view_all_edit_own` members. Only that person's login access is revoked.

### Subscription-wide status propagation (webhook change)

Today, the webhook handlers in `stripe.js` (`updateSubscriptionStatus()`, invoked from `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`, and also from `invoice.payment_succeeded`) update **only the single user doc** matching `stripeCustomerId`.

This must be extended: after updating the owner's doc, also query `users where accountId == <thatOwnerUid> and accountRole == 'member'` and propagate `isSubscribed` and `stripeSubscriptionStatus` to **every child doc** as well. Because children ride entirely on the parent's one subscription, if the parent's card fails or the subscription is cancelled, every child seat must lose access too — not just the parent.

Additionally, the `stripeSubscriptionId` field must now be **captured on the owner's doc** during the webhook flow (e.g. in `checkout.session.completed`, where the subscription is already retrieved), since attaching/removing seat line items requires the subscription id and only `stripeCustomerId` is stored today.

### Plan-analyzer quota logic change

In `functions/routes/lib/planAnalyzerQuota.js`, `getPlanAnalyzerMonthlyLimit(profile)` needs **two added branches** for `accountRole === 'member'`, checked in this order:

1. If `profile.stripeSubscriptionStatus === 'trialing'` (mirrored from the owner via webhook propagation, or set at seat-creation time — see Trial Behavior), return `TRIAL_PLAN_ANALYSIS_MONTHLY_LIMIT` (the existing constant, `1`) — **regardless of `seatPlanAnalyzerLimit`**. Every team member is capped at 1 analysis/month while the account is in trial, even a seat purchased at the 2 or 3/month tier.
2. Otherwise, return `profile.seatPlanAnalyzerLimit` directly, rather than deriving the limit from `stripeSubscriptionStatus` the way owners do. Once the trial ends and the account is `active`, the member's purchased tier takes effect.

Everything else in that file (period keys, and the reservation/completion/failure transactions) already works per-uid without changes, because it is already keyed off each user's own doc.

## Migration

A **one-time backfill script** is required:

- On every existing `users` doc: set `accountId = uid` and `accountRole = 'owner'`.
- On every existing doc in `planProjects`, `bidForms`, `bidFormProposals`, `changeOrder`, `changeOrderProposals`, and `projectFiles`: set `accountId = userId` (copying the value of the existing `userId` field).

After the backfill, everyone's behavior is unchanged: every existing user simply becomes the owner of an account of one. (`PlanProjectFileRecord` needs no backfill — it inherits access from its parent `planProjects` doc.)

## UI Changes

### New "Team" page/section (owner-only)

A new owner-only nav item / page that provides:

- A **list of child seats** showing each seat's tier, permission level, and status (active / removed).
- An **"Add Seat" flow**: email input + tier picker (showing $55 / $65 / $75 pricing) + permission-level picker.
- **Edit an existing seat's tier or permission level.**
- **Remove a seat.**

This section is hidden entirely from members (and its endpoints are enforced owner-only server-side).

### Edit-profile / onboarding form

Same route and same form as today (no new page). For `accountRole === 'member'`, the `companyName` / `companyAddress` / `slogan` / `companyLogoUrl` fields render **read-only and pre-filled** via `getEffectiveCompanyProfile`. Only `displayName`, `email`, and `phone` are editable.

### Bid workspace tabs (Bid Form, Bid Proposal, Change Order Form, Change Order Proposal)

All four bid-workspace tabs currently allow manually editing `company_name` / `company_address` per-document:

- `src/pages/Form/BidForm.tsx`
- `src/pages/Proposals/BidFormProposalEditor.tsx`
- `src/pages/Form/ChangeOrderForm.tsx`
- `src/pages/Proposals/ChangeOrderProposalEditor.tsx`

For `accountRole === 'member'`, these two fields render **read-only** in all four tabs, populated from `getEffectiveCompanyProfile` (the owner's values) — same inheritance rule as the profile form, applied at the document level.

### List views

Dashboard, Bids, Plan Analyzer, Proposals, and anywhere `projectFiles` are listed must switch their underlying Firestore queries from `where("userId", "==", uid)` to `where("accountId", "==", accountId)`, with an additional client-side `userId == self` filter applied **only** when `memberPermission === 'own'`.

## Testing

### Unit tests

- **Extended `getPlanAnalyzerMonthlyLimit()` member branch** — covering `accountRole === 'member'` returning `seatPlanAnalyzerLimit` directly. Follow the existing pattern in `functions/test/plan-analyzer-quota.test.js`.
- **New seat-management endpoint** — cover:
  - seat-cap enforcement (max 3),
  - owner-only auth check (`accountRole === 'owner'` required),
  - Stripe subscription-item create/update/delete calls (mocked),
  - correct Firestore writes.

### Webhook test

- Confirm that a subscription status change on the owner **propagates to all child `users` docs** sharing that `accountId`.

### Manual / browser verification

- Exercise the Team page end to end: add, upgrade, downgrade, and remove a seat.
- Cross-account visibility: log in as a child seat under **each of the 3 permission levels** and confirm exactly what is visible/editable — including `projectFiles` attached to bid forms created by other members (verifying the workspace-level read rule).

## Open Items

None outstanding. (The Firestore security rules location was previously an open item — resolved above; rules live in `firestore.rules` at the repo root.)
