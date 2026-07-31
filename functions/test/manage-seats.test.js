const test = require("node:test");
const assert = require("node:assert/strict");

const { createSeatManager } = require("../routes/lib/seatManager");
const { getPlanAnalyzerMonthlyLimit } = require("../routes/lib/planAnalyzerQuota");

/* ---------------------------------------------------------
   TEST HARNESS — in-memory Firestore + Stripe + Auth mocks
--------------------------------------------------------- */

const makeDb = (docs) => {
  // docs: { uid: data }
  const store = new Map(Object.entries(docs));
  const writes = [];

  const makeRef = (uid) => ({
    id: uid,
    get: async () => ({
      exists: store.has(uid),
      data: () => store.get(uid),
    }),
    set: async (data, options) => {
      const prev = options?.merge ? store.get(uid) || {} : {};
      store.set(uid, { ...prev, ...data });
      writes.push({ type: "set", uid, data });
    },
    update: async (data) => {
      // Emulate Firestore dot-path field updates (e.g. "a.b": v -> nested).
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
      writes.push({ type: "update", uid, data });
    },
    delete: async () => {
      store.delete(uid);
      writes.push({ type: "delete", uid });
    },
  });

  const usersCollection = {
    doc: (uid) => makeRef(uid),
    // Chainable where() supporting our two-field member query.
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

  return {
    collection: (name) => {
      assert.equal(name, "users");
      return usersCollection;
    },
    // Single-threaded mock: run the body against the live store. Enough to
    // exercise the read-check-write claim logic, not real contention.
    runTransaction: async (fn) =>
      fn({
        get: async (ref) => ref.get(),
        update: async (ref, data) => ref.update(data),
      }),
    _store: store,
    _writes: writes,
  };
};

/**
 * Models the real Stripe constraint that broke seat-tier changes: a
 * subscription may hold only ONE subscription item per price. `create` throws
 * if the price is already on the subscription, exactly as the live API does.
 */
const makeStripe = (initialItems = []) => {
  const calls = [];
  const items = initialItems.map((item) => ({ ...item }));
  let counter = 0;

  return {
    _calls: calls,
    _items: items,
    // Quantity billed for a price, or 0 when no item exists for it.
    _quantityFor: (priceId) =>
      items
        .filter((item) => item.price.id === priceId)
        .reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    subscriptionItems: {
      list: async ({ subscription }) => {
        calls.push(["list", subscription]);
        return { data: items.filter((item) => item.subscription === subscription) };
      },
      create: async ({ subscription, price, quantity }) => {
        calls.push(["create", { subscription, price, quantity }]);
        if (items.some((item) => item.subscription === subscription && item.price.id === price)) {
          throw new Error(
            `A new item with Price ${price} can't be added to this Subscription because an existing Subscription Item is already using that Price.`
          );
        }
        counter += 1;
        const item = {
          id: `si_new_${counter}`,
          subscription,
          price: { id: price },
          quantity: quantity ?? 1,
        };
        items.push(item);
        return item;
      },
      update: async (id, args) => {
        calls.push(["update", id, args]);
        const item = items.find((entry) => entry.id === id);
        // Repricing onto a price the subscription already carries is rejected
        // too — this is the exact call that broke tier changes.
        if (
          item &&
          args.price !== undefined &&
          items.some(
            (entry) =>
              entry.id !== id &&
              entry.subscription === item.subscription &&
              entry.price.id === args.price
          )
        ) {
          throw new Error(
            `A new item with Price ${args.price} can't be added to this Subscription because an existing Subscription Item is already using that Price.`
          );
        }
        if (item) {
          if (args.price !== undefined) item.price = { id: args.price };
          if (args.quantity !== undefined) item.quantity = args.quantity;
        }
        return item || { id };
      },
      del: async (id) => {
        calls.push(["del", id]);
        const index = items.findIndex((entry) => entry.id === id);
        if (index >= 0) items.splice(index, 1);
        return { id, deleted: true };
      },
    },
  };
};

const seatItem = (id, priceId, quantity = 1) => ({
  id,
  subscription: "sub_owner1",
  price: { id: priceId },
  quantity,
});

const makeAuth = (existingEmails = []) => {
  const created = [];
  const updated = [];
  const deleted = [];
  const emails = new Set(existingEmails);
  return {
    _created: created,
    _updated: updated,
    _deleted: deleted,
    deleteUser: async (uid) => {
      deleted.push(uid);
    },
    getUserByEmail: async (email) => {
      if (emails.has(email)) {
        return { uid: `existing_${email}`, email };
      }
      const err = new Error("no user");
      err.code = "auth/user-not-found";
      throw err;
    },
    createUser: async ({ email }) => {
      const uid = `child_${created.length + 1}`;
      created.push({ uid, email });
      return { uid, email };
    },
    generatePasswordResetLink: async () => "https://reset.example/link",
    updateUser: async (uid, args) => {
      updated.push([uid, args]);
    },
  };
};

const priceByTier = { 1: "price_55", 2: "price_65", 3: "price_75" };
const getChildSeatPriceId = (tier) => priceByTier[tier];

const NOW = "TS_NOW";

const buildManager = ({ db, stripe, auth, sentInvites }) =>
  createSeatManager({
    db,
    stripe,
    authAdmin: auth,
    getChildSeatPriceId,
    getPlanAnalyzerMonthlyLimit,
    sendSeatInviteEmail: async (to, link, company) => {
      sentInvites.push({ to, link, company });
    },
    now: () => NOW,
  });

const activeOwner = {
  uid: "owner1",
  accountId: "owner1",
  accountRole: "owner",
  isSubscribed: true,
  stripeSubscriptionStatus: "active",
  stripeSubscriptionId: "sub_owner1",
  stripeCustomerId: "cus_owner1",
  companyName: "Acme Co",
};

/* ---------------------------------------------------------
   ADD SEAT
--------------------------------------------------------- */

test("addSeat creates a Stripe line item, Firebase user, member doc, and invite", async () => {
  const db = makeDb({ owner1: { ...activeOwner } });
  const stripe = makeStripe();
  const auth = makeAuth();
  const sentInvites = [];
  const manager = buildManager({ db, stripe, auth, sentInvites });

  const seat = await manager.addSeat({
    ownerUid: "owner1",
    email: "Teammate@Example.com",
    tier: 2,
    permission: "view_all_edit_own",
  });

  // Stripe subscription item created on the owner's subscription, quantity 1.
  assert.deepEqual(stripe._calls[1], [
    "create",
    { subscription: "sub_owner1", price: "price_65", quantity: 1 },
  ]);
  assert.equal(stripe._quantityFor("price_65"), 1);

  // Firebase Auth user created with normalized email.
  assert.equal(auth._created[0].email, "teammate@example.com");

  // Member doc written with the right fields.
  const childDoc = db._store.get("child_1");
  assert.equal(childDoc.accountId, "owner1");
  assert.equal(childDoc.accountRole, "member");
  assert.equal(childDoc.memberPermission, "view_all_edit_own");
  assert.equal(childDoc.seatPlanAnalyzerLimit, 2);
  assert.equal(childDoc.stripeSubscriptionItemId, "si_new_1");
  assert.equal(childDoc.stripeSeatPriceId, "price_65");
  assert.equal(childDoc.stripeSubscriptionStatus, "active");
  assert.equal(childDoc.isSubscribed, true);
  assert.equal(childDoc.seatStatus, "active");
  assert.equal(childDoc.planAnalyzerUsage.monthlyLimit, 2);
  // Branding is NOT copied.
  assert.equal(childDoc.companyName, undefined);

  // Invite email sent with company name.
  assert.equal(sentInvites[0].to, "teammate@example.com");
  assert.equal(sentInvites[0].company, "Acme Co");

  assert.equal(seat.uid, "child_1");
  assert.equal(seat.seatStatus, "active");
});

test("addSeat while trialing mirrors trialing status and caps quota at 1", async () => {
  const db = makeDb({
    owner1: {
      ...activeOwner,
      stripeSubscriptionStatus: "trialing",
    },
  });
  const stripe = makeStripe();
  const auth = makeAuth();
  const sentInvites = [];
  const manager = buildManager({ db, stripe, auth, sentInvites });

  await manager.addSeat({
    ownerUid: "owner1",
    email: "t@example.com",
    tier: 3,
    permission: "full",
  });

  const childDoc = db._store.get("child_1");
  assert.equal(childDoc.stripeSubscriptionStatus, "trialing");
  // 3/month tier, but trial cap wins.
  assert.equal(childDoc.planAnalyzerUsage.monthlyLimit, 1);
  assert.equal(childDoc.seatPlanAnalyzerLimit, 3);
});

test("addSeat rejects a non-owner caller", async () => {
  const db = makeDb({
    member1: { accountId: "owner1", accountRole: "member" },
  });
  const stripe = makeStripe();
  const auth = makeAuth();
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  await assert.rejects(
    () =>
      manager.addSeat({
        ownerUid: "member1",
        email: "x@example.com",
        tier: 1,
        permission: "own",
      }),
    (err) => err.statusCode === 403
  );

  // No Stripe or Auth side effects.
  assert.equal(stripe._calls.length, 0);
  assert.equal(auth._created.length, 0);
});

test("addSeat rejects when the account already has 3 active seats", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    m1: { accountId: "owner1", accountRole: "member", seatStatus: "active" },
    m2: { accountId: "owner1", accountRole: "member", seatStatus: "active" },
    m3: { accountId: "owner1", accountRole: "member", seatStatus: "active" },
  });
  const stripe = makeStripe();
  const auth = makeAuth();
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  await assert.rejects(
    () =>
      manager.addSeat({
        ownerUid: "owner1",
        email: "fourth@example.com",
        tier: 1,
        permission: "own",
      }),
    (err) => err.statusCode === 409
  );

  assert.equal(stripe._calls.length, 0);
});

