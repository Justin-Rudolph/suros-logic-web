const test = require("node:test");
const assert = require("node:assert/strict");

const {
  propagateSubscriptionStatusToMembers,
} = require("../routes/lib/subscriptionPropagation");
const { getPlanAnalyzerMonthlyLimit } = require("../routes/lib/planAnalyzerQuota");

/* In-memory users collection supporting the two-field member query + updates. */
const makeDb = (docs) => {
  const store = new Map(Object.entries(docs));

  const makeRef = (uid) => ({
    id: uid,
    update: async (data) => {
      const next = { ...(store.get(uid) || {}) };
      for (const [key, value] of Object.entries(data)) {
        if (key.includes(".")) {
          const parts = key.split(".");
          let cursor = next;
          for (let i = 0; i < parts.length - 1; i += 1) {
            cursor[parts[i]] = { ...(cursor[parts[i]] || {}) };
            cursor = cursor[parts[i]];
          }
          cursor[parts[parts.length - 1]] = value;
        } else {
          next[key] = value;
        }
      }
      store.set(uid, next);
    },
  });

  const collection = {
    where: function whereFn(field, _op, value) {
      const filters = (this._filters || []).concat([[field, value]]);
      return {
        _filters: filters,
        where: whereFn,
        get: async () => {
          const matched = [...store.entries()].filter(([, data]) =>
            filters.every(([f, v]) => data?.[f] === v)
          );
          return {
            empty: matched.length === 0,
            docs: matched.map(([uid, data]) => ({
              id: uid,
              data: () => data,
              ref: makeRef(uid),
            })),
          };
        },
      };
    },
  };

  return { collection: () => collection, _store: store };
};

const makeAuth = () => {
  const updated = [];
  return {
    _updated: updated,
    updateUser: async (uid, args) => {
      updated.push([uid, args]);
    },
  };
};

const deps = (db, authAdmin) => ({
  db,
  authAdmin,
  getPlanAnalyzerMonthlyLimit,
  now: () => "TS",
});

test("owner status change propagates isSubscribed + status to all child seats", async () => {
  const db = makeDb({
    owner1: {
      accountId: "owner1",
      accountRole: "owner",
      isSubscribed: true,
      stripeSubscriptionStatus: "active",
    },
    childA: {
      accountId: "owner1",
      accountRole: "member",
      seatPlanAnalyzerLimit: 2,
      isSubscribed: true,
      stripeSubscriptionStatus: "active",
    },
    childB: {
      accountId: "owner1",
      accountRole: "member",
      seatPlanAnalyzerLimit: 3,
      isSubscribed: true,
      stripeSubscriptionStatus: "active",
    },
    otherAccountMember: {
      accountId: "owner2",
      accountRole: "member",
      seatPlanAnalyzerLimit: 1,
      isSubscribed: true,
      stripeSubscriptionStatus: "active",
    },
  });

  const count = await propagateSubscriptionStatusToMembers(
    deps(db),
    "owner1",
    "canceled"
  );

  assert.equal(count, 2);

  // Both children lose access.
  assert.equal(db._store.get("childA").isSubscribed, false);
  assert.equal(db._store.get("childA").stripeSubscriptionStatus, "canceled");
  assert.equal(db._store.get("childB").isSubscribed, false);
  assert.equal(db._store.get("childB").stripeSubscriptionStatus, "canceled");

  // A member in a different account is untouched.
  assert.equal(db._store.get("otherAccountMember").isSubscribed, true);
  assert.equal(
    db._store.get("otherAccountMember").stripeSubscriptionStatus,
    "active"
  );
});

test("propagating a trialing status caps every child's monthly limit at 1", async () => {
  const db = makeDb({
    child3: {
      accountId: "owner1",
      accountRole: "member",
      seatPlanAnalyzerLimit: 3,
      planAnalyzerUsage: { monthlyLimit: 3, used: 0, reserved: 0 },
    },
  });

  await propagateSubscriptionStatusToMembers(deps(db), "owner1", "trialing");

  const child = db._store.get("child3");
  assert.equal(child.stripeSubscriptionStatus, "trialing");
  assert.equal(child.planAnalyzerUsage.monthlyLimit, 1);
});

test("propagating an active status restores each child's purchased tier", async () => {
  const db = makeDb({
    child3: {
      accountId: "owner1",
      accountRole: "member",
      seatPlanAnalyzerLimit: 3,
      planAnalyzerUsage: { monthlyLimit: 1, used: 0, reserved: 0 },
    },
  });

  await propagateSubscriptionStatusToMembers(deps(db), "owner1", "active");

  const child = db._store.get("child3");
  assert.equal(child.isSubscribed, true);
  assert.equal(child.planAnalyzerUsage.monthlyLimit, 3);
});

test("propagation is a no-op when the owner has no member seats", async () => {
  const db = makeDb({
    owner1: { accountId: "owner1", accountRole: "owner" },
  });

  const count = await propagateSubscriptionStatusToMembers(
    deps(db),
    "owner1",
    "canceled"
  );

  assert.equal(count, 0);
});

