const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const cors = require("cors");
const { defineSecret } = require("firebase-functions/params");

setGlobalOptions({ maxInstances: 10 });

/* --------------------------------------------------
   SECRETS (DEFINE HERE ONLY)
-------------------------------------------------- */

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const API2PDF_API_KEY = defineSecret("API2PDF_API_KEY");

const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");
const STRIPE_WEBHOOK_SECRET_LIVE = defineSecret("STRIPE_WEBHOOK_SECRET_LIVE");
const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

/* --------------------------------------------------
   GENERATE ESTIMATE
-------------------------------------------------- */

exports.generateEstimate = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 300,
  },
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
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 300,
  },
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
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 240,
  },
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
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 180,
  },
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
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 240,
  },
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
  {
    secrets: [API2PDF_API_KEY],
    timeoutSeconds: 180,
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const downloadBidFormProposalPdfHandler = require("./routes/downloadBidFormProposalPdf");

      await downloadBidFormProposalPdfHandler(
        req,
        res,
        API2PDF_API_KEY.value()
      );
    });
  }
);

/* --------------------------------------------------
   ANALYZE PLAN FILES
-------------------------------------------------- */

exports.reservePlanAnalysis = onRequest(
  {
    timeoutSeconds: 60,
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const reservePlanAnalysisHandler = require("./routes/reservePlanAnalysis");

      await reservePlanAnalysisHandler(req, res);
    });
  }
);

exports.finalizePlanAnalysisUpload = onRequest(
  {
    timeoutSeconds: 60,
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const finalizePlanAnalysisUploadHandler = require("./routes/finalizePlanAnalysisUpload");

      await finalizePlanAnalysisUploadHandler(req, res);
    });
  }
);

exports.cancelPlanAnalysisReservation = onRequest(
  {
    timeoutSeconds: 60,
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const cancelPlanAnalysisReservationHandler = require("./routes/cancelPlanAnalysisReservation");

      await cancelPlanAnalysisReservationHandler(req, res);
    });
  }
);

exports.markPlanAnalysisFailed = onRequest(
  {
    timeoutSeconds: 60,
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const markPlanAnalysisFailedHandler = require("./routes/markPlanAnalysisFailed");

      await markPlanAnalysisFailedHandler(req, res);
    });
  }
);

exports.deletePlanAnalysisProject = onRequest(
  {
    timeoutSeconds: 120,
  },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const deletePlanAnalysisProjectHandler = require("./routes/deletePlanAnalysisProject");

      await deletePlanAnalysisProjectHandler(req, res);
    });
  }
);

// Stale reservation cleanup is intentionally disabled for now.
// Re-enable this scheduled export if automated cleanup is needed later.
// const { onSchedule } = require("firebase-functions/v2/scheduler");
// exports.cleanupStalePlanAnalysisReservations = onSchedule(
//   {
//     schedule: "every 60 minutes",
//     timeZone: "America/New_York",
//     timeoutSeconds: 300,
//   },
//   async () => {
//     const cleanupStalePlanAnalysisReservationsHandler = require("./routes/cleanupStalePlanAnalysisReservations");
//
//     await cleanupStalePlanAnalysisReservationsHandler();
//   }
// );

exports.analyzePlanFiles = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 600,
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
    timeoutSeconds: 1200,
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
    timeoutSeconds: 720,
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
    timeoutSeconds: 720,
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
    timeoutSeconds: 720,
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
    timeoutSeconds: 1080,
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
    timeoutSeconds: 180,
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
    timeoutSeconds: 90,
  },
  (req, res) => {
    const authRoute = require("./routes/auth");
    return authRoute.app(req, res);
  }
);
