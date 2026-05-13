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

const MODULE_TYPES = ["overview", "scopes", "verification", "safety", "conflicts", "rfi"];
const OPTIONAL_MODULE_TYPES = ["verification", "safety", "conflicts", "rfi"];

const normalizeAnalysisOptions = (analysisOptions) => ({
  verification: analysisOptions?.verification === true,
  safety: analysisOptions?.safety === true,
  conflicts: analysisOptions?.conflicts === true,
  rfi: analysisOptions?.rfi === true,
});

const validateUploadedFileForProject = async ({ uploadedFile, uid, projectId }) => {
  if (!uploadedFile?.downloadURL || !uploadedFile?.storagePath || !uploadedFile?.name) {
    const error = new Error("uploadedFile is required.");
    error.statusCode = 400;
    throw error;
  }

  const expectedPrefix = `planUploads/${uid}/${projectId}/`;
  if (
    typeof uploadedFile.storagePath !== "string" ||
    !uploadedFile.storagePath.startsWith(expectedPrefix)
  ) {
    const error = new Error("Uploaded file path is invalid for this plan analysis.");
    error.statusCode = 400;
    throw error;
  }

  try {
    const [exists] = await admin.storage().bucket().file(uploadedFile.storagePath).exists();
    if (!exists) {
      const error = new Error("Uploaded file was not found in storage.");
      error.statusCode = 400;
      throw error;
    }
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    const storageError = new Error("Unable to verify uploaded file.");
    storageError.statusCode = 500;
    throw storageError;
  }
};

module.exports = async function finalizePlanAnalysisUploadHandler(req, res) {
  const projectId = String(req.body?.projectId || "").trim();
  let canReleaseReservation = false;

  try {
    const decodedToken = await verifyAuthenticatedUser(req);
    const uploadedFile = req.body?.uploadedFile;

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

    if (projectData.quota?.failed === true || projectData.quota?.completed === true) {
      return res.status(409).json({ error: "This plan analysis can no longer be updated." });
    }

    if (projectData.status !== "reserved_upload") {
      return res.status(409).json({ error: "This plan analysis upload has already been finalized." });
    }

    canReleaseReservation = true;
    await validateUploadedFileForProject({
      uploadedFile,
      uid: decodedToken.uid,
      projectId,
    });

    const analysisOptions = normalizeAnalysisOptions(req.body?.analysisOptions || {});
    const title = String(req.body?.title || "").trim();
    const modules = {
      overview: buildPlanModuleSummaryData(projectId, "overview", "queued"),
      scopes: buildPlanModuleSummaryData(projectId, "scopes", "queued"),
      verification: buildPlanModuleSummaryData(
        projectId,
        "verification",
        analysisOptions.verification ? "queued" : "skipped"
      ),
      safety: buildPlanModuleSummaryData(
        projectId,
        "safety",
        analysisOptions.safety ? "queued" : "skipped"
      ),
      conflicts: buildPlanModuleSummaryData(
        projectId,
        "conflicts",
        analysisOptions.conflicts ? "queued" : "skipped"
      ),
      rfi: buildPlanModuleSummaryData(
        projectId,
        "rfi",
        analysisOptions.rfi ? "queued" : "skipped"
      ),
    };

    const batch = firestore.batch();

    batch.set(
      projectRef,
      {
        userId: decodedToken.uid,
        projectId,
        title,
        updatedAt: FieldValue.serverTimestamp(),
        fileCount: 1,
        status: "uploaded",
        uploadedFiles: [uploadedFile],
        analysisOptions,
        modules,
      },
      { merge: true }
    );

    MODULE_TYPES.forEach((moduleType) => {
      const status =
        OPTIONAL_MODULE_TYPES.includes(moduleType) && !analysisOptions[moduleType]
          ? "skipped"
          : "queued";
      const moduleData = {
        projectId,
        moduleType,
        status,
      };

      if (moduleType !== "overview") {
        moduleData.favoriteItemIds = [];
      }

      batch.set(firestore.doc(getPlanModuleDocPath(projectId, moduleType)), moduleData, {
        merge: true,
      });
    });

    await batch.commit();

    return res.json({ projectId });
  } catch (error) {
    console.error("Failed to finalize plan analysis upload:", error);

    if (projectId && canReleaseReservation) {
      await markPlanAnalysisFailed(firestore, projectId).catch((quotaError) => {
        console.error("Failed to release plan analysis quota after upload finalization error:", quotaError);
      });
    }

    return res.status(error.statusCode || 500).json({
      error: error instanceof Error ? error.message : "Failed to finalize plan analysis upload.",
    });
  }
};