test("addSeat counts removed seats as freeing a slot", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    m1: { accountId: "owner1", accountRole: "member", seatStatus: "active" },
    m2: { accountId: "owner1", accountRole: "member", seatStatus: "active" },
    m3: { accountId: "owner1", accountRole: "member", seatStatus: "removed" },
  });
  const stripe = makeStripe();
  const auth = makeAuth();
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  // Only 2 active seats -> adding is allowed.
  const seat = await manager.addSeat({
    ownerUid: "owner1",
    email: "third-active@example.com",
    tier: 1,
    permission: "own",
  });
  assert.equal(seat.uid, "child_1");
});

test("addSeat rejects an email that already belongs to an account", async () => {
  const db = makeDb({ owner1: { ...activeOwner } });
  const stripe = makeStripe();
  const auth = makeAuth(["taken@example.com"]);
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  await assert.rejects(
    () =>
      manager.addSeat({
        ownerUid: "owner1",
        email: "taken@example.com",
        tier: 1,
        permission: "own",
      }),
    (err) => err.statusCode === 409
  );

  assert.equal(stripe._calls.length, 0);
  assert.equal(auth._created.length, 0);
});

test("addSeat rejects when the owner has no active or trialing subscription", async () => {
  const db = makeDb({
    owner1: {
      ...activeOwner,
      isSubscribed: false,
      stripeSubscriptionStatus: "canceled",
    },
  });
  const stripe = makeStripe();
  const auth = makeAuth();
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  await assert.rejects(
    () =>
      manager.addSeat({
        ownerUid: "owner1",
        email: "x@example.com",
        tier: 1,
        permission: "own",
      }),
    (err) => err.statusCode === 402
  );
});

