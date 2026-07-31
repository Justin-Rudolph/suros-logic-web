const test = require("node:test");
const assert = require("node:assert/strict");

// Seat price ids resolve from env, so they must be set before stripe.js loads.
process.env.STRIPE_PRICE_ID_CHILD_SEAT_1 = "price_55";
process.env.STRIPE_PRICE_ID_CHILD_SEAT_2 = "price_65";
process.env.STRIPE_PRICE_ID_CHILD_SEAT_3 = "price_75";

const { buildSeatLineItems } = require("../routes/stripe");

/* ---------------------------------------------------------
   TEST HARNESS — minimal Firestore query mock
--------------------------------------------------------- */

// Supports only the shape buildSeatLineItems uses:
// collection("users").where(...).where(...).get()
const makeDb = (docs) => ({
  collection: () => {
    const query = {
      where: () => query,
      get: async () => ({
        docs: Object.values(docs).map((data) => ({ data: () => data })),
      }),
    };
    return query;
  },
});

const member = (overrides) => ({
  accountId: "owner1",
  accountRole: "member",
  seatStatus: "active",
  ...overrides,
});

/* ---------------------------------------------------------
   TESTS
--------------------------------------------------------- */

test("an owner with no seats checks out on the plan alone", async () => {
  const items = await buildSeatLineItems(makeDb({}), "owner1");
  assert.deepEqual(items, []);
});

test("a landing-page signup never looks up seats", async () => {
  let queried = false;
  const db = {
    collection: () => {
      queried = true;
      return { where: () => ({}), get: async () => ({ docs: [] }) };
    },
  };

  const items = await buildSeatLineItems(db, "");

  assert.deepEqual(items, []);
  assert.equal(queried, false);
});

test("suspended seats are quoted at checkout, grouped by price", async () => {
  // Two $75 seats and one $55 seat, all suspended by the cancellation.
  const db = makeDb({
    child_1: member({ stripeSeatPriceId: "price_75", seatPlanAnalyzerLimit: 3 }),
    child_2: member({ stripeSeatPriceId: "price_75", seatPlanAnalyzerLimit: 3 }),
    child_3: member({ stripeSeatPriceId: "price_55", seatPlanAnalyzerLimit: 1 }),
  });

  const items = await buildSeatLineItems(db, "owner1");

  // One line item per price — Stripe rejects two items sharing a price.
  assert.deepEqual(items.sort((a, b) => a.price.localeCompare(b.price)), [
    { price: "price_55", quantity: 1 },
    { price: "price_75", quantity: 2 },
  ]);
});

test("removed seats are not quoted — they come back only via reactivation", async () => {
  const db = makeDb({
    child_1: member({ stripeSeatPriceId: "price_75", seatPlanAnalyzerLimit: 3 }),
    child_2: member({
      stripeSeatPriceId: "price_55",
      seatPlanAnalyzerLimit: 1,
      seatStatus: "removed",
    }),
  });

  const items = await buildSeatLineItems(db, "owner1");

  assert.deepEqual(items, [{ price: "price_75", quantity: 1 }]);
});

test("a seat with no stored price id falls back to its tier's price", async () => {
  const db = makeDb({
    child_1: member({ seatPlanAnalyzerLimit: 2 }),
  });

  const items = await buildSeatLineItems(db, "owner1");

  assert.deepEqual(items, [{ price: "price_65", quantity: 1 }]);
});

test("a seat whose tier resolves to no price is skipped rather than crashing checkout", async () => {
  const db = makeDb({
    child_1: member({ seatPlanAnalyzerLimit: 99 }),
    child_2: member({ stripeSeatPriceId: "price_75", seatPlanAnalyzerLimit: 3 }),
  });

  const items = await buildSeatLineItems(db, "owner1");

  assert.deepEqual(items, [{ price: "price_75", quantity: 1 }]);
});

/* ---------------------------------------------------------
   PRICE FALLBACK — a stale stored price must not block checkout
--------------------------------------------------------- */

const { makePriceValidator, hasLiveStripeSubscription } = require("../routes/stripe");

