/**
 * One-time backfill for the Child Account Seats feature.
 *
 * Every existing user becomes a standalone OWNER of an account of one, and
 * every existing data document is stamped with an `accountId` denormalized
 * from its creator's `userId`.
 *
 *   users/{uid}                -> accountId = uid, accountRole = 'owner'
 *   planProjects/{id}          -> accountId = userId
 *   bidForms/{id}              -> accountId = userId
 *   bidFormProposals/{id}      -> accountId = userId
 *   changeOrder/{id}           -> accountId = userId
 *   changeOrderProposals/{id}  -> accountId = userId
 *   projectFiles/{id}          -> accountId = userId
 *
 * PlanProjectFileRecord (subcollection under planProjects) needs no backfill —
 * it inherits access from its parent planProjects doc.
 *
 * SAFETY: this script is idempotent (skips docs already carrying the target
 * value) and supports a dry run. DO NOT run against a live project without an
 * explicit decision to do so.
 *
 * Usage:
 *   # Dry run (no writes) against the dev project:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/backfillAccountId.js --project suros-logic-dev --dry-run
 *
 *   # Real run:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/backfillAccountId.js --project suros-logic-dev
 */

const admin = require("firebase-admin");
const { isExistingSeat } = require("./lib/accountSeatGuard");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const projectFlagIndex = args.indexOf("--project");
const PROJECT_ID =
  projectFlagIndex !== -1 ? args[projectFlagIndex + 1] : process.env.GCLOUD_PROJECT;

if (!PROJECT_ID) {
  console.error(
    "Missing project id. Pass --project <id> or set GCLOUD_PROJECT."
  );
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

const BATCH_LIMIT = 400; // stay under Firestore's 500-write batch cap.

// Data collections stamped with accountId = userId.
const DATA_COLLECTIONS = [
  "planProjects",
  "bidForms",
  "bidFormProposals",
  "changeOrder",
  "changeOrderProposals",
  "projectFiles",
];

const commitInChunks = async (updates) => {
  let committed = 0;
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const chunk = updates.slice(i, i + BATCH_LIMIT);
    if (!DRY_RUN) {
      const batch = db.batch();
      for (const { ref, data } of chunk) {
        batch.set(ref, data, { merge: true });
      }
      await batch.commit();
    }
    committed += chunk.length;
  }
  return committed;
};

const backfillUsers = async () => {
  const snap = await db.collection("users").get();
  const updates = [];
  const skipped = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};

    if (isExistingSeat(doc.id, data)) {
      skipped.push(doc.id);
      return;
    }

    const patch = {};

    if (data.accountId !== doc.id) patch.accountId = doc.id;
    if (data.accountRole !== "owner") patch.accountRole = "owner";

    if (Object.keys(patch).length > 0) {
      updates.push({ ref: doc.ref, data: patch });
    }
  });

  const committed = await commitInChunks(updates);
  console.log(
    `users: ${snap.size} scanned, ${updates.length} to update, ${committed} ${
      DRY_RUN ? "would be" : ""
    } written.`
  );

  if (skipped.length > 0) {
    console.log(
      `users: ${skipped.length} left untouched — already part of an account ` +
        `(member seats, or a non-self accountId): ${skipped.join(", ")}`
    );
  }
};


const backfillDataCollection = async (collectionName) => {
  const snap = await db.collection(collectionName).get();
  const updates = [];
  let skippedNoUserId = 0;

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const userId = data.userId;

    if (!userId) {
      skippedNoUserId += 1;
      return;
    }

    if (data.accountId !== userId) {
      updates.push({ ref: doc.ref, data: { accountId: userId } });
    }
  });

  const committed = await commitInChunks(updates);
  console.log(
    `${collectionName}: ${snap.size} scanned, ${updates.length} to update, ${committed} ${
      DRY_RUN ? "would be" : ""
    } written${skippedNoUserId ? `, ${skippedNoUserId} skipped (no userId)` : ""}.`
  );
};

const main = async () => {
  console.log(
    `Backfill accountId — project=${PROJECT_ID}${DRY_RUN ? " (DRY RUN)" : ""}`
  );

  await backfillUsers();

  for (const collectionName of DATA_COLLECTIONS) {
    await backfillDataCollection(collectionName);
  }

  console.log("Backfill complete.");
  process.exit(0);
};

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