test("addSeat rejects an invalid tier", async () => {
  const db = makeDb({ owner1: { ...activeOwner } });
  const manager = buildManager({
    db,
    stripe: makeStripe(),
    auth: makeAuth(),
    sentInvites: [],
  });

  await assert.rejects(
    () =>
      manager.addSeat({
        ownerUid: "owner1",
        email: "x@example.com",
        tier: 5,
        permission: "own",
      }),
    (err) => err.statusCode === 400
  );
});

/* ---------------------------------------------------------
   CHANGE TIER
--------------------------------------------------------- */

test("changeSeatTier moves the seat between tier line items", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      stripeSubscriptionStatus: "active",
      stripeSubscriptionItemId: "si_1",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
    },
  });
  const stripe = makeStripe([seatItem("si_1", "price_55", 1)]);
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await manager.changeSeatTier({
    ownerUid: "owner1",
    childUid: "child_1",
    tier: 3,
  });

  // Last seat left price_55, so that item is gone; a new price_75 item exists.
  assert.equal(stripe._quantityFor("price_55"), 0);
  assert.equal(stripe._quantityFor("price_75"), 1);

  const childDoc = db._store.get("child_1");
  assert.equal(childDoc.seatPlanAnalyzerLimit, 3);
  assert.equal(childDoc.stripeSeatPriceId, "price_75");
  assert.equal(childDoc.planAnalyzerUsage.monthlyLimit, 3);
});

test("changeSeatTier can move a seat onto a tier another seat already uses", async () => {
  // Regression: Stripe allows only one item per price, so this previously
  // failed with "an existing Subscription Item is already using that Price".
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      stripeSubscriptionStatus: "active",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
    },
    child_2: {
      accountId: "owner1",
      accountRole: "member",
      stripeSubscriptionStatus: "active",
      stripeSeatPriceId: "price_75",
      seatPlanAnalyzerLimit: 3,
      seatStatus: "active",
    },
  });
  const stripe = makeStripe([
    seatItem("si_1", "price_55", 1),
    seatItem("si_2", "price_75", 1),
  ]);
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await manager.changeSeatTier({
    ownerUid: "owner1",
    childUid: "child_1",
    tier: 3,
  });

  // Both seats now share the price_75 item at quantity 2.
  assert.equal(stripe._quantityFor("price_55"), 0);
  assert.equal(stripe._quantityFor("price_75"), 2);
  assert.equal(db._store.get("child_1").stripeSeatPriceId, "price_75");
});

