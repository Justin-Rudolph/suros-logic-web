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
