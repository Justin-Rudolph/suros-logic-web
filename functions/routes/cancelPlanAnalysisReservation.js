const admin = require("firebase-admin");
const {
  markPlanAnalysisFailed,
  verifyAuthenticatedUser,
} = require("./lib/planAnalyzerQuota");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

module.exports = async function cancelPlanAnalysisReservationHandler(req, res) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    const decodedToken = await verifyAuthenticatedUser(req);

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    const projectRef = firestore.doc(`planProjects/${projectId}`);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) {
      return res.status(404).json({ error: "Plan analysis reservation was not found." });
    }

    const projectData = projectSnap.data() || {};
    if (projectData.userId !== decodedToken.uid) {
      return res.status(403).json({ error: "You do not have access to this plan analysis." });
    }

    if (projectData.status !== "reserved_upload") {
      return res.status(409).json({ error: "Only pending upload reservations can be cancelled." });
    }

    await markPlanAnalysisFailed(firestore, projectId);
    await projectRef.delete();

    return res.json({ projectId });
  } catch (error) {
    console.error("Failed to cancel plan analysis reservation:", error);

    return res.status(error.statusCode || 500).json({
      error: error instanceof Error ? error.message : "Failed to cancel plan analysis reservation.",
    });
  }
};
