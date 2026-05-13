const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const {
  markPlanAnalysisFailed,
} = require("./lib/planAnalyzerQuota");
const {
  buildPlanModuleSummaryData,
  getPlanModuleDocPath,
} = require("./lib/planAnalyzerContext");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const STALE_PLAN_ANALYSIS_HOURS = 2;
const STALE_PLAN_ANALYSIS_STATUSES = ["reserved_upload", "uploaded", "processing"];

const pickStaleModuleType = (projectData) => {
  const modules = projectData.modules || {};

  if (modules.rfi?.status === "processing" || modules.rfi?.status === "queued") return "rfi";
  if (modules.conflicts?.status === "processing" || modules.conflicts?.status === "queued") return "conflicts";
  if (modules.safety?.status === "processing" || modules.safety?.status === "queued") return "safety";
  if (modules.verification?.status === "processing" || modules.verification?.status === "queued") return "verification";
  if (modules.scopes?.status === "processing" || modules.scopes?.status === "queued") return "scopes";
  return "overview";
};

module.exports = async function cleanupStalePlanAnalysisReservationsHandler() {
  const staleBeforeMillis = Date.now() - STALE_PLAN_ANALYSIS_HOURS * 60 * 60 * 1000;
  const snapshot = await firestore
    .collection("planProjects")
    .where("quota.reserved", "==", true)
    .limit(100)
    .get();

  if (snapshot.empty) {
    console.log("No stale plan analysis reservations found.");
    return { cleaned: 0 };
  }

  let cleaned = 0;

  for (const projectSnap of snapshot.docs) {
    const projectId = projectSnap.id;
    const projectData = projectSnap.data() || {};
    const updatedAtMillis =
      projectData.updatedAt?.toMillis?.() ||
      (typeof projectData.updatedAt?.seconds === "number"
        ? projectData.updatedAt.seconds * 1000
        : 0);

    if (!STALE_PLAN_ANALYSIS_STATUSES.includes(projectData.status) || updatedAtMillis > staleBeforeMillis) {
      continue;
    }

    const moduleType = pickStaleModuleType(projectData);
    const completedAt = FieldValue.serverTimestamp();
    const errorMessage = "This analysis timed out before completing.";

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
      firestore.doc(`planProjects/${projectId}`).set(
        {
          status: "failed",
          updatedAt: completedAt,
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
    cleaned += 1;
  }

  console.log(`Cleaned ${cleaned} stale plan analysis reservation(s).`);
  return { cleaned };
};