test("a seat whose stored price was archived falls back to its tier price", async () => {
  const db = makeDb({
    child_1: member({ stripeSeatPriceId: "price_old_75", seatPlanAnalyzerLimit: 3 }),
  });
  const isPriceUsable = async (id) => id !== "price_old_75";

  const items = await buildSeatLineItems(db, "owner1", isPriceUsable);

  assert.deepEqual(items, [{ price: "price_75", quantity: 1 }]);
});

test("seats on archived and current prices still collapse into one line item", async () => {
  // Mid-migration: one seat backfilled to the new price, one not.
  const db = makeDb({
    child_1: member({ stripeSeatPriceId: "price_old_75", seatPlanAnalyzerLimit: 3 }),
    child_2: member({ stripeSeatPriceId: "price_75", seatPlanAnalyzerLimit: 3 }),
  });
  const isPriceUsable = async (id) => id !== "price_old_75";

  const items = await buildSeatLineItems(db, "owner1", isPriceUsable);

  assert.deepEqual(items, [{ price: "price_75", quantity: 2 }]);
});

test("a seat with no usable price stops checkout instead of under-billing", async () => {
  const db = makeDb({
    child_1: member({ stripeSeatPriceId: "price_old_75", seatPlanAnalyzerLimit: 3 }),
  });
  const isPriceUsable = async () => false;

  await assert.rejects(
    () => buildSeatLineItems(db, "owner1", isPriceUsable),
    (err) => err.isSeatPricingError === true
  );
});

test("the price validator accepts active prices and caches each id once", async () => {
  const looked = [];
  const stripe = {
    prices: {
      retrieve: async (id) => {
        looked.push(id);
        return { id, active: true };
      },
    },
  };
  const isPriceUsable = makePriceValidator(stripe);

  assert.equal(await isPriceUsable("price_75"), true);
  assert.equal(await isPriceUsable("price_75"), true);
  assert.deepEqual(looked, ["price_75"]);
});

test("the price validator rejects archived prices and unretrievable ids", async () => {
  const stripe = {
    prices: {
      retrieve: async (id) => {
        if (id === "price_gone") {
          const err = new Error("No such price");
          err.code = "resource_missing";
          throw err;
        }
        return { id, active: false };
      },
    },
  };
  const isPriceUsable = makePriceValidator(stripe);

  assert.equal(await isPriceUsable("price_archived"), false);
  assert.equal(await isPriceUsable("price_gone"), false);
});

/* ---------------------------------------------------------
   DUPLICATE SUBSCRIPTION GUARD
--------------------------------------------------------- */

const stripeWithSubscription = (status) => ({
  subscriptions: {
    retrieve: async () => ({ status }),
  },
});

test("an owner with no subscription id may check out", async () => {
  const live = await hasLiveStripeSubscription(stripeWithSubscription("active"), {});
  assert.equal(live, false);
});

test("an active or past_due subscription blocks a second checkout", async () => {
  for (const status of ["active", "trialing", "past_due"]) {
    const live = await hasLiveStripeSubscription(stripeWithSubscription(status), {
      stripeSubscriptionId: "sub_1",
    });
    assert.equal(live, true, `${status} should count as live`);
  }
});

test("a cancelled subscription does not block resubscribing", async () => {
  const live = await hasLiveStripeSubscription(stripeWithSubscription("canceled"), {
    stripeSubscriptionId: "sub_1",
  });
  assert.equal(live, false);
});

test("a deleted subscription does not block resubscribing", async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => {
        const err = new Error("No such subscription");
        err.code = "resource_missing";
        throw err;
      },
    },
  };

  const live = await hasLiveStripeSubscription(stripe, { stripeSubscriptionId: "sub_dead" });
  assert.equal(live, false);
});

test("an unreadable subscription fails closed rather than risking a double charge", async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => {
        throw new Error("Stripe is unreachable");
      },
    },
  };

  await assert.rejects(() =>
    hasLiveStripeSubscription(stripe, { stripeSubscriptionId: "sub_1" })
  );
});
