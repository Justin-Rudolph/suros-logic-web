/**
 * Seat-management business logic for child account seats.
 *
 * All Firebase / Stripe access is dependency-injected so the logic can be unit
 * tested with mocks (see functions/test/manage-seats.test.js). The Express
 * wiring that supplies the real dependencies lives in ../manageSeats.js.
 */

const MAX_CHILD_SEATS = 3;
// A trial gets a single seat: enough to see how team access works, not enough
// to run a whole crew on it.
const TRIAL_MAX_CHILD_SEATS = 1;
const VALID_TIERS = [1, 2, 3];
const VALID_PERMISSIONS = ["own", "view_all_edit_own", "full"];
const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"];

/** How many seats this owner may hold, given where their subscription is. */
const seatCapFor = (owner = {}) =>
  owner.stripeSubscriptionStatus === "trialing"
    ? TRIAL_MAX_CHILD_SEATS
    : MAX_CHILD_SEATS;

const seatError = (message, statusCode, extra = {}) => {
  const error = new Error(message);
  // Extras first, so the fields below always win. A caller passing statusCode
  // or isSeatError in here would otherwise silently override them — and losing
  // isSeatError turns a message written for the user into a generic 500.
  Object.assign(error, extra);
  error.statusCode = statusCode;
  // Marks this as a message written for the user. Stripe/Firebase errors also
  // carry a statusCode, so without this the route layer cannot tell which
  // messages are safe to show.
  error.isSeatError = true;
  return error;
};

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const normalizeTier = (tier) => {
  const value = Number(tier);
  return VALID_TIERS.includes(value) ? value : null;
};

const isValidPermission = (permission) => VALID_PERMISSIONS.includes(permission);

/** True when the owner has a subscription Stripe will still accept writes on. */
const hasLiveSubscription = (owner = {}) =>
  owner.isSubscribed === true &&
  ACTIVE_SUBSCRIPTION_STATUSES.includes(owner.stripeSubscriptionStatus) &&
  Boolean(owner.stripeSubscriptionId);

/**
 * @param {Object} deps
 * @param {FirebaseFirestore.Firestore} deps.db
 * @param {Object} deps.stripe                Stripe client (subscriptionItems.*)
 * @param {Object} deps.authAdmin             admin.auth() instance
 * @param {(tier:number)=>string|undefined} deps.getChildSeatPriceId
 * @param {Function} deps.getPlanAnalyzerMonthlyLimit
 * @param {(to:string, link:string, company:string)=>Promise<void>} deps.sendSeatInviteEmail
 * @param {()=>*} deps.now                     server timestamp factory
 */
