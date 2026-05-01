const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const cors = require("cors");
const { defineSecret } = require("firebase-functions/params");

setGlobalOptions({ maxInstances: 10 });

/* --------------------------------------------------
   SECRETS (DEFINE HERE ONLY)
-------------------------------------------------- */

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const CONVERTAPI_SECRET = defineSecret("CONVERTAPI_SECRET");

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
   GENERATE BID FORM PROPOSAL
-------------------------------------------------- */

exports.generateBidFormProposal = onRequest(
  { secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const generateBidFormProposalHandler = require("./routes/generateBidFormProposal");

      await generateBidFormProposalHandler(
        req,
        res,
        OPENAI_API_KEY.value()
      );
    });
  }
);

/* --------------------------------------------------
   GENERATE CHANGE ORDER PROPOSAL
-------------------------------------------------- */

exports.generateChangeOrderProposal = onRequest(
  { secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const generateChangeOrderProposalHandler = require("./routes/generateChangeOrderProposal");

      await generateChangeOrderProposalHandler(
        req,
        res,
        OPENAI_API_KEY.value()
      );
    });
  }
);

/* --------------------------------------------------
   GENERATE BID WORKSPACE OVERVIEW
-------------------------------------------------- */

exports.generateBidWorkspaceOverview = onRequest(
  { secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const generateBidWorkspaceOverviewHandler = require("./routes/generateBidWorkspaceOverview");

      await generateBidWorkspaceOverviewHandler(
        req,
        res,
        OPENAI_API_KEY.value()
      );
    });
  }
);

/* --------------------------------------------------
   FORMAT PLAN SCOPE SELECTIONS FOR BID
-------------------------------------------------- */

exports.formatPlanScopeSelectionsForBid = onRequest(
  { secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const formatPlanScopeSelectionsForBidHandler = require("./routes/formatPlanScopeSelectionsForBid");

      await formatPlanScopeSelectionsForBidHandler(
        req,
        res,
        OPENAI_API_KEY.value()
      );
    });
  }
);

/* --------------------------------------------------
   DOWNLOAD BID FORM PROPOSAL PDF
-------------------------------------------------- */

exports.downloadBidFormProposalPdf = onRequest(
  { secrets: [CONVERTAPI_SECRET] },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const downloadBidFormProposalPdfHandler = require("./routes/downloadBidFormProposalPdf");

      await downloadBidFormProposalPdfHandler(
        req,
        res,
        CONVERTAPI_SECRET.value()
      );
    });
  }
);

/* --------------------------------------------------
   ANALYZE PLAN FILES
-------------------------------------------------- */

exports.analyzePlanFiles = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 720,
    memory: "2GiB",
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const analyzePlanFilesHandler = require("./routes/analyzePlanFiles");

      await analyzePlanFilesHandler(req, res, OPENAI_API_KEY.value());
    });
  }
);

/* --------------------------------------------------
   GENERATE SCOPES
-------------------------------------------------- */

exports.generateScopes = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const generateScopesHandler = require("./routes/generateScopes");

      await generateScopesHandler(req, res, OPENAI_API_KEY.value());
    });
  }
);

/* --------------------------------------------------
   GENERATE VERIFICATION CHECKLIST
-------------------------------------------------- */

exports.generateVerificationChecklist = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const generateVerificationChecklistHandler = require("./routes/generateVerificationChecklist");

      await generateVerificationChecklistHandler(req, res, OPENAI_API_KEY.value());
    });
  }
);

/* --------------------------------------------------
   ANALYZE SAFETY
-------------------------------------------------- */

exports.analyzeSafety = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const analyzeSafetyHandler = require("./routes/analyzeSafety");

      await analyzeSafetyHandler(req, res, OPENAI_API_KEY.value());
    });
  }
);

/* --------------------------------------------------
   DETECT CONFLICTS
-------------------------------------------------- */

exports.detectConflicts = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const detectConflictsHandler = require("./routes/detectConflicts");

      await detectConflictsHandler(req, res, OPENAI_API_KEY.value());
    });
  }
);

/* --------------------------------------------------
   GENERATE RFIS
-------------------------------------------------- */

exports.generateRFIs = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const generateRFIsHandler = require("./routes/generateRFIs");

      await generateRFIsHandler(req, res, OPENAI_API_KEY.value());
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
