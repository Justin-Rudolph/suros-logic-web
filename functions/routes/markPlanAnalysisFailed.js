const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const {
  markPlanAnalysisFailed,
  verifyAuthenticatedUser,
} = require("./lib/planAnalyzerQuota");
const {
  buildPlanModuleSummaryData,
  getPlanModuleDocPath,
} = require("./lib/planAnalyzerContext");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const ALLOWED_MODULE_TYPES = new Set(["overview", "scopes", "verification", "safety", "conflicts", "rfi"]);

module.exports = async function markPlanAnalysisFailedHandler(req, res) {
  const projectId = String(req.body?.projectId || "").trim();
  const moduleType = String(req.body?.moduleType || "").trim();

  try {
    const decodedToken = await verifyAuthenticatedUser(req);

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    if (!ALLOWED_MODULE_TYPES.has(moduleType)) {
      return res.status(400).json({ error: "A valid moduleType is required." });
    }

    const projectRef = firestore.doc(`planProjects/${projectId}`);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) {
      return res.status(404).json({ error: "Plan analysis project was not found." });
    }

    const projectData = projectSnap.data() || {};
    if (projectData.userId !== decodedToken.uid) {
      return res.status(403).json({ error: "You do not have access to this plan analysis." });
    }

    if (
      projectData.quota?.reserved !== true ||
      projectData.quota?.completed === true
    ) {
      return res.json({ projectId, ignored: true });
    }

    const completedAt = FieldValue.serverTimestamp();
    const errorMessage =
      typeof req.body?.error === "string" && req.body.error.trim()
        ? req.body.error.trim()
        : "A processing step failed for this project.";

    await Promise.all([
      firestore.doc(getPlanModuleDocPath(projectId, moduleType)).set(
        {
          projectId,
          moduleType,
          status: "failed",
          completedAt,
          error: errorMessage,
        },
        { merge: true }
      ),
      projectRef.set(
        {
          status: "failed",
          modules: {
            [moduleType]: buildPlanModuleSummaryData(projectId, moduleType, "failed", {
              completedAt,
              error: errorMessage,
            }),
          },
        },
        { merge: true }
      ),
    ]);

    await markPlanAnalysisFailed(firestore, projectId);

    return res.json({ projectId });
  } catch (error) {
    console.error("Failed to mark plan analysis as failed:", error);

    return res.status(error.statusCode || 500).json({
      error: error instanceof Error ? error.message : "Failed to mark plan analysis as failed.",
    });
  }
};