test("addSeat can add a seat on a tier another seat already uses", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    // Not "child_N" — the auth mock hands those out to newly created seats.
    seat_a: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
    },
  });
  const stripe = makeStripe([seatItem("si_1", "price_55", 1)]);
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await manager.addSeat({
    ownerUid: "owner1",
    email: "second@example.com",
    tier: 1,
    permission: "own",
  });

  assert.equal(stripe._quantityFor("price_55"), 2);
  // Shared item, not a second one.
  assert.equal(stripe._items.filter((i) => i.price.id === "price_55").length, 1);
});

test("removeSeat decrements a shared tier item instead of deleting it", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
    },
    child_2: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
    },
  });
  const stripe = makeStripe([seatItem("si_1", "price_55", 2)]);
  const auth = makeAuth();
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  await manager.removeSeat({ ownerUid: "owner1", childUid: "child_1" });

  // child_2 keeps its seat — the item survives at quantity 1.
  assert.equal(stripe._quantityFor("price_55"), 1);
  assert.equal(db._store.get("child_2").seatStatus, "active");
});

test("seat billing self-heals when Stripe has drifted from Firestore", async () => {
  // Two active seats on price_55, but Stripe wrongly says 5 — e.g. a crashed
  // run or a manual console edit. The next seat change must correct it rather
  // than adjust relative to the wrong number.
  const db = makeDb({
    owner1: { ...activeOwner },
    seat_a: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
    },
    seat_b: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
    },
  });
  const stripe = makeStripe([seatItem("si_1", "price_55", 5)]);
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await manager.removeSeat({ ownerUid: "owner1", childUid: "seat_a" });

  // One active seat remains, so quantity is 1 — not 5 - 1 = 4.
  assert.equal(stripe._quantityFor("price_55"), 1);
});

test("seat billing never touches the owner's own plan item", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    seat_a: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
    },
  });
  const stripe = makeStripe([
    seatItem("si_owner_plan", "price_owner_monthly", 1),
    seatItem("si_1", "price_55", 1),
  ]);
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  // Removing the only seat deletes the seat item entirely — the owner's plan
  // must survive untouched.
  await manager.removeSeat({ ownerUid: "owner1", childUid: "seat_a" });

  assert.equal(stripe._quantityFor("price_55"), 0);
  assert.equal(stripe._quantityFor("price_owner_monthly"), 1);
  assert.ok(stripe._items.some((item) => item.id === "si_owner_plan"));
});

test("removeSeat refuses to remove an already-removed seat", async () => {
  // Otherwise the decrement would strip billing from a different teammate
  // sharing that tier's line item.
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "removed",
    },
  });
  const stripe = makeStripe([seatItem("si_1", "price_55", 1)]);
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await assert.rejects(
    () => manager.removeSeat({ ownerUid: "owner1", childUid: "child_1" }),
    (err) => err.statusCode === 409
  );

  assert.equal(stripe._quantityFor("price_55"), 1);
});

test("changeSeatTier rejects a seat from another account", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    child_x: { accountId: "otherOwner", accountRole: "member" },
  });
  const stripe = makeStripe();
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await assert.rejects(
    () =>
      manager.changeSeatTier({
        ownerUid: "owner1",
        childUid: "child_x",
        tier: 2,
      }),
    (err) => err.statusCode === 403
  );
  assert.equal(stripe._calls.length, 0);
});

/* ---------------------------------------------------------
   CHANGE PERMISSION
--------------------------------------------------------- */

test("changeSeatPermission updates only Firestore, no Stripe calls", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      memberPermission: "own",
      seatStatus: "active",
    },
  });
  const stripe = makeStripe();
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await manager.changeSeatPermission({
    ownerUid: "owner1",
    childUid: "child_1",
    permission: "full",
  });

  assert.equal(stripe._calls.length, 0);
  assert.equal(db._store.get("child_1").memberPermission, "full");
});

/* ---------------------------------------------------------
   REMOVE SEAT
--------------------------------------------------------- */

