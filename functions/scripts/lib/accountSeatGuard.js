/**
 * Whether a users/{uid} doc already belongs to somebody's account.
 *
 * backfillAccountId.js promotes every user to a standalone owner, which was
 * correct when it was written — before seats existed, everyone was one. Once an
 * account has member seats that same write is destructive: it repoints each
 * member's accountId at themselves and marks them an owner, severing them from
 * the owner. Seats vanish from the Team page, countActiveSeats reports zero,
 * propagation finds nobody to suspend on cancellation, and under
 * firestore.rules the member loses access to the account's data. None of it is
 * recoverable.
 *
 * A doc carrying neither field is pre-migration and safe to stamp.
 *
 * Lives in its own module because the script initialises firebase-admin and
 * runs main() the moment it is required — so it cannot be imported by a test.
 */
const isExistingSeat = (docId, data = {}) =>
  data.accountRole === "member" ||
  (typeof data.accountId === "string" &&
    data.accountId !== "" &&
    data.accountId !== docId);

module.exports = { isExistingSeat };
