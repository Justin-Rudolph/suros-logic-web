const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");
const admin = require("firebase-admin");
const { auth } = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");
const { sendEmail } = require("./lib/resend");
const { getAppBaseUrl, getEnvironmentValue, isDevProject } = require("./lib/runtimeEnv");
const {
  DEFAULT_PLAN_ANALYSIS_MONTHLY_LIMIT,
  TRIAL_PLAN_ANALYSIS_MONTHLY_LIMIT,
  getPlanAnalyzerMonthlyLimit,
} = require("./lib/planAnalyzerQuota");
const {
  propagateSubscriptionStatusToMembers: propagateStatusToMembers,
} = require("./lib/subscriptionPropagation");
const { createSeatManager } = require("./lib/seatManager");

/* 🔥 FIX: prevent double initialization */
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const app = express();
app.use(cors());

/* ---------------------------------------------------------
   ENVIRONMENT HELPERS
--------------------------------------------------------- */

const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
const isDevEnvironment = isEmulator || isDevProject();

const BASE_URL = getAppBaseUrl();

const getPriceId = () => {
  return process.env.STRIPE_PRICE_ID_MONTHLY_150;
};

// Child-seat recurring Prices, tiered by the monthly plan-analyzer quota the
// seat buys. Same env/secret pattern as STRIPE_PRICE_ID_MONTHLY_150.
const CHILD_SEAT_PRICE_ENV_BY_TIER = {
  1: "STRIPE_PRICE_ID_CHILD_SEAT_1", // $55/mo, 1 analysis/month
  2: "STRIPE_PRICE_ID_CHILD_SEAT_2", // $65/mo, 2 analyses/month
  3: "STRIPE_PRICE_ID_CHILD_SEAT_3", // $75/mo, 3 analyses/month
};

const getChildSeatPriceId = (tier) => {
  const envName = CHILD_SEAT_PRICE_ENV_BY_TIER[tier];
  return envName ? process.env[envName] : undefined;
};

const QUICKSTART_TRIAL_DAYS = 30;
const LANDING_CHECKOUT_SOURCE = "landing_quickstart";

/* ---------------------------------------------------------
   HELPER: RESET EMAIL
--------------------------------------------------------- */