test("removeSeat deletes the line item, disables login, keeps the doc and data", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      stripeSubscriptionItemId: "si_1",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
      isSubscribed: true,
      displayName: "Keep Me",
    },
  });
  const stripe = makeStripe([seatItem("si_1", "price_55", 1)]);
  const auth = makeAuth();
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  await manager.removeSeat({ ownerUid: "owner1", childUid: "child_1" });

  // Last seat on that tier, so the item is removed entirely.
  assert.equal(stripe._quantityFor("price_55"), 0);
  assert.deepEqual(auth._updated[0], ["child_1", { disabled: true }]);

  const childDoc = db._store.get("child_1");
  assert.equal(childDoc.seatStatus, "removed");
  assert.equal(childDoc.isSubscribed, false);
  // Doc and its data are left intact.
  assert.equal(childDoc.displayName, "Keep Me");
});

/* ---------------------------------------------------------
   REACTIVATE SEAT
--------------------------------------------------------- */

test("reactivateSeat re-enables login, creates a new line item, and preserves usage", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      email: "teammate@example.com",
      seatStatus: "removed",
      isSubscribed: false,
      displayName: "Keep Me",
      memberPermission: "own",
      seatPlanAnalyzerLimit: 1,
      planAnalyzerUsage: { monthlyLimit: 1, used: 1, reserved: 0 },
    },
  });
  const stripe = makeStripe();
  const auth = makeAuth();
  const sentInvites = [];
  const manager = buildManager({ db, stripe, auth, sentInvites });

  const seat = await manager.reactivateSeat({
    ownerUid: "owner1",
    childUid: "child_1",
    tier: 2,
    permission: "full",
  });

  assert.equal(stripe._quantityFor("price_65"), 1);
  assert.deepEqual(auth._updated[0], ["child_1", { disabled: false }]);

  const childDoc = db._store.get("child_1");
  assert.equal(childDoc.seatStatus, "active");
  assert.equal(childDoc.isSubscribed, true);
  assert.equal(childDoc.stripeSeatPriceId, "price_65");
  assert.equal(childDoc.memberPermission, "full");
  assert.equal(childDoc.seatPlanAnalyzerLimit, 2);
  assert.equal(childDoc.planAnalyzerUsage.monthlyLimit, 2);
  // Usage is NOT reset — otherwise remove+reactivate would be a free mid-month
  // quota reset, since normalizePlanAnalyzerUsage only rolls over on periodKey.
  assert.equal(childDoc.planAnalyzerUsage.used, 1);
  assert.equal(childDoc.planAnalyzerUsage.reserved, 0);
  // Doc and its data are left intact.
  assert.equal(childDoc.displayName, "Keep Me");

  assert.equal(sentInvites[0].to, "teammate@example.com");
  assert.equal(seat.seatStatus, "active");
});

/**
 * Wrap a mock db so `update` calls matching `predicate` throw, letting a test
 * fail one specific write while leaving rollback writes working.
 */
const failUpdatesMatching = (db, predicate) => {
  const originalCollection = db.collection.bind(db);
  db.collection = (name) => {
    const col = originalCollection(name);
    return {
      ...col,
      doc: (uid) => {
        const ref = col.doc(uid);
        return {
          ...ref,
          update: async (data) => {
            if (predicate(uid, data)) {
              throw new Error("firestore unavailable");
            }
            return ref.update(data);
          },
        };
      },
    };
  };
  return db;
};

const removedSeatFixture = () => ({
  owner1: { ...activeOwner },
  child_1: {
    accountId: "owner1",
    accountRole: "member",
    email: "teammate@example.com",
    seatStatus: "removed",
    isSubscribed: false,
    memberPermission: "own",
    seatPlanAnalyzerLimit: 1,
  },
});

test("reactivateSeat reverts the seat to removed when Stripe fails", async () => {
  const db = makeDb(removedSeatFixture());
  const stripe = makeStripe();
  stripe.subscriptionItems.create = async () => {
    throw new Error("stripe down");
  };
  const auth = makeAuth();
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  await assert.rejects(
    () =>
      manager.reactivateSeat({
        ownerUid: "owner1",
        childUid: "child_1",
        tier: 1,
        permission: "own",
      }),
    /stripe down/
  );

  const childDoc = db._store.get("child_1");
  assert.equal(childDoc.seatStatus, "removed");
  assert.equal(childDoc.isSubscribed, false);
  // Login was re-enabled, then disabled again by the rollback.
  assert.deepEqual(auth._updated.at(-1), ["child_1", { disabled: true }]);
});