const createSeatManager = (deps) => {
  const {
    db,
    stripe,
    authAdmin,
    getChildSeatPriceId,
    getPlanAnalyzerMonthlyLimit,
    sendSeatInviteEmail,
    now,
  } = deps;

  const loadOwner = async (ownerUid) => {
    const ownerRef = db.collection("users").doc(ownerUid);
    const ownerSnap = await ownerRef.get();

    if (!ownerSnap.exists) {
      throw seatError("Account was not found.", 404);
    }

    const owner = ownerSnap.data() || {};

    if (owner.accountRole !== "owner") {
      throw seatError("Only account owners can manage seats.", 403);
    }

    return { ownerRef, owner };
  };

  const loadMemberSeat = async (ownerUid, childUid) => {
    const childRef = db.collection("users").doc(childUid);
    const childSnap = await childRef.get();

    if (!childSnap.exists) {
      throw seatError("Seat was not found.", 404);
    }

    const child = childSnap.data() || {};

    if (child.accountRole !== "member" || child.accountId !== ownerUid) {
      throw seatError("Seat does not belong to this account.", 403);
    }

    return { childRef, child };
  };

  /**
   * The price a seat is currently billed at. Seats created before
   * quantity-based billing have no `stripeSeatPriceId`, so fall back to
   * deriving it from their tier — no backfill required.
   */
  const seatPriceId = (child) =>
    child.stripeSeatPriceId || getChildSeatPriceId(child.seatPlanAnalyzerLimit);

  /**
   * Makes Stripe match Firestore: one subscription item per seat tier, with
   * `quantity` = the number of active seats on that tier. Stripe permits only
   * ONE item per price, so seats sharing a tier must share an item.
   *
   * Deliberately absolute rather than a +1/-1 delta. Stripe has no atomic
   * increment, so a relative read-modify-write lets two concurrent seat
   * operations both read the same stale quantity and lose one of the changes.
   * Deriving the target from Firestore — the source of truth — means
   * concurrent operations converge on the correct number, retries are
   * harmless, and any existing drift between Firestore and Stripe self-heals
   * on the next seat change instead of persisting forever.
   *
   * Callers MUST write their Firestore change before calling this.
   *
   * Returns a Map of priceId -> resulting subscription item.
   */
  const syncSeatBilling = async ({ ownerUid, subscriptionId }) => {
    if (!subscriptionId) return new Map();

    const snap = await db
      .collection("users")
      .where("accountId", "==", ownerUid)
      .where("accountRole", "==", "member")
      .get();

    const desired = new Map();
    // Prices this account's billing owns. Seeded from current config, plus any
    // price a seat actually references, so rotated price IDs still get cleaned
    // up rather than billing forever. Anything outside this set — notably the
    // owner's own plan item — is never touched.
    const managedPrices = new Set(
      VALID_TIERS.map((tier) => getChildSeatPriceId(tier)).filter(Boolean)
    );

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const priceId = seatPriceId(data);
      if (!priceId) continue;
      managedPrices.add(priceId);
      if (data.seatStatus === "removed") continue;
      desired.set(priceId, (desired.get(priceId) || 0) + 1);
    }

    let list;
    try {
      list = await stripe.subscriptionItems.list({
        subscription: subscriptionId,
        limit: 100,
      });
    } catch (err) {
      // A cancelled subscription takes all of its line items with it, so there
      // is nothing left to reconcile. Treat it as "no items" rather than
      // failing the caller with a raw Stripe message.
      if (err?.code === "resource_missing" || err?.statusCode === 404) {
        return new Map();
      }
      throw err;
    }

    const byPrice = new Map();

    for (const item of list?.data || []) {
      const priceId = item.price?.id || item.plan?.id;
      if (!managedPrices.has(priceId)) continue;

      const target = desired.get(priceId) || 0;
      desired.delete(priceId);

      if (target <= 0) {
        await stripe.subscriptionItems.del(item.id);
        continue;
      }

      byPrice.set(
        priceId,
        (Number(item.quantity) || 0) === target
          ? item
          : await stripe.subscriptionItems.update(item.id, { quantity: target })
      );
    }

    // Tiers that just gained their first seat have no item yet.
    for (const [priceId, quantity] of desired) {
      byPrice.set(
        priceId,
        await stripe.subscriptionItems.create({
          subscription: subscriptionId,
          price: priceId,
          quantity,
        })
      );
    }

    return byPrice;
  };

  const countActiveSeats = async (ownerUid) => {
    const snap = await db
      .collection("users")
      .where("accountId", "==", ownerUid)
      .where("accountRole", "==", "member")
      .get();

    return snap.docs.filter((doc) => (doc.data() || {}).seatStatus !== "removed")
      .length;
  };

  /**
   * Firestore Timestamps serialize to {_seconds,_nanoseconds} over JSON, which
   * the client can't format. Send an ISO string instead and let the browser
   * render it in the viewer's own timezone.
   */
  const toIsoDate = (value) => {
    if (!value) return undefined;
    const date =
      typeof value.toDate === "function"
        ? value.toDate()
        : value instanceof Date
          ? value
          : typeof value === "number"
            ? new Date(value)
            : undefined;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
  };

  const toSeatSummary = (uid, data) => ({
    uid,
    email: data.email || "",
    displayName: data.displayName || "",
    seatPlanAnalyzerLimit: data.seatPlanAnalyzerLimit,
    memberPermission: data.memberPermission,
    seatStatus: data.seatStatus || "active",
    stripeSubscriptionStatus: data.stripeSubscriptionStatus,
    createdAt: toIsoDate(data.createdAt),
  });

  const listSeats = async (ownerUid) => {
    await loadOwner(ownerUid);

    const snap = await db
      .collection("users")
      .where("accountId", "==", ownerUid)
      .where("accountRole", "==", "member")
      .get();

    return snap.docs.map((doc) => toSeatSummary(doc.id, doc.data() || {}));
  };

  const addSeat = async ({ ownerUid, email, tier, permission }) => {
    const { owner } = await loadOwner(ownerUid);

    const status = owner.stripeSubscriptionStatus;
    if (
      owner.isSubscribed !== true ||
      !ACTIVE_SUBSCRIPTION_STATUSES.includes(status)
    ) {
      throw seatError(
        "An active or trialing subscription is required to add seats.",
        402
      );
    }

    const subscriptionId = owner.stripeSubscriptionId;
    if (!subscriptionId) {
      throw seatError(
        "No Stripe subscription is on file for this account.",
        409
      );
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw seatError("A valid email is required.", 400);
    }

    const normalizedTier = normalizeTier(tier);
    if (normalizedTier === null) {
      throw seatError("Tier must be 1, 2, or 3.", 400);
    }

    if (!isValidPermission(permission)) {
      throw seatError("Invalid permission level.", 400);
    }

    const priceId = getChildSeatPriceId(normalizedTier);
    if (!priceId) {
      throw seatError("Seat pricing is not configured.", 500);
    }

    // An email can only ever belong to one account.
    let existingAuthUser = null;
    try {
      existingAuthUser = await authAdmin.getUserByEmail(normalizedEmail);
    } catch (err) {
      if (err?.code !== "auth/user-not-found") {
        throw err;
      }
    }

    if (existingAuthUser) {
      throw seatError("An account with this email already exists.", 409);
    }

    const seatCap = seatCapFor(owner);
    const activeSeats = await countActiveSeats(ownerUid);
    if (activeSeats >= seatCap) {
      // On a trial this is a paywall rather than a hard ceiling, so say what
      // unlocks it and tag the error for the client to act on.
      const onTrialCap = seatCap < MAX_CHILD_SEATS;
      throw seatError(
        onTrialCap
          ? `Your trial includes ${seatCap} team member${seatCap === 1 ? "" : "s"}. Upgrade to the full plan to add more.`
          : `This account already has the maximum of ${MAX_CHILD_SEATS} seats.`,
        409,
        onTrialCap ? { upgradeRequired: true } : {}
      );
    }

    // Nothing is billed yet, so a failure here needs no billing rollback.
    const childUser = await authAdmin.createUser({ email: normalizedEmail });

    const monthlyLimit = getPlanAnalyzerMonthlyLimit({
      accountRole: "member",
      stripeSubscriptionStatus: status,
      seatPlanAnalyzerLimit: normalizedTier,
    });

    const childDoc = {
      uid: childUser.uid,
      email: normalizedEmail,
      displayName: "",
      // Branding is inherited from the owner via getEffectiveCompanyProfile —
      // left blank here, never copied.
      accountId: ownerUid,
      accountRole: "member",
      memberPermission: permission,
      seatPlanAnalyzerLimit: normalizedTier,
      // The price is what identifies this seat's billing; the item id is a
      // shared pointer kept for debugging only, since seats on the same tier
      // share one item. Never mutate billing via the stored item id.
      stripeSeatPriceId: priceId,
      // Intentionally NO stripeCustomerId: members ride the owner's single
      // subscription and must never be able to open the owner's billing portal.
      // Their isSubscribed / status is mirrored via the accountId webhook query.
      // Mirror the owner's current status right now so the trial quota cap
      // applies immediately rather than waiting for the next webhook event.
      stripeSubscriptionStatus: status,
      isSubscribed: true,
      seatStatus: "active",
      profileComplete: false,
      createdAt: now(),
      planAnalyzerUsage: {
        monthlyLimit,
        used: 0,
        reserved: 0,
      },
    };

    const childRef = db.collection("users").doc(childUser.uid);
    await childRef.set(childDoc, { merge: true });

    // Billing is derived from Firestore, so the seat doc must exist first.
    // Do NOT override proration_behavior / trial_end: if the subscription is
    // currently trialing, a new item rides the existing trial_end (Stripe's
    // default), so nothing bills immediately during the trial.
    let billedItems;
    try {
      billedItems = await syncSeatBilling({ ownerUid, subscriptionId });
    } catch (err) {
      // Undo the seat completely — a billing failure must not leave a usable
      // unbilled login behind, and deleting the auth user frees the email so
      // the owner can simply retry.
      try {
        await childRef.delete();
        await authAdmin.deleteUser(childUser.uid);
      } catch (rollbackErr) {
        // Best-effort rollback; surface the original failure.
      }
      throw err;
    }

    const subscriptionItemId = billedItems.get(priceId)?.id;
    if (subscriptionItemId) {
      childDoc.stripeSubscriptionItemId = subscriptionItemId;
      // Debug-only pointer; never fail a completed seat over it.
      try {
        await childRef.update({ stripeSubscriptionItemId: subscriptionItemId });
      } catch (err) {
        // Ignored on purpose.
      }
    }

    // Invite email: set-password link, best-effort (mirrors owner checkout).
    try {
      const resetLink = await authAdmin.generatePasswordResetLink(
        normalizedEmail
      );
      await sendSeatInviteEmail(normalizedEmail, resetLink, owner.companyName);
    } catch (err) {
      // Owner can re-trigger via forgot-password; don't fail seat creation.
    }

    return toSeatSummary(childUser.uid, childDoc);
  };

  const changeSeatTier = async ({ ownerUid, childUid, tier }) => {
    const { owner } = await loadOwner(ownerUid);
    const { childRef, child } = await loadMemberSeat(ownerUid, childUid);

    const normalizedTier = normalizeTier(tier);
    if (normalizedTier === null) {
      throw seatError("Tier must be 1, 2, or 3.", 400);
    }

    const priceId = getChildSeatPriceId(normalizedTier);
    if (!priceId) {
      throw seatError("Seat pricing is not configured.", 500);
    }

    if (!hasLiveSubscription(owner)) {
      throw seatError(
        "An active or trialing subscription is required to change a seat's plan.",
        402
      );
    }

    const subscriptionId = owner.stripeSubscriptionId;
    const previousPriceId = seatPriceId(child);
    if (!previousPriceId) {
      throw seatError("This seat has no Stripe pricing on file.", 409);
    }

    const monthlyLimit = getPlanAnalyzerMonthlyLimit({
      accountRole: "member",
      stripeSubscriptionStatus: child.stripeSubscriptionStatus,
      seatPlanAnalyzerLimit: normalizedTier,
    });

    // Move the seat in Firestore first, then let the sync reconcile Stripe:
    // one seat leaves the old tier's item, one joins the new tier's. This can
    // never be a price swap on the existing item — that item may be shared
    // with other seats on the old tier, and Stripe rejects a second item using
    // a price the subscription already has.
    await childRef.update({
      seatPlanAnalyzerLimit: normalizedTier,
      stripeSeatPriceId: priceId,
      "planAnalyzerUsage.monthlyLimit": monthlyLimit,
      "planAnalyzerUsage.updatedAt": now(),
    });

    let billedItems;
    try {
      billedItems = await syncSeatBilling({ ownerUid, subscriptionId });
    } catch (err) {
      // Put the seat back on its old tier so a failed move doesn't leave
      // Firestore claiming a tier the owner isn't being billed for.
      try {
        await childRef.update({
          seatPlanAnalyzerLimit: child.seatPlanAnalyzerLimit ?? null,
          stripeSeatPriceId: previousPriceId,
          "planAnalyzerUsage.monthlyLimit": getPlanAnalyzerMonthlyLimit({
            accountRole: "member",
            stripeSubscriptionStatus: child.stripeSubscriptionStatus,
            seatPlanAnalyzerLimit: child.seatPlanAnalyzerLimit,
          }),
          "planAnalyzerUsage.updatedAt": now(),
        });
        await syncSeatBilling({ ownerUid, subscriptionId });
      } catch (rollbackErr) {
        // Best-effort rollback; surface the original failure.
      }
      throw err;
    }

    // Debug-only pointer; never fail a completed change over it.
    try {
      await childRef.update({
        stripeSubscriptionItemId: billedItems.get(priceId)?.id ?? null,
      });
    } catch (err) {
      // Ignored on purpose.
    }

    return toSeatSummary(childUid, {
      ...child,
      seatPlanAnalyzerLimit: normalizedTier,
    });
  };

  const changeSeatPermission = async ({ ownerUid, childUid, permission }) => {
    await loadOwner(ownerUid);
    const { childRef, child } = await loadMemberSeat(ownerUid, childUid);

    if (!isValidPermission(permission)) {
      throw seatError("Invalid permission level.", 400);
    }

    // Pure Firestore update — no Stripe interaction.
    await childRef.update({ memberPermission: permission });

    return toSeatSummary(childUid, { ...child, memberPermission: permission });
  };

  const reactivateSeat = async ({ ownerUid, childUid, tier, permission }) => {
    const { owner } = await loadOwner(ownerUid);

    const status = owner.stripeSubscriptionStatus;
    if (
      owner.isSubscribed !== true ||
      !ACTIVE_SUBSCRIPTION_STATUSES.includes(status)
    ) {
      throw seatError(
        "An active or trialing subscription is required to reactivate seats.",
        402
      );
    }

    const subscriptionId = owner.stripeSubscriptionId;
    if (!subscriptionId) {
      throw seatError(
        "No Stripe subscription is on file for this account.",
        409
      );
    }

    const { childRef, child } = await loadMemberSeat(ownerUid, childUid);

    if (child.seatStatus !== "removed") {
      throw seatError("This seat is already active.", 409);
    }

    const normalizedTier = normalizeTier(tier);
    if (normalizedTier === null) {
      throw seatError("Tier must be 1, 2, or 3.", 400);
    }

    if (!isValidPermission(permission)) {
      throw seatError("Invalid permission level.", 400);
    }

    const priceId = getChildSeatPriceId(normalizedTier);
    if (!priceId) {
      throw seatError("Seat pricing is not configured.", 500);
    }

    const seatCap = seatCapFor(owner);
    const activeSeats = await countActiveSeats(ownerUid);
    if (activeSeats >= seatCap) {
      // On a trial this is a paywall rather than a hard ceiling, so say what
      // unlocks it and tag the error for the client to act on.
      const onTrialCap = seatCap < MAX_CHILD_SEATS;
      throw seatError(
        onTrialCap
          ? `Your trial includes ${seatCap} team member${seatCap === 1 ? "" : "s"}. Upgrade to the full plan to add more.`
          : `This account already has the maximum of ${MAX_CHILD_SEATS} seats.`,
        409,
        onTrialCap ? { upgradeRequired: true } : {}
      );
    }

    // Claim the seat transactionally BEFORE touching Stripe. Two concurrent
    // reactivations (a double-click, or a client retry after a function
    // timeout) would otherwise both pass the checks above and each create a
    // line item — only the last id gets persisted, so the orphan bills forever
    // with nothing in the UI to find it. The loser of the race gets a 409.
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(childRef);

      if (!snap.exists) {
        throw seatError("Seat was not found.", 404);
      }

      const current = snap.data() || {};

      if (current.accountRole !== "member" || current.accountId !== ownerUid) {
        throw seatError("Seat does not belong to this account.", 403);
      }

      if (current.seatStatus !== "removed") {
        throw seatError("This seat is already active.", 409);
      }

      transaction.update(childRef, { seatStatus: "active" });
    });

    // Undo the claim so a failure part-way through never strands the seat as
    // "active" while unbilled or unusable.
    const releaseClaim = async () => {
      try {
        await childRef.update({ seatStatus: "removed", isSubscribed: false });
      } catch (err) {
        // Best-effort; surface the original failure.
      }
    };

    try {
      await authAdmin.updateUser(childUid, { disabled: false });
    } catch (err) {
      await releaseClaim();
      throw err;
    }

    const monthlyLimit = getPlanAnalyzerMonthlyLimit({
      accountRole: "member",
      stripeSubscriptionStatus: status,
      seatPlanAnalyzerLimit: normalizedTier,
    });

    // Usage counters are deliberately NOT reset here (mirrors changeSeatTier).
    // normalizePlanAnalyzerUsage only rolls `used` over when the stored
    // periodKey changes, so zeroing it would hand a member who had already
    // burned their analyses a fresh quota mid-month — and since Stripe's
    // proration credit on removal roughly cancels the charge on reactivation,
    // that loop would be free and repeatable.
    const updates = {
      isSubscribed: true,
      stripeSubscriptionStatus: status,
      stripeSeatPriceId: priceId,
      memberPermission: permission,
      seatPlanAnalyzerLimit: normalizedTier,
      "planAnalyzerUsage.monthlyLimit": monthlyLimit,
      "planAnalyzerUsage.updatedAt": now(),
    };

    const undoReactivation = async () => {
      try {
        await authAdmin.updateUser(childUid, { disabled: true });
      } catch (disableErr) {
        // Best-effort; surface the original failure.
      }
      await releaseClaim();
      try {
        await syncSeatBilling({ ownerUid, subscriptionId });
      } catch (resyncErr) {
        // Best-effort; surface the original failure.
      }
    };

    try {
      await childRef.update(updates);
    } catch (err) {
      await undoReactivation();
      throw err;
    }

    // Firestore now shows the seat active, so the sync will bill for it.
    let billedItems;
    try {
      billedItems = await syncSeatBilling({ ownerUid, subscriptionId });
    } catch (err) {
      await undoReactivation();
      throw err;
    }

    // Debug-only pointer; never fail a completed reactivation over it.
    try {
      await childRef.update({
        stripeSubscriptionItemId: billedItems.get(priceId)?.id ?? null,
      });
    } catch (err) {
      // Ignored on purpose.
    }

    // Fresh set-password link since the account was disabled. Best-effort, and
    // deliberately last: a mail failure must not roll back a seat the owner is
    // now being billed for. Their existing password still works regardless.
    try {
      if (child.email) {
        const resetLink = await authAdmin.generatePasswordResetLink(child.email);
        await sendSeatInviteEmail(child.email, resetLink, owner.companyName);
      }
    } catch (err) {
      // Owner can re-trigger via forgot-password; don't fail reactivation.
    }

    return toSeatSummary(childUid, {
      ...child,
      seatStatus: "active",
      isSubscribed: true,
      stripeSubscriptionStatus: status,
      memberPermission: permission,
      seatPlanAnalyzerLimit: normalizedTier,
    });
  };

  const removeSeat = async ({ ownerUid, childUid }) => {
    const { owner } = await loadOwner(ownerUid);
    const { childRef, child } = await loadMemberSeat(ownerUid, childUid);

    // Seats on a tier share one line item, so decrementing an already-removed
    // seat would strip billing from a DIFFERENT teammate on that tier.
    if (child.seatStatus === "removed") {
      throw seatError("This seat has already been removed.", 409);
    }

    // Revoke login only. The doc and all data they created stay fully intact —
    // it is company data, not personal data.
    await authAdmin.updateUser(childUid, { disabled: true });

    await childRef.update({
      seatStatus: "removed",
      isSubscribed: false,
    });

    // Firestore no longer counts this seat, so the sync drops it from billing.
    // Skipped entirely when the subscription has already lapsed: Stripe deleted
    // every seat line item along with it, so there is nothing to reconcile and
    // asking would just fail with "customer does not have a subscription".
    try {
      if (hasLiveSubscription(owner)) {
        await syncSeatBilling({
          ownerUid,
          subscriptionId: owner.stripeSubscriptionId,
        });
      }
    } catch (err) {
      // Restore the seat rather than leave it unusable but still billed.
      try {
        await childRef.update({ seatStatus: "active", isSubscribed: true });
        await authAdmin.updateUser(childUid, { disabled: false });
      } catch (rollbackErr) {
        // Best-effort rollback; surface the original failure.
      }
      throw err;
    }

    return toSeatSummary(childUid, {
      ...child,
      seatStatus: "removed",
      isSubscribed: false,
    });
  };

  return {
    listSeats,
    addSeat,
    changeSeatTier,
    changeSeatPermission,
    removeSeat,
    reactivateSeat,
    // Exposed for the Stripe webhook: a resubscribe builds a brand new
    // subscription with no seat items on it, so billing has to be rebuilt
    // outside of any explicit seat operation.
    syncSeatBilling,
  };
};

module.exports = {
  createSeatManager,
  MAX_CHILD_SEATS,
  VALID_TIERS,
  VALID_PERMISSIONS,
};
