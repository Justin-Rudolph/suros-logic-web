const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getPlanAnalyzerMonthlyLimit,
  normalizePlanAnalyzerUsage,
} = require("../routes/lib/planAnalyzerQuota");

test("trialing subscriptions receive one plan analysis per month", () => {
  assert.equal(
    getPlanAnalyzerMonthlyLimit({ stripeSubscriptionStatus: "trialing" }),
    1
  );
});

test("active paid subscriptions receive three plan analyses per month", () => {
  assert.equal(
    getPlanAnalyzerMonthlyLimit({ stripeSubscriptionStatus: "active" }),
    3
  );
});

test("member seats receive their purchased seat tier once the account is active", () => {
  assert.equal(
    getPlanAnalyzerMonthlyLimit({
      accountRole: "member",
      stripeSubscriptionStatus: "active",
      seatPlanAnalyzerLimit: 2,
    }),
    2
  );

  assert.equal(
    getPlanAnalyzerMonthlyLimit({
      accountRole: "member",
      stripeSubscriptionStatus: "active",
      seatPlanAnalyzerLimit: 3,
    }),
    3
  );
});

test("member seats are capped at one analysis per month while the account is trialing", () => {
  // Even a seat purchased at the 3/month tier only gets 1/month during trial.
  assert.equal(
    getPlanAnalyzerMonthlyLimit({
      accountRole: "member",
      stripeSubscriptionStatus: "trialing",
      seatPlanAnalyzerLimit: 3,
    }),
    1
  );
});

test("member seats with no seat tier resolve to zero rather than the owner default", () => {
  assert.equal(
    getPlanAnalyzerMonthlyLimit({
      accountRole: "member",
      stripeSubscriptionStatus: "active",
    }),
    0
  );
});

test("active paid subscriptions override a stale saved trial limit", () => {
  const usage = normalizePlanAnalyzerUsage(
    {
      stripeSubscriptionStatus: "active",
      planAnalyzerUsage: {
        monthlyLimit: 1,
        used: 1,
        reserved: 0,
        periodKey: "2026-05",
      },
    },
    "2026-05"
  );

  assert.equal(usage.monthlyLimit, 3);
  assert.equal(usage.used, 1);
});