test("reactivateSeat discards the line item and reverts when enabling login fails", async () => {
  const db = makeDb(removedSeatFixture());
  const stripe = makeStripe();
  const auth = makeAuth();
  auth.updateUser = async () => {
    throw new Error("auth down");
  };
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  await assert.rejects(
    () =>
      manager.reactivateSeat({
        ownerUid: "owner1",
        childUid: "child_1",
        tier: 1,
        permission: "own",
      }),
    /auth down/
  );

  // Added, then rolled back — no lingering billable quantity.
  assert.equal(stripe._quantityFor("price_55"), 0);

  const childDoc = db._store.get("child_1");
  assert.equal(childDoc.seatStatus, "removed");
  assert.equal(childDoc.isSubscribed, false);
});

test("reactivateSeat rolls back billing and login when the Firestore write fails", async () => {
  const db = failUpdatesMatching(
    makeDb(removedSeatFixture()),
    (uid, data) => data.stripeSeatPriceId !== undefined
  );
  const stripe = makeStripe();
  const auth = makeAuth();
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  await assert.rejects(
    () =>
      manager.reactivateSeat({
        ownerUid: "owner1",
        childUid: "child_1",
        tier: 1,
        permission: "own",
      }),
    /firestore unavailable/
  );

  // Billing rolled back rather than left charging for a "Removed" seat.
  assert.equal(stripe._quantityFor("price_55"), 0);
  // Login re-disabled so a failed reactivation can't leave them able to sign in.
  assert.deepEqual(auth._updated[0], ["child_1", { disabled: false }]);
  assert.deepEqual(auth._updated[1], ["child_1", { disabled: true }]);

  const childDoc = db._store.get("child_1");
  assert.equal(childDoc.seatStatus, "removed");
  assert.equal(childDoc.isSubscribed, false);
});

test("reactivateSeat still succeeds when the invite email fails", async () => {
  const db = makeDb(removedSeatFixture());
  const stripe = makeStripe();
  const auth = makeAuth();
  const manager = createSeatManager({
    db,
    stripe,
    authAdmin: auth,
    getChildSeatPriceId,
    getPlanAnalyzerMonthlyLimit,
    sendSeatInviteEmail: async () => {
      throw new Error("sendgrid down");
    },
    now: () => NOW,
  });

  const seat = await manager.reactivateSeat({
    ownerUid: "owner1",
    childUid: "child_1",
    tier: 1,
    permission: "own",
  });

  // A mail failure must not roll back a seat the owner is now billed for.
  assert.equal(seat.seatStatus, "active");
  const childDoc = db._store.get("child_1");
  assert.equal(childDoc.seatStatus, "active");
  assert.equal(childDoc.isSubscribed, true);
  assert.equal(stripe._quantityFor("price_55"), 1);
});

test("reactivateSeat rejects a seat that is already active", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      email: "teammate@example.com",
      seatStatus: "active",
    },
  });
  const stripe = makeStripe();
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await assert.rejects(
    () =>
      manager.reactivateSeat({
        ownerUid: "owner1",
        childUid: "child_1",
        tier: 1,
        permission: "own",
      }),
    (err) => err.statusCode === 409
  );
  assert.equal(stripe._calls.length, 0);
});

test("reactivateSeat rejects when the account is already at the seat cap", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    m1: { accountId: "owner1", accountRole: "member", seatStatus: "active" },
    m2: { accountId: "owner1", accountRole: "member", seatStatus: "active" },
    m3: { accountId: "owner1", accountRole: "member", seatStatus: "active" },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      email: "teammate@example.com",
      seatStatus: "removed",
    },
  });
  const stripe = makeStripe();
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await assert.rejects(
    () =>
      manager.reactivateSeat({
        ownerUid: "owner1",
        childUid: "child_1",
        tier: 1,
        permission: "own",
      }),
    (err) => err.statusCode === 409
  );
  assert.equal(stripe._calls.length, 0);
});

test("reactivateSeat rejects when the owner has no active or trialing subscription", async () => {
  const db = makeDb({
    owner1: {
      ...activeOwner,
      isSubscribed: false,
      stripeSubscriptionStatus: "canceled",
    },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      email: "teammate@example.com",
      seatStatus: "removed",
    },
  });
  const stripe = makeStripe();
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await assert.rejects(
    () =>
      manager.reactivateSeat({
        ownerUid: "owner1",
        childUid: "child_1",
        tier: 1,
        permission: "own",
      }),
    (err) => err.statusCode === 402
  );
  assert.equal(stripe._calls.length, 0);
});

/* ---------------------------------------------------------
   SEAT SUMMARY SERIALIZATION
--------------------------------------------------------- */

