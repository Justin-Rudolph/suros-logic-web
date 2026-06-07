const admin = require("firebase-admin");
const { assertPlanAnalysisCanProcess } = require("./lib/planAnalyzerQuota");
const { enqueuePipelineStep } = require("./lib/planPipelineTasks");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const getOverviewStatus = (projectData) => projectData?.modules?.overview?.status;
const getModuleStatus = (projectData, moduleType) => projectData?.modules?.[moduleType]?.status;
const isOptionalEnabled = (analysisOptions, key) =>
  !analysisOptions || typeof analysisOptions !== "object" ? true : analysisOptions[key] === true;

const getNextPipelineStep = (projectData) => {
  if (!projectData?.uploadedFiles?.length) return null;

  const overviewStatus = getOverviewStatus(projectData);
  const isOptional = (key) => isOptionalEnabled(projectData.analysisOptions, key);

  if (overviewStatus === "failed") return null;
  if (getModuleStatus(projectData, "scopes") === "failed") return null;
  if (getModuleStatus(projectData, "verification") === "failed") return null;
  if (getModuleStatus(projectData, "safety") === "failed") return null;
  if (getModuleStatus(projectData, "conflicts") === "failed") return null;
  if (getModuleStatus(projectData, "rfi") === "failed") return null;

  if (overviewStatus !== "completed" && overviewStatus !== "completed_with_errors") {
    return overviewStatus === "processing" ? null : "analyze";
  }

  if (getModuleStatus(projectData, "scopes") !== "completed") {
    return getModuleStatus(projectData, "scopes") === "processing" ? null : "generateScopes";
  }

  if (isOptional("verification") && getModuleStatus(projectData, "verification") !== "completed" && getModuleStatus(projectData, "verification") !== "skipped") {
    return getModuleStatus(projectData, "verification") === "processing" ? null : "generateVerification";
  }

  if (isOptional("safety") && getModuleStatus(projectData, "safety") !== "completed" && getModuleStatus(projectData, "safety") !== "skipped") {
    return getModuleStatus(projectData, "safety") === "processing" ? null : "analyzeSafety";
  }

  if (isOptional("conflicts") && getModuleStatus(projectData, "conflicts") !== "completed" && getModuleStatus(projectData, "conflicts") !== "skipped") {
    return getModuleStatus(projectData, "conflicts") === "processing" ? null : "detectConflicts";
  }

  if (isOptional("rfi") && getModuleStatus(projectData, "rfi") !== "completed" && getModuleStatus(projectData, "rfi") !== "skipped") {
    return getModuleStatus(projectData, "rfi") === "processing" ? null : "generateRFIs";
  }

  return null;
};

const callHandler = async (handlerPath, projectId, projectData, openAiApiKey) => {
  const handler = require(handlerPath);
  const syntheticReq = { body: { projectId }, headers: {} };
  let resolved = false;

  await new Promise((resolve, reject) => {
    const syntheticRes = {
      status(code) {
        return {
          json(body) {
            resolved = true;
            if (code >= 500) {
              reject(new Error(`Step handler returned ${code}: ${body?.details || body?.error || "unknown error"}`));
            } else {
              resolve();
            }
          },
        };
      },
      json() {
        resolved = true;
        resolve();
      },
    };

    handler(syntheticReq, syntheticRes, openAiApiKey, { projectData })
      .then(() => {
        if (!resolved) resolve();
      })
      .catch(reject);
  });
};

module.exports = async function runPlanPipelineStepHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();

  if (!projectId) {
    return res.status(400).json({ error: "projectId is required." });
  }

  try {
    const projectSnap = await firestore.doc(`planProjects/${projectId}`).get();

    if (!projectSnap.exists) {
      console.error(`[pipeline] Project not found: ${projectId}`);
      return res.status(404).json({ error: "Project not found." });
    }

    const projectData = projectSnap.data() || {};

    try {
      assertPlanAnalysisCanProcess(projectData);
    } catch (stateError) {
      console.log(`[pipeline] Skipping project ${projectId}: ${stateError.message}`);
      return res.json({ ok: true, skipped: true });
    }

    const nextStep = getNextPipelineStep(projectData);

    if (!nextStep) {
      console.log(`[pipeline] No next step for project ${projectId} — pipeline complete or already running`);
      return res.json({ ok: true });
    }

    console.log(`[pipeline] Running step "${nextStep}" for project ${projectId}`);

    const handlerMap = {
      analyze: "./analyzePlanFiles",
      generateScopes: "./generateScopes",
      generateVerification: "./generateVerificationChecklist",
      analyzeSafety: "./analyzeSafety",
      detectConflicts: "./detectConflicts",
      generateRFIs: "./generateRFIs",
    };

    const handlerPath = handlerMap[nextStep];
    if (!handlerPath) {
      console.error(`[pipeline] Unknown step: ${nextStep}`);
      return res.status(400).json({ error: `Unknown step: ${nextStep}` });
    }

    await callHandler(handlerPath, projectId, projectData, openAiApiKey);

    const latestSnap = await firestore.doc(`planProjects/${projectId}`).get();
    const latestData = latestSnap.data() || {};

    if (latestData.status === "failed") {
      console.log(`[pipeline] Project ${projectId} failed after step "${nextStep}" — stopping`);
      return res.json({ ok: true });
    }

    const followingStep = getNextPipelineStep(latestData);

    if (followingStep) {
      console.log(`[pipeline] Enqueuing next step for project ${projectId}`);
      await enqueuePipelineStep(projectId);
    } else {
      console.log(`[pipeline] Pipeline complete for project ${projectId}`);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error(`[pipeline] Unhandled error for project ${projectId}:`, error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Pipeline step failed." });
  }
};
