/**
 * Propagate an owner's subscription-status change to every member seat riding
 * that owner's single Stripe subscription.
 *
 * Children mirror the owner's `isSubscribed` / `stripeSubscriptionStatus`; each
 * child's plan-analyzer monthly limit is recomputed from its own seat tier (or
 * the trial cap while the account is trialing) via getPlanAnalyzerMonthlyLimit.
 *
 * Their Firebase Auth login is also kept in lockstep: disabled while the owner
 * is unsubscribed, re-enabled when the owner is active/trialing again. Flipping
 * `isSubscribed` alone only hides UI — firestore.rules never gates on it — so
 * disabling the login is what actually revokes access. This is deliberately
 * reversible rather than removing the seat: `invoice.payment_failed` fires on
 * the first declined attempt and Stripe then retries under dunning for weeks,
 * so a temporary card problem must not delete seats, drop their Stripe line
 * items, or force prorated re-adds and fresh invite emails.
 *
 * Dependency-injected so it can be unit tested without live Firestore/Auth.
 *
 * @param {Object} deps
 * @param {FirebaseFirestore.Firestore} deps.db
 * @param {Object} [deps.authAdmin]  admin.auth() instance; login lockstep is
 *                                   skipped when omitted.
 * @param {Function} deps.getPlanAnalyzerMonthlyLimit
 * @param {()=>*} deps.now
 * @param {string} ownerUid
 * @param {string} status
 */
const propagateSubscriptionStatusToMembers = async (
  { db, authAdmin, getPlanAnalyzerMonthlyLimit, now },
  ownerUid,
  status
) => {
  const isSubscribed = ["active", "trialing"].includes(status);

  const memberSnap = await db
    .collection("users")
    .where("accountId", "==", ownerUid)
    .where("accountRole", "==", "member")
    .get();

  if (memberSnap.empty) return 0;

  const targets = memberSnap.docs.filter(
    // Removed seats are not part of the account any more: their login is
    // already disabled and they are not billed. Mirroring the owner's status
    // onto them would flip them back to isSubscribed: true and restore their
    // quota on every webhook, and re-enable a login the owner revoked.
    // reactivateSeat sets these fields itself when a seat comes back.
    (doc) => (doc.data() || {}).seatStatus !== "removed"
  );

  await Promise.all(
    targets.map(async (doc) => {
      const memberData = doc.data() || {};
      const monthlyLimit = getPlanAnalyzerMonthlyLimit({
        ...memberData,
        stripeSubscriptionStatus: status,
      });

      await doc.ref.update({
        isSubscribed,
        stripeSubscriptionStatus: status,
        "planAnalyzerUsage.monthlyLimit": monthlyLimit,
        "planAnalyzerUsage.updatedAt": now(),
      });

      if (!authAdmin) return;

      try {
        await authAdmin.updateUser(doc.id, { disabled: !isSubscribed });
      } catch (err) {
        // Best-effort: the Firestore record is the source of truth, and a
        // failure here must not abort the remaining seats. Surfaced so a seat
        // stuck able to sign in is at least visible in the logs.
        console.error(
          `Failed to ${isSubscribed ? "enable" : "disable"} login for seat ${doc.id}:`,
          err
        );
      }
    })
  );

  return targets.length;
};

module.exports = { propagateSubscriptionStatusToMembers };