test("listSeats sends createdAt as an ISO string, not a raw Timestamp", async () => {
  // Firestore Timestamps serialize to {_seconds,_nanoseconds} over JSON, which
  // the client cannot format into a local date.
  const created = new Date("2026-03-04T15:30:00.000Z");
  const db = makeDb({
    owner1: { ...activeOwner },
    seat_a: {
      accountId: "owner1",
      accountRole: "member",
      email: "teammate@example.com",
      seatStatus: "active",
      createdAt: { toDate: () => created },
    },
  });
  const manager = buildManager({
    db,
    stripe: makeStripe(),
    auth: makeAuth(),
    sentInvites: [],
  });

  const seats = await manager.listSeats("owner1");

  assert.equal(seats[0].createdAt, "2026-03-04T15:30:00.000Z");
});

test("listSeats omits createdAt when the seat has none", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    seat_a: {
      accountId: "owner1",
      accountRole: "member",
      email: "teammate@example.com",
      seatStatus: "active",
    },
  });
  const manager = buildManager({
    db,
    stripe: makeStripe(),
    auth: makeAuth(),
    sentInvites: [],
  });

  const seats = await manager.listSeats("owner1");

  assert.equal(seats[0].createdAt, undefined);
});

/* ---------------------------------------------------------
   CANCELLED SUBSCRIPTION
--------------------------------------------------------- */

const cancelledOwner = {
  ...activeOwner,
  isSubscribed: false,
  stripeSubscriptionStatus: "canceled",
};

test("removeSeat works after the subscription is cancelled, without calling Stripe", async () => {
  // Cancelling deletes every seat line item along with the subscription, so
  // asking Stripe to reconcile just fails with "customer does not have a
  // subscription with ID ...".
  const db = makeDb({
    owner1: { ...cancelledOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      email: "teammate@example.com",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
      isSubscribed: false,
    },
  });
  const stripe = makeStripe();
  stripe.subscriptionItems.list = async () => {
    throw new Error("Stripe should not be called for a cancelled subscription");
  };
  const auth = makeAuth();
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  const seat = await manager.removeSeat({ ownerUid: "owner1", childUid: "child_1" });

  assert.equal(seat.seatStatus, "removed");
  assert.equal(db._store.get("child_1").seatStatus, "removed");
  assert.deepEqual(auth._updated[0], ["child_1", { disabled: true }]);
  assert.equal(stripe._calls.length, 0);
});

test("changeSeatTier reports a subscription problem, not a Stripe error", async () => {
  const db = makeDb({
    owner1: { ...cancelledOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
    },
  });
  const stripe = makeStripe();
  const manager = buildManager({
    db,
    stripe,
    auth: makeAuth(),
    sentInvites: [],
  });

  await assert.rejects(
    () => manager.changeSeatTier({ ownerUid: "owner1", childUid: "child_1", tier: 3 }),
    (err) =>
      err.statusCode === 402 &&
      err.isSeatError === true &&
      /active or trialing subscription/i.test(err.message)
  );
  assert.equal(stripe._calls.length, 0);
});

test("syncSeatBilling treats a missing subscription as nothing to reconcile", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "active",
      isSubscribed: true,
      email: "teammate@example.com",
    },
  });
  const stripe = makeStripe();
  stripe.subscriptionItems.list = async () => {
    const err = new Error("No such subscription");
    err.code = "resource_missing";
    throw err;
  };
  const auth = makeAuth();
  const manager = buildManager({ db, stripe, auth, sentInvites: [] });

  // Should not throw a raw Stripe error up to the caller.
  await manager.removeSeat({ ownerUid: "owner1", childUid: "child_1" });
  assert.equal(db._store.get("child_1").seatStatus, "removed");
});

/* ---------------------------------------------------------
   RESUBSCRIBE — seat items must be rebuilt on the new subscription
--------------------------------------------------------- */

test("syncSeatBilling rebills active seats onto a fresh subscription after a resubscribe", async () => {
  // Cancelling destroyed the old subscription and every item on it. The owner
  // resubscribed, so `sub_new` exists carrying their plan alone — no seat items.
  const db = makeDb({
    owner1: { ...activeOwner, stripeSubscriptionId: "sub_new" },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_75",
      seatPlanAnalyzerLimit: 3,
      seatStatus: "active",
      isSubscribed: true,
      email: "one@example.com",
    },
    child_2: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_75",
      seatPlanAnalyzerLimit: 3,
      seatStatus: "active",
      isSubscribed: true,
      email: "two@example.com",
    },
    child_3: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "removed",
      isSubscribed: false,
      email: "gone@example.com",
    },
  });
  const stripe = makeStripe([]);
  const manager = buildManager({ db, stripe, auth: makeAuth(), sentInvites: [] });

  await manager.syncSeatBilling({ ownerUid: "owner1", subscriptionId: "sub_new" });

  // Both $75 seats share one item with quantity 2 — Stripe allows only one
  // item per price per subscription.
  assert.equal(stripe._quantityFor("price_75"), 2);
  // The removed seat is not billed.
  assert.equal(stripe._quantityFor("price_55"), 0);
});

