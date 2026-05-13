const admin = require("firebase-admin");
const {
  markPlanAnalysisFailed,
  verifyAuthenticatedUser,
} = require("./lib/planAnalyzerQuota");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();
const storage = admin.storage();

const deleteStorageObjectIfPresent = async (storagePath) => {
  if (!storagePath) return;

  try {
    await storage.bucket().file(storagePath).delete();
  } catch (error) {
    if (error?.code === 404) {
      return;
    }

    throw error;
  }
};

const deleteCollectionDocs = async (collectionRef) => {
  const snapshot = await collectionRef.limit(450).get();
  if (snapshot.empty) return;

  const batch = firestore.batch();
  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });
  await batch.commit();

  if (snapshot.size === 450) {
    await deleteCollectionDocs(collectionRef);
  }
};

module.exports = async function deletePlanAnalysisProjectHandler(req, res) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    const decodedToken = await verifyAuthenticatedUser(req);

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
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
      projectData.quota?.reserved === true &&
      projectData.quota?.completed !== true
    ) {
      await markPlanAnalysisFailed(firestore, projectId);
    }

    await Promise.all(
      (projectData.uploadedFiles || []).map((file) =>
        deleteStorageObjectIfPresent(file.storagePath)
      )
    );

    await Promise.all([
      deleteCollectionDocs(projectRef.collection("files")),
      deleteCollectionDocs(projectRef.collection("modules")),
    ]);

    await projectRef.delete();

    return res.json({ projectId });
  } catch (error) {
    console.error("Failed to delete plan analysis project:", error);

    return res.status(error.statusCode || 500).json({
      error: error instanceof Error ? error.message : "Failed to delete plan analysis project.",
    });
  }
};
