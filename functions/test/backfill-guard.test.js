const test = require("node:test");
const assert = require("node:assert/strict");

const { isExistingSeat } = require("../scripts/lib/accountSeatGuard");

/* ---------------------------------------------------------
   BACKFILL GUARD

   backfillAccountId.js rewrites every user it touches into a
   standalone owner. Getting this predicate wrong on a database
   that has seats destroys them irreversibly, so the boundary is
   worth pinning exactly.
--------------------------------------------------------- */

test("a pre-migration user carrying neither field is stamped", async () => {
  assert.equal(isExistingSeat("user_1", { email: "a@example.com" }), false);
});

test("a doc with no data at all is stamped", async () => {
  assert.equal(isExistingSeat("user_1", {}), false);
  assert.equal(isExistingSeat("user_1"), false);
});

test("an already-migrated owner is stamped again harmlessly", async () => {
  // accountId points at itself, so this is an owner the script has already
  // processed. Re-stamping is a no-op, which keeps the script idempotent.
  assert.equal(
    isExistingSeat("owner_1", { accountId: "owner_1", accountRole: "owner" }),
    false
  );
});

test("a member seat is never touched", async () => {
  assert.equal(
    isExistingSeat("child_1", {
      accountId: "owner_1",
      accountRole: "member",
      memberPermission: "full",
    }),
    true
  );
});

test("a doc pointing at another account is never touched", async () => {
  // Belt and braces: caught even if accountRole is missing or wrong.
  assert.equal(isExistingSeat("child_1", { accountId: "owner_1" }), true);
  assert.equal(
    isExistingSeat("child_1", { accountId: "owner_1", accountRole: "owner" }),
    true
  );
});

test("a member seat is skipped even without an accountId", async () => {
  assert.equal(isExistingSeat("child_1", { accountRole: "member" }), true);
});

test("an empty or non-string accountId does not count as a seat", async () => {
  // These are malformed rather than owned, so the script should repair them.
  assert.equal(isExistingSeat("user_1", { accountId: "" }), false);
  assert.equal(isExistingSeat("user_1", { accountId: null }), false);
  assert.equal(isExistingSeat("user_1", { accountId: undefined }), false);
});
