/**
 * Repair member seats whose subscription state drifted from their owner's.
 *
 * Seat state is normally kept in sync by `propagateSubscriptionStatusToMembers`,
 * which runs from the Stripe webhook. That is purely event-driven, so a seat
 * gets stranded whenever the event was missed: the webhook failed, the
 * propagation code was not deployed yet, or the subscription was cancelled
 * (after which Stripe sends nothing further, so nothing ever retries). A
 * stranded seat keeps `isSubscribed: true` and a working login forever.
 *
 * For every owner, this recomputes each active member seat from the owner's
 * CURRENT values:
 *
 *   isSubscribed                     <- owner is active/trialing
 *   stripeSubscriptionStatus         <- owner's status
 *   planAnalyzerUsage.monthlyLimit   <- seat tier, or the trial cap
 *   auth().updateUser({ disabled })  <- login enabled only while subscribed
 *
 * Removed seats are skipped: their login is already revoked and reactivateSeat
 * is what brings them back, so touching them here would resurrect access the
 * owner deliberately took away.
 *
 * SAFETY: idempotent (reports and skips seats already correct) and dry-run by
 * default. Pass --apply to actually write.
 *
 * Usage:
 *   # Dry run (default, no writes):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/resyncMemberSubscriptions.js --project suros-logic-dev
 *
 *   # Real run:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/resyncMemberSubscriptions.js --project suros-logic-dev --apply
 *
 *   # Limit to one account:
 *   ... --project suros-logic-dev --owner <ownerUid> --apply
 */

const admin = require("firebase-admin");

const {
  getPlanAnalyzerMonthlyLimit,
} = require("../routes/lib/planAnalyzerQuota");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const readFlag = (name) => {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
};

const PROJECT_ID = readFlag("--project") || process.env.GCLOUD_PROJECT;
const ONLY_OWNER = readFlag("--owner");

if (!PROJECT_ID) {
  console.error("Missing project id. Pass --project <id> or set GCLOUD_PROJECT.");
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const auth = admin.auth();

const ACTIVE_STATUSES = ["active", "trialing"];

const run = async () => {
  console.log(
    `\n${APPLY ? "APPLYING" : "DRY RUN"} member subscription resync on ${PROJECT_ID}` +
      (ONLY_OWNER ? ` (owner ${ONLY_OWNER})` : "") +
      "\n"
  );

  const memberSnap = await db
    .collection("users")
    .where("accountRole", "==", "member")
    .get();

  if (memberSnap.empty) {
    console.log("No member seats found. Nothing to do.\n");
    return;
  }

  // Cache owner lookups: seats cluster onto a handful of accounts.
  const ownerCache = new Map();
  const loadOwner = async (ownerUid) => {
    if (!ownerCache.has(ownerUid)) {
      const snap = await db.collection("users").doc(ownerUid).get();
      ownerCache.set(ownerUid, snap.exists ? snap.data() || {} : null);
    }
    return ownerCache.get(ownerUid);
  };

  let checked = 0;
  let changed = 0;
  let skippedRemoved = 0;
  let orphaned = 0;
  // Seats whose login state could not be read, so their drift is still unknown.
  let lookupFailures = 0;
  let unresolved = 0;

  for (const doc of memberSnap.docs) {
    const seat = doc.data() || {};
    const ownerUid = seat.accountId;

    if (ONLY_OWNER && ownerUid !== ONLY_OWNER) continue;

    if (seat.seatStatus === "removed") {
      skippedRemoved += 1;
      continue;
    }

    checked += 1;

    const owner = ownerUid ? await loadOwner(ownerUid) : null;
    if (!owner) {
      orphaned += 1;
      console.warn(
        `  ! seat ${doc.id} (${seat.email || "no email"}) references missing owner ${ownerUid}; skipped`
      );
      continue;
    }

    const status = owner.stripeSubscriptionStatus || "inactive";
    const isSubscribed =
      owner.isSubscribed === true && ACTIVE_STATUSES.includes(status);
    const monthlyLimit = getPlanAnalyzerMonthlyLimit({
      ...seat,
      stripeSubscriptionStatus: status,
    });

    const currentLimit = seat.planAnalyzerUsage?.monthlyLimit;
    const needsUpdate =
      seat.isSubscribed !== isSubscribed ||
      seat.stripeSubscriptionStatus !== status ||
      currentLimit !== monthlyLimit;

    // The login is the part that actually gates access, so verify it directly
    // rather than inferring it from the Firestore doc.
    //
    // Only a genuine "no such user" means there is no login to sync. Any other
    // error (transient network, rate limit, permissions) must NOT be folded
    // into that branch: a stranded seat whose Firestore fields already look
    // correct would then be silently reported as clean, which is precisely the
    // drift this script exists to catch.
    let authRecord = null;
    let lookupFailed = false;
    try {
      authRecord = await auth.getUser(doc.id);
    } catch (err) {
      if (err?.code === "auth/user-not-found") {
        console.warn(`  ! seat ${doc.id} has no auth user; nothing to sync`);
      } else {
        lookupFailed = true;
        lookupFailures += 1;
        console.error(
          `  ! seat ${doc.id} login state UNKNOWN (${err?.code || err?.message || err}); ` +
            "re-run to verify"
        );
      }
    }
    const needsLoginChange =
      authRecord !== null && authRecord.disabled === isSubscribed;

    if (!needsUpdate && !needsLoginChange) {
      if (lookupFailed) unresolved += 1;
      continue;
    }

    changed += 1;
    console.log(
      `  ${APPLY ? "fix" : "would fix"} ${doc.id} (${seat.email || "no email"})`
    );
    if (needsUpdate) {
      console.log(
        `      isSubscribed ${seat.isSubscribed} -> ${isSubscribed}, ` +
          `status ${seat.stripeSubscriptionStatus} -> ${status}, ` +
          `limit ${currentLimit} -> ${monthlyLimit}`
      );
    }
    if (needsLoginChange) {
      console.log(
        `      login disabled ${authRecord.disabled} -> ${!isSubscribed}`
      );
    }

    if (!APPLY) continue;

    if (needsUpdate) {
      await doc.ref.update({
        isSubscribed,
        stripeSubscriptionStatus: status,
        "planAnalyzerUsage.monthlyLimit": monthlyLimit,
        "planAnalyzerUsage.updatedAt": admin.firestore.Timestamp.now(),
      });
    }

    if (needsLoginChange) {
      try {
        await auth.updateUser(doc.id, { disabled: !isSubscribed });
      } catch (err) {
        console.error(`      failed to update login for ${doc.id}:`, err.message);
      }
    }
  }

  console.log(
    `\n${APPLY ? "Done" : "Dry run complete"}: ${checked} active seat(s) checked, ` +
      `${changed} ${APPLY ? "fixed" : "would be fixed"}, ` +
      `${skippedRemoved} removed seat(s) skipped` +
      (orphaned ? `, ${orphaned} orphaned` : "") +
      "."
  );
  if (lookupFailures > 0) {
    // Never let a run with unreadable logins read as a clean bill of health.
    console.error(
      `WARNING: could not read the login state of ${lookupFailures} seat(s); ` +
        `${unresolved} of those were otherwise up to date and may still be ` +
        "stranded. Re-run to confirm."
    );
  }
  if (!APPLY && changed > 0) {
    console.log("Re-run with --apply to write these changes.\n");
  } else {
    console.log("");
  }
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Resync failed:", err);
    process.exit(1);
  });