test("propagation skips removed seats", async () => {
  // Otherwise every renewal webhook would flip a removed teammate back to
  // isSubscribed: true and hand them a fresh plan-analyzer quota.
  const db = makeDb({
    active1: {
      accountId: "owner1",
      accountRole: "member",
      seatStatus: "active",
      seatPlanAnalyzerLimit: 2,
      isSubscribed: false,
      planAnalyzerUsage: { monthlyLimit: 0, used: 0, reserved: 0 },
    },
    removed1: {
      accountId: "owner1",
      accountRole: "member",
      seatStatus: "removed",
      seatPlanAnalyzerLimit: 3,
      isSubscribed: false,
      planAnalyzerUsage: { monthlyLimit: 0, used: 0, reserved: 0 },
    },
  });

  const count = await propagateSubscriptionStatusToMembers(
    deps(db),
    "owner1",
    "active"
  );

  assert.equal(count, 1);

  const active = db._store.get("active1");
  assert.equal(active.isSubscribed, true);
  assert.equal(active.planAnalyzerUsage.monthlyLimit, 2);

  const removed = db._store.get("removed1");
  assert.equal(removed.isSubscribed, false);
  assert.equal(removed.seatStatus, "removed");
  assert.equal(removed.planAnalyzerUsage.monthlyLimit, 0);
});


/* ---------------------------------------------------------
   LOGIN LOCKSTEP
--------------------------------------------------------- */

test("cancelling the owner disables every active seat's login", async () => {
  // isSubscribed alone only hides UI (firestore.rules never gates on it), so
  // disabling the Auth login is what actually revokes a seat's access.
  const db = makeDb({
    active1: {
      accountId: "owner1",
      accountRole: "member",
      seatStatus: "active",
      seatPlanAnalyzerLimit: 2,
      isSubscribed: true,
    },
    active2: {
      accountId: "owner1",
      accountRole: "member",
      seatStatus: "active",
      seatPlanAnalyzerLimit: 1,
      isSubscribed: true,
    },
  });
  const auth = makeAuth();

  await propagateSubscriptionStatusToMembers(deps(db, auth), "owner1", "canceled");

  assert.equal(db._store.get("active1").isSubscribed, false);
  assert.equal(db._store.get("active2").isSubscribed, false);
  assert.deepEqual(auth._updated.sort(), [
    ["active1", { disabled: true }],
    ["active2", { disabled: true }],
  ]);
  // The seat itself survives, so resubscribing restores it without a re-add.
  assert.equal(db._store.get("active1").seatStatus, "active");
});

test("resubscribing re-enables the seats it disabled", async () => {
  const db = makeDb({
    active1: {
      accountId: "owner1",
      accountRole: "member",
      seatStatus: "active",
      seatPlanAnalyzerLimit: 3,
      isSubscribed: false,
    },
  });
  const auth = makeAuth();

  await propagateSubscriptionStatusToMembers(deps(db, auth), "owner1", "active");

  assert.equal(db._store.get("active1").isSubscribed, true);
  assert.deepEqual(auth._updated, [["active1", { disabled: false }]]);
});

test("a removed seat's login is never re-enabled by propagation", async () => {
  // Otherwise a renewal would hand a removed teammate their access back.
  const db = makeDb({
    removed1: {
      accountId: "owner1",
      accountRole: "member",
      seatStatus: "removed",
      seatPlanAnalyzerLimit: 1,
      isSubscribed: false,
    },
  });
  const auth = makeAuth();

  const count = await propagateSubscriptionStatusToMembers(
    deps(db, auth),
    "owner1",
    "active"
  );

  assert.equal(count, 0);
  assert.deepEqual(auth._updated, []);
  assert.equal(db._store.get("removed1").isSubscribed, false);
});

test("a failed login update does not abort the remaining seats", async () => {
  const db = makeDb({
    active1: {
      accountId: "owner1",
      accountRole: "member",
      seatStatus: "active",
      seatPlanAnalyzerLimit: 1,
      isSubscribed: true,
    },
    active2: {
      accountId: "owner1",
      accountRole: "member",
      seatStatus: "active",
      seatPlanAnalyzerLimit: 1,
      isSubscribed: true,
    },
  });
  const auth = makeAuth();
  auth.updateUser = async (uid) => {
    throw new Error(`auth down for ${uid}`);
  };

  await propagateSubscriptionStatusToMembers(deps(db, auth), "owner1", "canceled");

  // Firestore is the source of truth and still reflects the cancellation.
  assert.equal(db._store.get("active1").isSubscribed, false);
  assert.equal(db._store.get("active2").isSubscribed, false);
});

test("propagation still works when no authAdmin is injected", async () => {
  const db = makeDb({
    active1: {
      accountId: "owner1",
      accountRole: "member",
      seatStatus: "active",
      seatPlanAnalyzerLimit: 1,
      isSubscribed: true,
    },
  });

  await propagateSubscriptionStatusToMembers(deps(db), "owner1", "canceled");

  assert.equal(db._store.get("active1").isSubscribed, false);
});
