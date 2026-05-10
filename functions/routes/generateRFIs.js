const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const { buildEstimatorSystemPrompt } = require("./lib/estimatorPrompt");
const {
  buildPlanModuleSummaryData,
  createJsonCompletion,
  createPlanContextChunks,
  getPlanModuleDocPath,
  getProjectStatusAfterModuleUpdate,
  loadProjectPlanFiles,
  logUsageTotals,
  mapWithConcurrency,
  serializeChunkResults,
  sumUsage,
  uniqueStrings,
} = require("./lib/planAnalyzerContext");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const MAX_PLAN_CONTEXT_LENGTH = 80000;

const getRfiResponseFormat = () => ({
  type: "json_schema",
  json_schema: {
    name: "plan_rfi_package",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        rfis: {
          type: "array",
          items: { type: "string" },
        },
        assumptions: {
          type: "array",
          items: { type: "string" },
        },
        estimatorQuestions: {
          type: "array",
          items: { type: "string" },
        },
        contingencyNotes: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["rfis", "assumptions", "estimatorQuestions", "contingencyNotes"],
    },
  },
});

const parseRfiPayload = (parsed) => ({
  rfis: uniqueStrings(parsed?.rfis),
  assumptions: uniqueStrings(parsed?.assumptions),
  estimatorQuestions: uniqueStrings(parsed?.estimatorQuestions),
  contingencyNotes: uniqueStrings(parsed?.contingencyNotes),
});

const generateRfiPackage = async (files, openAiApiKey) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const contextChunks = createPlanContextChunks(files, MAX_PLAN_CONTEXT_LENGTH);
  if (!contextChunks.length) {
    throw new Error("No extracted plan text is available for this project");
  }

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const chunkUsages = [];
  const chunkPackages = await mapWithConcurrency(
    contextChunks,
    async (chunk, index) => {
      const { parsed, usage } = await createJsonCompletion({
        openai,
        model: "gpt-5",
        reasoningEffort: "medium",
        responseFormat: getRfiResponseFormat(),
        systemPrompt: buildEstimatorSystemPrompt(`
Review one chunk of OCR-extracted plan text before bid submission and identify missing information, unclear
assemblies, incomplete details, and coordination risks that should affect bid qualifications.

Additional task rules:
- Each array must contain plain strings only.
- RFIs should be written like concise preconstruction or bid RFIs.
- assumptions should be reasonable estimator assumptions caused by incomplete plans.
- estimatorQuestions should be internal questions the estimator should resolve before final pricing.
- contingencyNotes should capture pricing or scope-risk qualifiers tied to missing, unclear, or unsupported information.
- Focus on genuine plan gaps, not generic boilerplate.
- Do not include assumptions that contradict the plans.
- Do not create RFIs for items already clearly answered in the extracted text.

Return exactly this JSON shape:
{
  "rfis": [],
  "assumptions": [],
  "estimatorQuestions": [],
  "contingencyNotes": []
}
      `),
        userContent: chunk.text,
      });
      chunkUsages[index] = usage;

      return {
        data: parseRfiPayload(parsed),
        usage,
      };
    },
    { label: "generateRFIs" }
  );

  const { parsed: aggregated, usage: aggregationUsage } = await createJsonCompletion({
    openai,
    model: "gpt-5",
    reasoningEffort: "medium",
    responseFormat: getRfiResponseFormat(),
    systemPrompt: buildEstimatorSystemPrompt(`
Combine chunk-level bid-risk findings from a full plan set into one final RFI package.

Additional task rules:
- Each array must contain plain strings only.
- Deduplicate materially similar items across chunks.
- Preserve the most specific, best-supported wording.
- Do not add generic boilerplate or unsupported items.

Return exactly this JSON shape:
{
  "rfis": [],
  "assumptions": [],
  "estimatorQuestions": [],
  "contingencyNotes": []
}
    `),
    userContent: serializeChunkResults(contextChunks, chunkPackages, "RFI CHUNK"),
  });

  logUsageTotals("generateRFIs", [
    { title: "chunks", usage: sumUsage(chunkUsages) },
    { title: "aggregation", usage: aggregationUsage },
    { title: "overall", usage: sumUsage([...chunkUsages, aggregationUsage]) },
  ]);

  return parseRfiPayload(aggregated);
};

module.exports = async function generateRFIsHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    const moduleRef = firestore.doc(getPlanModuleDocPath(projectId, "rfi"));
    const startedAt = FieldValue.serverTimestamp();

    await Promise.all([
      firestore.doc(`planProjects/${projectId}`).set(
        {
          status: "processing",
          modules: {
            rfi: buildPlanModuleSummaryData(projectId, "rfi", "processing", {
              startedAt,
              error: null,
            }),
          },
        },
        { merge: true }
      ),
      moduleRef.set(
        {
          projectId,
          moduleType: "rfi",
          status: "processing",
          error: null,
          startedAt,
        },
        { merge: true }
      ),
    ]);

    const files = await loadProjectPlanFiles(firestore, projectId);
    if (!files.length) {
      const missingFilesError = new Error("No analyzed plan files found for this project.");
      missingFilesError.statusCode = 404;
      throw missingFilesError;
    }

    const rfiPackage = await generateRfiPackage(files, openAiApiKey);

    const completedAt = FieldValue.serverTimestamp();

    const projectSnap = await firestore.doc(`planProjects/${projectId}`).get();
    const nextProjectStatus = getProjectStatusAfterModuleUpdate(
      projectSnap.data() || {},
      "rfi",
      "completed"
    );

    await Promise.all([
      moduleRef.set(
        {
          projectId,
          moduleType: "rfi",
          status: "completed",
          error: null,
          completedAt,
          result: rfiPackage,
        },
        { merge: true }
      ),
      firestore.doc(`planProjects/${projectId}`).set(
        {
          status: nextProjectStatus,
          modules: {
            rfi: buildPlanModuleSummaryData(projectId, "rfi", "completed", {
              completedAt,
              error: null,
            }),
          },
        },
        { merge: true }
      ),
    ]);

    return res.json({
      projectId,
      ...rfiPackage,
    });
  } catch (error) {
    console.error("RFI generation failed:", error);

    if (projectId) {
      const completedAt = FieldValue.serverTimestamp();
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await Promise.all([
        firestore.doc(getPlanModuleDocPath(projectId, "rfi")).set(
          {
            projectId,
            moduleType: "rfi",
            status: "failed",
            completedAt,
            error: errorMessage,
          },
          { merge: true }
        ),
        firestore.doc(`planProjects/${projectId}`).set(
          {
            status: "failed",
            modules: {
              rfi: buildPlanModuleSummaryData(projectId, "rfi", "failed", {
                completedAt,
                error: errorMessage,
              }),
            },
          },
          { merge: true }
        ),
      ]);
    }

    return res.status(error.statusCode || 500).json({
      error: "Failed to generate RFIs.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