test("syncSeatBilling is a no-op when the surviving subscription is already correct", async () => {
  // Dunning recovery: the subscription and its items were never destroyed.
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: {
      accountId: "owner1",
      accountRole: "member",
      stripeSeatPriceId: "price_75",
      seatPlanAnalyzerLimit: 3,
      seatStatus: "active",
      isSubscribed: true,
      email: "one@example.com",
    },
  });
  const stripe = makeStripe([
    {
      id: "si_existing",
      subscription: "sub_owner1",
      price: { id: "price_75" },
      quantity: 1,
    },
  ]);
  const manager = buildManager({ db, stripe, auth: makeAuth(), sentInvites: [] });

  await manager.syncSeatBilling({ ownerUid: "owner1", subscriptionId: "sub_owner1" });

  assert.equal(stripe._quantityFor("price_75"), 1);
  // No create/update/delete — only the read.
  const mutations = stripe._calls.filter(([kind]) => kind !== "list");
  assert.deepEqual(mutations, []);
});

/* ---------------------------------------------------------
   TRIAL SEAT CAP — one member until the plan is upgraded
--------------------------------------------------------- */

const trialingOwner = { ...activeOwner, stripeSubscriptionStatus: "trialing" };

const trialingMember = (overrides = {}) => ({
  accountId: "owner1",
  accountRole: "member",
  stripeSeatPriceId: "price_55",
  seatPlanAnalyzerLimit: 1,
  seatStatus: "active",
  isSubscribed: true,
  email: "first@example.com",
  ...overrides,
});

test("a trialing owner may add their first seat", async () => {
  const db = makeDb({ owner1: { ...trialingOwner } });
  const manager = buildManager({
    db,
    stripe: makeStripe(),
    auth: makeAuth(),
    sentInvites: [],
  });

  const seat = await manager.addSeat({
    ownerUid: "owner1",
    email: "first@example.com",
    tier: 1,
    permission: "own",
  });

  assert.equal(seat.seatStatus, "active");
});

test("a trialing owner is stopped at a second seat and told to upgrade", async () => {
  const db = makeDb({
    owner1: { ...trialingOwner },
    child_1: trialingMember(),
  });
  const manager = buildManager({
    db,
    stripe: makeStripe(),
    auth: makeAuth(),
    sentInvites: [],
  });

  await assert.rejects(
    () =>
      manager.addSeat({
        ownerUid: "owner1",
        email: "second@example.com",
        tier: 1,
        permission: "own",
      }),
    (err) => {
      assert.equal(err.statusCode, 409);
      // Tagged so the client can route to billing rather than print a line.
      assert.equal(err.upgradeRequired, true);
      assert.match(err.message, /Upgrade to the full plan/);
      return true;
    }
  );
});

test("reactivating a second seat on a trial hits the same cap", async () => {
  const db = makeDb({
    owner1: { ...trialingOwner },
    child_1: trialingMember(),
    child_2: trialingMember({
      seatStatus: "removed",
      isSubscribed: false,
      email: "back@example.com",
    }),
  });
  const manager = buildManager({
    db,
    stripe: makeStripe(),
    auth: makeAuth(),
    sentInvites: [],
  });

  await assert.rejects(
    () =>
      manager.reactivateSeat({
        ownerUid: "owner1",
        childUid: "child_2",
        tier: 1,
        permission: "own",
      }),
    (err) => err.upgradeRequired === true && err.statusCode === 409
  );

  // The seat stays removed — nothing half-applied.
  assert.equal(db._store.get("child_2").seatStatus, "removed");
});

test("a paid owner still gets all three seats, with no upgrade prompt", async () => {
  const db = makeDb({
    owner1: { ...activeOwner },
    child_1: trialingMember(),
    child_2: trialingMember({ email: "b@example.com" }),
    child_3: trialingMember({ email: "c@example.com" }),
  });
  const manager = buildManager({
    db,
    stripe: makeStripe(),
    auth: makeAuth(),
    sentInvites: [],
  });

  await assert.rejects(
    () =>
      manager.addSeat({
        ownerUid: "owner1",
        email: "fourth@example.com",
        tier: 1,
        permission: "own",
      }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /maximum of 3 seats/);
      // A paid account at capacity is a ceiling, not a paywall.
      assert.equal(err.upgradeRequired, undefined);
      return true;
    }
  );
});
