const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const cors = require("cors");
const { defineSecret } = require("firebase-functions/params");

setGlobalOptions({ maxInstances: 10 });

/* --------------------------------------------------
   SECRETS (DEFINE HERE ONLY)
-------------------------------------------------- */

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");
const STRIPE_WEBHOOK_SECRET_LIVE = defineSecret("STRIPE_WEBHOOK_SECRET_LIVE");
const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

/* --------------------------------------------------
   GENERATE ESTIMATE
-------------------------------------------------- */

exports.generateEstimate = onRequest(
  { secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const generateEstimateHandler = require("./routes/generateEstimate");

      await generateEstimateHandler(
        req,
        res,
        OPENAI_API_KEY.value()
      );
    });
  }
);

/* --------------------------------------------------
   STRIPE
-------------------------------------------------- */

exports.stripe = onRequest(
  {
    secrets: [
      STRIPE_SECRET_KEY_LIVE,
      STRIPE_WEBHOOK_SECRET_LIVE,
      SENDGRID_API_KEY,
    ],
  },
  (req, res) => {
    const stripeRoute = require("./routes/stripe");
    return stripeRoute.app(req, res);
  }
);

/* --------------------------------------------------
   AUTH
-------------------------------------------------- */

exports.auth = onRequest(
  {
    secrets: [SENDGRID_API_KEY],
  },
  (req, res) => {
    const authRoute = require("./routes/auth");
    return authRoute.app(req, res);
  }
);
