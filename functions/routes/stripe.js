const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");
const admin = require("firebase-admin");
const { auth } = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");

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

const sgMail = require("@sendgrid/mail");

let sendgridInitialized = false;

const getSendGrid = () => {
  if (!sendgridInitialized) {
    const key = process.env.SENDGRID_API_KEY;

    if (!key || !key.startsWith("SG.")) {
      console.error("❌ Invalid SendGrid API key:", key);
      throw new Error("Invalid SendGrid API key");
    }

    sgMail.setApiKey(key);
    sendgridInitialized = true;
  }

  return sgMail;
};

const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

const BASE_URL = isEmulator
  ? "http://localhost:5173"
  : "https://suroslogic.com";

const getPriceId = () => {
  return isEmulator
    ? process.env.STRIPE_PRICE_ID_MONTHLY_TEST
    : process.env.STRIPE_PRICE_ID_MONTHLY_LIVE;
};

const QUICKSTART_TRIAL_DAYS = 30;
const LANDING_CHECKOUT_SOURCE = "landing_quickstart";
const LANDING_PROMO_CODE = "SUROS50";

/* ---------------------------------------------------------
   HELPER: RESET EMAIL
--------------------------------------------------------- */

const sendResetEmail = async (toEmail, resetLink) => {
  const msg = {
    to: toEmail,
    from: {
      email: "support@suroslogic.com",
      name: "Suros Logic Support",
    },
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
  };

  await getSendGrid().send(msg);
};

/* ---------------------------------------------------------
   HELPER: SELECT STRIPE MODE
--------------------------------------------------------- */

const getStripe = () => {
  let key;

  if (isEmulator) {
    key = process.env.STRIPE_SECRET_KEY_TEST;
  } else {
    key = process.env.STRIPE_SECRET_KEY_LIVE;
  }

  if (!key) {
    throw new Error("Missing Stripe secret key");
  }

  console.log("Stripe mode:", isEmulator ? "TEST" : "LIVE");

  return new Stripe(key);
};

/* ---------------------------------------------------------
   HELPER: UPDATE SUBSCRIPTION
--------------------------------------------------------- */

const updateSubscriptionStatus = async (stripeCustomerId, isSubscribed) => {
  const usersRef = db.collection("users");

  const snap = await usersRef
    .where("stripeCustomerId", "==", stripeCustomerId)
    .limit(1)
    .get();

  if (snap.empty) return;

  await snap.docs[0].ref.update({ isSubscribed });
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

const getPromotionCodeIdByCode = async (stripe, code) => {
  const promotionCodes = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
  });

  if (!promotionCodes.data.length) {
    return null;
  }

  return promotionCodes.data[0].id;
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
      const webhookSecret = isEmulator
        ? process.env.STRIPE_WEBHOOK_SECRET_TEST
        : process.env.STRIPE_WEBHOOK_SECRET_LIVE;

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
            isSubscribed: true,
            profileComplete: profileComplete,
            justCreated: isNewUser,
          };

          if (isNewUser) {
            updateData.createdAt = Timestamp.now();
          }

          await db.collection("users").doc(userRecord.uid).set(
            updateData,
            { merge: true }
          );

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
          const isSubscribed = ["active", "trialing"].includes(subscription.status);
          await updateSubscriptionStatus(subscription.customer, isSubscribed);
          break;
        }

        case "customer.subscription.deleted":
        case "invoice.payment_failed": {
          await updateSubscriptionStatus(event.data.object.customer, false);
          break;
        }

        case "invoice.payment_succeeded": {
          await updateSubscriptionStatus(event.data.object.customer, true);
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

    const { stripeCustomerId, email, uid, source } = req.body || {};
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const isLandingCheckout = source === LANDING_CHECKOUT_SOURCE;

    let customerId = stripeCustomerId || null;
    let shouldApplyLandingTrial = false;
    let landingPromotionCodeId = null;

    if (isLandingCheckout && normalizedEmail) {
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
      landingPromotionCodeId = await getPromotionCodeIdByCode(
        stripe,
        LANDING_PROMO_CODE
      );
    }

    /* ---------------------------------------------------------
       CREATE CUSTOMER ONLY IF EMAIL EXISTS
    --------------------------------------------------------- */
    if (!customerId && normalizedEmail) {
      const customer = await stripe.customers.create({
        email: normalizedEmail,
        metadata: {
          uid: uid || "",
        },
      });

      customerId = customer.id;

      console.log("Created Stripe customer:", customerId);
    }

    /* ---------------------------------------------------------
    CREATE CHECKOUT SESSION
    --------------------------------------------------------- */
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",

      // ✅ ONLY attach if exists
      ...(customerId && { customer: customerId }),

      // ✅ OPTIONAL: prefill email if we have it
      ...(normalizedEmail && !customerId && { customer_email: normalizedEmail }),

      line_items: [{ price: getPriceId(), quantity: 1 }],
      ...(shouldApplyLandingTrial && {
        subscription_data: {
          trial_period_days: QUICKSTART_TRIAL_DAYS,
        },
      }),
      ...(landingPromotionCodeId && {
        discounts: [
          {
            promotion_code: landingPromotionCodeId,
          },
        ],
      }),
      metadata: {
        checkoutSource: source || "",
      },

      ...(!landingPromotionCodeId && { allow_promotion_codes: true }),

      success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/`,
    });

    res.json({ url: session.url });

  } catch (err) {
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
    const { stripeCustomerId } = req.body;

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${BASE_URL}/dashboard`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Portal error:", err);
    res.status(500).json({ error: "Portal failed" });
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

    const usersRef = db.collection("users");

    const snap = await usersRef
      .where("email", "==", email)
      .limit(1)
      .get();

    let justCreated = false;

    if (!snap.empty) {
      justCreated = snap.docs[0].data().justCreated === true;
    }

    res.json({ email, justCreated });

  } catch (err) {
    console.error("Session fetch error:", err);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

module.exports = { app };