const sendResetEmail = async (toEmail, resetLink) => {
  await sendEmail({
    to: toEmail,
    from: "Suros Logic Support <support@suroslogic.com>",
    subject: "Set your password - Suros Logic",
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>Welcome to Suros Logic</h2>
        <p>Your account has been created.</p>
        <p>Click below to set your password:</p>
        <a href="${resetLink}" 
           style="
             display:inline-block;
             padding:12px 20px;
             background:#1e73be;
             color:white;
             text-decoration:none;
             border-radius:6px;
             margin-top:10px;
           ">
          Set Password
        </a>
        <p style="margin-top:20px;">If you didn’t request this, ignore this email.</p>
      </div>
    `,
  });
};

/* ---------------------------------------------------------
   HELPER: TEAM INVITE EMAIL
--------------------------------------------------------- */

const sendSeatInviteEmail = async (toEmail, resetLink, companyName) => {
  const teamLabel = companyName ? `${companyName}'s team` : "a team";

  await sendEmail({
    to: toEmail,
    from: "Suros Logic Support <support@suroslogic.com>",
    subject: "You've been added to a team - Suros Logic",
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>Welcome to Suros Logic</h2>
        <p>You've been added to ${teamLabel} on Suros Logic.</p>
        <p>Set your password to log in:</p>
        <a href="${resetLink}"
           style="
             display:inline-block;
             padding:12px 20px;
             background:#1e73be;
             color:white;
             text-decoration:none;
             border-radius:6px;
             margin-top:10px;
           ">
          Set Password
        </a>
        <p style="margin-top:20px;">If you weren't expecting this, you can safely ignore this email.</p>
      </div>
    `,
  });
};

/* ---------------------------------------------------------
   HELPER: SELECT STRIPE MODE
--------------------------------------------------------- */

const getStripe = () => {
  const key = getEnvironmentValue("STRIPE_SECRET_KEY");

  if (!key) {
    throw new Error("Missing Stripe secret key");
  }

  console.log("Stripe mode:", isDevEnvironment ? "TEST" : "LIVE");

  return new Stripe(key);
};

/* ---------------------------------------------------------
   HELPER: UPDATE SUBSCRIPTION
--------------------------------------------------------- */

const getPlanAnalyzerLimitForSubscriptionStatus = (status) =>
  status === "trialing"
    ? TRIAL_PLAN_ANALYSIS_MONTHLY_LIMIT
    : DEFAULT_PLAN_ANALYSIS_MONTHLY_LIMIT;

// Propagate a subscription-status change to every member seat riding the
// owner's single subscription. Delegates to the injectable lib helper.
const propagateSubscriptionStatusToMembers = (ownerUid, status) =>
  propagateStatusToMembers(
    {
      db,
      authAdmin: admin.auth(),
      getPlanAnalyzerMonthlyLimit,
      now: () => Timestamp.now(),
    },
    ownerUid,
    status
  );

/**
 * Rebuild the account's seat line items after its subscription comes back.
 *
 * Cancelling destroys the Stripe subscription and every item on it, so a
 * resubscribe produces a brand new subscription carrying the owner's plan
 * alone. Propagation above restores the members' access, which would otherwise
 * hand them working seats the owner is no longer billed for.
 *
 * syncSeatBilling derives target quantities from Firestore rather than applying
 * a delta, so this is idempotent — safe to run on every activating event, and a
 * no-op when the items are already correct (the dunning-recovery case, where
 * the subscription and its items survived).
 */
const resyncSeatBilling = async (ownerUid, subscriptionId) => {
  if (!subscriptionId) return;

  try {
    const seatManager = createSeatManager({
      db,
      stripe: getStripe(),
      authAdmin: admin.auth(),
      getChildSeatPriceId,
      getPlanAnalyzerMonthlyLimit,
      sendSeatInviteEmail,
      now: () => Timestamp.now(),
    });

    await seatManager.syncSeatBilling({ ownerUid, subscriptionId });
  } catch (err) {
    // Best effort. The members are already usable again, and the next seat
    // change reconciles from scratch. Logged so an unbilled seat is visible
    // rather than silent.
    console.error(`Failed to resync seat billing for owner ${ownerUid}:`, err);
  }
};

/**
 * Checkout line items for the seats a resubscribe will bring back.
 *
 * A suspended seat keeps `seatStatus: "active"` while the owner is unsubscribed
 * — only its access is revoked — so it is restored the moment billing resumes.
 * Checkout therefore has to price those seats up front. Quoting the plan alone
 * would show the owner one number and bill another, with the seats surfacing as
 * a surprise proration on the next invoice.
 *
 * Grouped by price with a quantity, since Stripe permits only one item per
 * price per subscription. Deliberately mirrors syncSeatBilling's target, so the
 * reconcile that runs after checkout finds the items already correct and does
 * nothing.
 *
 * Returns [] for a landing-page signup, which has no account and no seats.
 *
 * `isPriceUsable` is injected so the price check can be stubbed in tests. It
 * defaults to trusting every id, which keeps the pure grouping logic testable
 * on its own.
 */
const buildSeatLineItems = async (
  firestore,
  ownerUid,
  isPriceUsable = async () => true
) => {
  if (!ownerUid) return [];

  const snap = await firestore
    .collection("users")
    .where("accountId", "==", ownerUid)
    .where("accountRole", "==", "member")
    .get();

  const quantities = new Map();

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    // Removed seats are not coming back on their own — the owner has to
    // reactivate them explicitly, which prices them at that point.
    if (data.seatStatus === "removed") continue;

    const storedPrice = data.stripeSeatPriceId;
    const tierPrice = getChildSeatPriceId(data.seatPlanAnalyzerLimit);

    // A seat's stored price id can outlive the price itself — archived during
    // a price migration, or deleted from a test account. Unlike syncSeatBilling,
    // which logs and self-heals on the next seat change, a bad id here is fatal:
    // checkout.sessions.create rejects the whole session, leaving the owner
    // unable to resubscribe at all. So fall back to the seat's current tier
    // price before giving up.
    let priceId = null;
    for (const candidate of [storedPrice, tierPrice]) {
      if (!candidate) continue;
      if (await isPriceUsable(candidate)) {
        priceId = candidate;
        break;
      }
    }

    if (!priceId) {
      // No id at all configured for this tier: nothing to bill, same as before.
      if (!storedPrice && !tierPrice) continue;

      // Ids exist but none are usable. Quoting the plan alone would hand the
      // owner a working seat they are never charged for, so stop and say so.
      const error = new Error(
        `No usable Stripe price for seat tier ${data.seatPlanAnalyzerLimit} ` +
          `(stored: ${storedPrice || "none"}, tier: ${tierPrice || "none"})`
      );
      error.isSeatPricingError = true;
      throw error;
    }

    quantities.set(priceId, (quantities.get(priceId) || 0) + 1);
  }

  return [...quantities].map(([price, quantity]) => ({ price, quantity }));
};

/**
 * Price-id validator for checkout, memoised across the session build so a
 * three-seat account costs at most a couple of Stripe lookups.
 *
 * Any lookup failure counts as unusable rather than throwing: the caller then
 * falls back to the tier price, and if that fails too it raises a seat-pricing
 * error with real detail instead of a bare Stripe message.
 */
const makePriceValidator = (stripe) => {
  const cache = new Map();

  return async (priceId) => {
    if (cache.has(priceId)) return cache.get(priceId);

    let usable = false;
    try {
      const price = await stripe.prices.retrieve(priceId);
      usable = price?.active === true;
    } catch (err) {
      console.error(`Stripe price ${priceId} is not retrievable:`, err.message);
    }

    cache.set(priceId, usable);
    return usable;
  };
};

/**
 * Whether the account already has a subscription Stripe considers live.
 *
 * Checkout creates a brand new subscription every time, so an owner who reaches
 * it while already subscribed ends up paying twice — and now for a duplicate
 * set of seat items too.
 *
 * Deliberately asks Stripe rather than trusting `isSubscribed`: the Firestore
 * copy is webhook-derived and can be stale in exactly the situation that
 * matters, and a false positive would lock a paying customer out of
 * resubscribing. `past_due` counts as live — that account needs to fix its card
 * through the portal, not start a second subscription.
 */
const hasLiveStripeSubscription = async (stripe, profile) => {
  const subscriptionId = profile?.stripeSubscriptionId;
  if (!subscriptionId) return false;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return ["active", "trialing", "past_due"].includes(subscription?.status);
  } catch (err) {
    // The subscription is gone, which is precisely when resubscribing is right.
    if (err?.code === "resource_missing" || err?.statusCode === 404) return false;
    throw err;
  }
};

const updateSubscriptionStatus = async (stripeCustomerId, status, subscriptionId) => {
  const isSubscribed = ["active", "trialing"].includes(status);
  const usersRef = db.collection("users");

  const snap = await usersRef
    .where("stripeCustomerId", "==", stripeCustomerId)
    .limit(1)
    .get();

  if (snap.empty) return;

  const ownerDoc = snap.docs[0];

  const ownerUpdate = {
    isSubscribed,
    stripeSubscriptionStatus: status,
    "planAnalyzerUsage.monthlyLimit": getPlanAnalyzerLimitForSubscriptionStatus(status),
    "planAnalyzerUsage.updatedAt": Timestamp.now(),
  };

  // Capture the subscription id on the owner's doc — attaching/removing seat
  // line items requires it, and only stripeCustomerId is stored today.
  if (subscriptionId) {
    ownerUpdate.stripeSubscriptionId = subscriptionId;
  }

  await ownerDoc.ref.update(ownerUpdate);

  // Children ride entirely on the parent's one subscription — if the parent's
  // card fails or the subscription is cancelled, every seat loses access too.
  await propagateSubscriptionStatusToMembers(ownerDoc.id, status);

  // Access has just been restored above; make sure the seats are billed again.
  if (isSubscribed) {
    await resyncSeatBilling(
      ownerDoc.id,
      subscriptionId || ownerDoc.data()?.stripeSubscriptionId
    );
  }
};

const getUserProfileByEmail = async (email) => {
  if (!email) return null;

  const snap = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (snap.empty) return null;

  return {
    id: snap.docs[0].id,
    ref: snap.docs[0].ref,
    data: snap.docs[0].data(),
  };
};

const getAuthUserByEmail = async (email) => {
  if (!email) return null;

  try {
    return await auth().getUserByEmail(email);
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      return null;
    }

    throw err;
  }
};

const verifyFirebaseUser = async (req) => {
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    const error = new Error("Authentication is required.");
    error.statusCode = 401;
    throw error;
  }

  try {
    return await auth().verifyIdToken(match[1]);
  } catch (err) {
    const error = new Error("Authentication is invalid or expired.");
    error.statusCode = 401;
    throw error;
  }
};

/* ---------------------------------------------------------
   STRIPE WEBHOOK
--------------------------------------------------------- */

app.post(
  "/events",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      const webhookSecret = getEnvironmentValue("STRIPE_WEBHOOK_SECRET");

      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        webhookSecret
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;

          const email = session.customer_details?.email;
          const stripeCustomerId = session.customer;
          if (!email || !stripeCustomerId) break;

          let subscriptionStatus = "active";
          if (session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            subscriptionStatus = subscription.status;
          }

          let userRecord;
          let isNewUser = false;
          let profileComplete = false;

          try {
            userRecord = await auth().getUserByEmail(email);
            console.log("Existing user:", email);
            profileComplete = true;
          } catch {
            userRecord = await auth().createUser({ email });
            isNewUser = true;
            console.log("New user created:", email);
          }

          const updateData = {
            uid: userRecord.uid,
            email,
            stripeCustomerId,
            isSubscribed: ["active", "trialing"].includes(subscriptionStatus),
            stripeSubscriptionStatus: subscriptionStatus,
            planAnalyzerUsage: {
              monthlyLimit: getPlanAnalyzerLimitForSubscriptionStatus(subscriptionStatus),
            },
            profileComplete: profileComplete,
            justCreated: isNewUser,
          };

          // Capture the subscription id — required later to attach/remove seat
          // line items — since only stripeCustomerId was stored historically.
          if (session.subscription) {
            updateData.stripeSubscriptionId = session.subscription;
          }

          if (isNewUser) {
            updateData.createdAt = Timestamp.now();
            // A checkout signup is a standalone owner: their own account of one.
            updateData.accountId = userRecord.uid;
            updateData.accountRole = "owner";
          }

          await db.collection("users").doc(userRecord.uid).set(
            updateData,
            { merge: true }
          );

          // Members ride this same subscription. invoice.payment_succeeded
          // normally follows and would cover them, but this is the event that
          // actually confirms the purchase — propagating here stops the seats
          // from depending on a second webhook arriving. Both calls are
          // idempotent, and a brand new signup simply has no members to visit.
          await propagateSubscriptionStatusToMembers(
            userRecord.uid,
            subscriptionStatus
          );

          if (["active", "trialing"].includes(subscriptionStatus)) {
            await resyncSeatBilling(userRecord.uid, session.subscription);
          }

          if (isNewUser) {
            try {
              const resetLink = await admin
                .auth()
                .generatePasswordResetLink(email);

              // SEND EMAIL
              await sendResetEmail(email, resetLink);

              console.log("Password reset email sent to:", email);
            } catch (err) {
              console.error("Reset link error:", err);
            }
          }

          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object;
          await updateSubscriptionStatus(subscription.customer, subscription.status, subscription.id);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          await updateSubscriptionStatus(
            subscription.customer,
            subscription.status || "canceled",
            subscription.id
          );
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;

          // event.data.object is an Invoice here, not a Subscription: its
          // `status` is the invoice's own ("open"), which is not a subscription
          // status at all and was being stored as one. Read the subscription
          // for the real value — past_due during dunning, canceled or unpaid
          // once Stripe gives up — mirroring invoice.payment_succeeded below.
          //
          // Guarding on `subscription` also stops a one-off invoice, which has
          // none, from being treated as a subscription failure and locking the
          // whole account out.
          if (!invoice.subscription) break;

          const subscription = await stripe.subscriptions.retrieve(
            invoice.subscription
          );
          await updateSubscriptionStatus(
            subscription.customer,
            subscription.status,
            subscription.id
          );
          break;
        }

        case "invoice.payment_succeeded": {
          if (event.data.object.subscription) {
            const subscription = await stripe.subscriptions.retrieve(event.data.object.subscription);
            await updateSubscriptionStatus(subscription.customer, subscription.status, subscription.id);
          }
          break;
        }
      }
    } catch (err) {
      console.error("Webhook processing error:", err);
    }

    res.json({ received: true });
  }
);

/* ---------------------------------------------------------
   JSON PARSER
--------------------------------------------------------- */

app.use(express.json());

/* ---------------------------------------------------------
   CHECKOUT
--------------------------------------------------------- */

app.post("/checkout", async (req, res) => {
  try {
    const stripe = getStripe();

    const { email, source } = req.body || {};
    let normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const isLandingCheckout = source === LANDING_CHECKOUT_SOURCE;

    let customerId = null;
    let customerUid = "";
    let shouldApplyLandingTrial = false;

    if (isLandingCheckout) {
      if (!normalizedEmail) {
        return res.status(400).json({ error: "Email is required." });
      }

      const existingAuthUser = await getAuthUserByEmail(normalizedEmail);
      const existingUser = normalizedEmail
        ? await getUserProfileByEmail(normalizedEmail)
        : null;

      if (existingAuthUser) {
        return res.status(409).json({
          error: "User with this account already exists.",
          existingAccount: true,
        });
      }

      if (existingUser?.data?.stripeCustomerId) {
        customerId = existingUser.data.stripeCustomerId;
      }

      shouldApplyLandingTrial = true;
    } else {
      const decodedToken = await verifyFirebaseUser(req);
      const userSnap = await db.collection("users").doc(decodedToken.uid).get();
      const profile = userSnap.data() || {};

      if (await hasLiveStripeSubscription(stripe, profile)) {
        return res.status(409).json({
          error:
            "This account already has an active subscription. Use Manage subscription to make changes.",
          alreadySubscribed: true,
        });
      }

      customerId = profile.stripeCustomerId || null;
      customerUid = decodedToken.uid;
      normalizedEmail =
        typeof profile.email === "string" && profile.email.trim()
          ? profile.email.trim().toLowerCase()
          : decodedToken.email || "";
    }

    /* ---------------------------------------------------------
       CREATE CUSTOMER ONLY IF EMAIL EXISTS
    --------------------------------------------------------- */
    if (!customerId && normalizedEmail) {
      const customer = await stripe.customers.create({
        email: normalizedEmail,
        metadata: {
          uid: customerUid,
        },
      });

      customerId = customer.id;

      console.log("Created Stripe customer:", customerId);
    }

    /* ---------------------------------------------------------
    CREATE CHECKOUT SESSION
    --------------------------------------------------------- */

    // Deliberately not caught: if the seats cannot be read we would quote the
    // plan alone and silently under-bill, which is worse than asking the owner
    // to retry.
    const seatLineItems = await buildSeatLineItems(
      db,
      customerUid,
      makePriceValidator(stripe)
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",

      // ✅ ONLY attach if exists
      ...(customerId && { customer: customerId }),

      // ✅ OPTIONAL: prefill email if we have it
      ...(normalizedEmail && !customerId && { customer_email: normalizedEmail }),

      line_items: [{ price: getPriceId(), quantity: 1 }, ...seatLineItems],
      ...(shouldApplyLandingTrial && {
        subscription_data: {
          trial_period_days: QUICKSTART_TRIAL_DAYS,
        },
      }),
      metadata: {
        checkoutSource: source || "",
      },

      allow_promotion_codes: true,

      success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/`,
    });

    res.json({ url: session.url });

  } catch (err) {
    // A seat we cannot price is a configuration problem, not a transient
    // failure — "Checkout failed" would leave the owner retrying forever.
    if (err?.isSeatPricingError) {
      console.error("Checkout blocked by unpriceable seat:", err.message);
      return res.status(409).json({
        error:
          "We couldn't price one of your team seats. Remove it from your team or contact support, then try again.",
        seatPricingError: true,
      });
    }

    console.error("Checkout error:", err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

/* ---------------------------------------------------------
   PORTAL
--------------------------------------------------------- */

app.post("/portal", async (req, res) => {
  try {
    const stripe = getStripe();
    const decodedToken = await verifyFirebaseUser(req);
    const { stripeCustomerId } = req.body;
    const userSnap = await db.collection("users").doc(decodedToken.uid).get();
    const profile = userSnap.data() || {};

    if (!stripeCustomerId || profile.stripeCustomerId !== stripeCustomerId) {
      return res.status(403).json({ error: "Billing portal access denied" });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${BASE_URL}/dashboard`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Portal error:", err);
    res.status(err.statusCode || 500).json({ error: "Portal failed" });
  }
});

/* ---------------------------------------------------------
   END TRIAL EARLY
--------------------------------------------------------- */

app.post("/end-trial", async (req, res) => {
  try {
    const stripe = getStripe();
    const decodedToken = await verifyFirebaseUser(req);
    const userSnap = await db.collection("users").doc(decodedToken.uid).get();
    const profile = userSnap.data() || {};

    // Members ride the owner's subscription and never manage billing.
    if (profile.accountRole === "member") {
      return res.status(403).json({
        error: "Your account owner manages billing for this team.",
      });
    }

    const subscriptionId = profile.stripeSubscriptionId;
    if (!subscriptionId) {
      return res.status(409).json({ error: "No subscription to upgrade." });
    }

    // Ask Stripe rather than trusting the webhook-derived copy in Firestore,
    // which can lag. This also makes a double-click a harmless 409 instead of a
    // second attempt to bill.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // The id comes from Firestore, not the request, but a doc carrying another
    // account's subscription id is a drift this codebase has already produced
    // once — member docs inherited the parent's. Ending the wrong trial charges
    // the wrong customer and writes to the wrong user doc, so confirm ownership
    // the same way /portal does before touching anything.
    if (
      !profile.stripeCustomerId ||
      subscription.customer !== profile.stripeCustomerId
    ) {
      console.error(
        `End trial blocked: ${decodedToken.uid} does not own ${subscriptionId}`
      );
      return res.status(403).json({ error: "Subscription access denied." });
    }

    if (subscription.status !== "trialing") {
      return res
        .status(409)
        .json({ error: "This subscription is not on a trial." });
    }

    // Ending a trial invoices immediately. With no payment method on file that
    // invoice fails and the account lands in past_due — strictly worse than the
    // trial they started from — so refuse up front and let them add a card.
    const customer = await stripe.customers.retrieve(subscription.customer);
    const hasPaymentMethod = Boolean(
      subscription.default_payment_method ||
        customer?.invoice_settings?.default_payment_method
    );

    if (!hasPaymentMethod) {
      return res.status(409).json({
        error: "Add a payment method before ending your trial.",
        needsPaymentMethod: true,
      });
    }

    const updated = await stripe.subscriptions.update(subscriptionId, {
      trial_end: "now",
    });

    // Reflect the change now instead of waiting for the webhook: the user is
    // looking at the screen, and their analysis limit should already be raised
    // by the time they get back to it. The webhook repeats this moments later,
    // which is harmless — every step of it is idempotent.
    await updateSubscriptionStatus(updated.customer, updated.status, updated.id);

    if (!["active", "trialing"].includes(updated.status)) {
      // The immediate invoice did not clear. The status written above is the
      // honest one; say so rather than reporting success.
      return res.status(402).json({
        error:
          "Your card was declined. Update your payment method and try again.",
        status: updated.status,
      });
    }

    return res.json({ status: updated.status });
  } catch (err) {
    console.error("End trial error:", err);
    return res
      .status(500)
      .json({ error: "Could not end your trial. Please try again." });
  }
});

/* ---------------------------------------------------------
   GET SESSION
--------------------------------------------------------- */

app.get("/session/:sessionId", async (req, res) => {
  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(
      req.params.sessionId
    );

    const email = session.customer_details?.email;

    if (!email) {
      return res.status(400).json({ error: "No email found" });
    }

    let subscriptionStatus = null;
    if (session.status === "complete" && session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      subscriptionStatus = subscription.status;
    } else if (session.status === "complete" && session.customer) {
      subscriptionStatus = "active";
    }

    const usersRef = db.collection("users");

    const snap = await usersRef
      .where("email", "==", email)
      .limit(1)
      .get();

    let justCreated = false;

    if (!snap.empty) {
      const userDoc = snap.docs[0];
      justCreated = userDoc.data().justCreated === true;

      if (session.status === "complete" && session.customer && subscriptionStatus) {
        await userDoc.ref.set(
          {
            stripeCustomerId: session.customer,
            ...(session.subscription && {
              stripeSubscriptionId: session.subscription,
            }),
            isSubscribed: ["active", "trialing"].includes(subscriptionStatus),
            stripeSubscriptionStatus: subscriptionStatus,
            planAnalyzerUsage: {
              monthlyLimit: getPlanAnalyzerLimitForSubscriptionStatus(subscriptionStatus),
              updatedAt: Timestamp.now(),
            },
          },
          { merge: true }
        );
      }
    }

    res.json({ email, justCreated, stripeSubscriptionStatus: subscriptionStatus });

  } catch (err) {
    console.error("Session fetch error:", err);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

module.exports = {
  app,
  // Shared helpers reused by the seat-management route.
  getStripe,
  getChildSeatPriceId,
  sendSeatInviteEmail,
  verifyFirebaseUser,
  getAuthUserByEmail,
  propagateSubscriptionStatusToMembers,
  updateSubscriptionStatus,
  buildSeatLineItems,
  makePriceValidator,
  hasLiveStripeSubscription,
};
