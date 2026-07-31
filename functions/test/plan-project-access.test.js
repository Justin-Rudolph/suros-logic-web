const test = require("node:test");
const assert = require("node:assert/strict");

const { canManageAccountDoc } = require("../routes/lib/planAnalyzerQuota");

/**
 * Plan-analyzer writes go through Cloud Functions, bypassing firestore.rules,
 * so canManageAccountDoc must match canWriteAccountDoc exactly:
 *   userId == self  ||  (same accountId && (owner || permission == 'full'))
 */
const makeFirestore = (users) => ({
  doc: (path) => {
    const uid = path.split("/")[1];
    return {
      get: async () => ({
        exists: Object.prototype.hasOwnProperty.call(users, uid),
        data: () => users[uid],
      }),
    };
  },
});

const project = { userId: "creator", accountId: "owner1" };

test("the creator can manage their own analysis", async () => {
  const fs = makeFirestore({ creator: { accountId: "owner1", accountRole: "member" } });
  assert.equal(await canManageAccountDoc(fs, "creator", project), true);
});

test("the account owner can manage a teammate's analysis", async () => {
  const fs = makeFirestore({ owner1: { accountId: "owner1", accountRole: "owner" } });
  assert.equal(await canManageAccountDoc(fs, "owner1", project), true);
});

test("a full-access member can manage a teammate's analysis", async () => {
  // The reported bug: this returned false, so delete failed with a 403.
  const fs = makeFirestore({
    mate: { accountId: "owner1", accountRole: "member", memberPermission: "full" },
  });
  assert.equal(await canManageAccountDoc(fs, "mate", project), true);
});

test("a view_all_edit_own member cannot manage a teammate's analysis", async () => {
  const fs = makeFirestore({
    mate: { accountId: "owner1", accountRole: "member", memberPermission: "view_all_edit_own" },
  });
  assert.equal(await canManageAccountDoc(fs, "mate", project), false);
});

test("an own-only member cannot manage a teammate's analysis", async () => {
  const fs = makeFirestore({
    mate: { accountId: "owner1", accountRole: "member", memberPermission: "own" },
  });
  assert.equal(await canManageAccountDoc(fs, "mate", project), false);
});

test("a full-access member of a DIFFERENT account is refused", async () => {
  const fs = makeFirestore({
    outsider: { accountId: "otherOwner", accountRole: "member", memberPermission: "full" },
  });
  assert.equal(await canManageAccountDoc(fs, "outsider", project), false);
});

test("a project with no accountId is only manageable by its creator", async () => {
  const fs = makeFirestore({ owner1: { accountId: "owner1", accountRole: "owner" } });
  assert.equal(
    await canManageAccountDoc(fs, "owner1", { userId: "creator" }),
    false
  );
});

test("an unmigrated standalone user still manages their own work", async () => {
  // No accountId on their doc: myAccountId() falls back to their own uid.
  const fs = makeFirestore({ solo: {} });
  assert.equal(
    await canManageAccountDoc(fs, "solo", { userId: "solo", accountId: "solo" }),
    true
  );
});

test("a missing caller doc is refused rather than defaulting open", async () => {
  const fs = makeFirestore({});
  assert.equal(await canManageAccountDoc(fs, "ghost", project), false);
});
