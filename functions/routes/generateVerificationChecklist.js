const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const { buildEstimatorSystemPrompt } = require("./lib/estimatorPrompt");
const {
  buildScopeContext,
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
} = require("./lib/planAnalyzerContext");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const ALLOWED_CATEGORIES = new Set([
  "dimensions",
  "structure",
  "MEP_conflict",
  "access",
  "existing_conditions",
]);

const MAX_PLAN_CONTEXT_LENGTH = 70000;
const MAX_SCOPE_CONTEXT_LENGTH = 40000;

const getChecklistResponseFormat = () => ({
  type: "json_schema",
  json_schema: {
    name: "plan_verification_checklist",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              item: { type: "string" },
              reason: { type: "string" },
              category: {
                type: "string",
                enum: ["dimensions", "structure", "MEP_conflict", "access", "existing_conditions"],
              },
            },
            required: ["item", "reason", "category"],
          },
        },
      },
      required: ["items"],
    },
  },
});

const sanitizeChecklistItem = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const checklistItem = String(item.item || "").trim();
  const reason = String(item.reason || "").trim();
  const category = String(item.category || "").trim();

  if (!checklistItem || !reason || !ALLOWED_CATEGORIES.has(category)) {
    return null;
  }

  return {
    item: checklistItem,
    reason,
    category,
  };
};

const parseChecklistPayload = (parsed) => {
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  if (!items.length) {
    return [];
  }

  return items.map(sanitizeChecklistItem).filter(Boolean);
};

const generateChecklist = async (files, scopes, openAiApiKey) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const contextChunks = createPlanContextChunks(files, MAX_PLAN_CONTEXT_LENGTH, {
    includeRevisionDate: false,
  });
  const scopeContext = buildScopeContext(scopes, MAX_SCOPE_CONTEXT_LENGTH);

  if (!contextChunks.length) {
    throw new Error("No extracted plan text is available for this project");
  }

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const chunkUsages = [];
  const chunkFindings = await mapWithConcurrency(
    contextChunks,
    async (chunk, index) => {
      const { parsed, usage } = await createJsonCompletion({
        openai,
        model: "gpt-5",
        reasoningEffort: "medium",
        responseFormat: getChecklistResponseFormat(),
        systemPrompt: buildEstimatorSystemPrompt(`
Review one chunk of OCR-extracted plan text and the generated project scopes. Identify what
should be field-verified before pricing, ordering material, or committing to scope.

Additional task rules:
- Return only issues that genuinely require site verification or coordination confirmation.
- Be specific and practical.
- Do not repeat obvious plan notes unless they create field risk.
- Include dimensions, existing conditions, access, structural tie-ins, rough-in locations, substrate conditions when relevant.
- Prefer concise, actionable checklist items.
- Do not include generic construction reminders.

Allowed categories:
- "dimensions"
- "structure"
- "MEP_conflict"
- "access"
- "existing_conditions"

Return exactly:
{
  "items": [
    {
      "item": "string",
      "reason": "string",
      "category": "dimensions" | "structure" | "MEP_conflict" | "access" | "existing_conditions"
    }
  ]
}
      `),
      userContent: `
PLAN TEXT CHUNK:
${chunk.text}

SCOPES:
${scopeContext || "No generated scopes available."}
      `.trim(),
      });
      chunkUsages[index] = usage;

      return {
        data: parseChecklistPayload(parsed),
        usage,
      };
    },
    { label: "generateVerificationChecklist" }
  );

  const { parsed: aggregated, usage: aggregationUsage } = await createJsonCompletion({
    openai,
    model: "gpt-5",
    reasoningEffort: "medium",
    responseFormat: getChecklistResponseFormat(),
    systemPrompt: buildEstimatorSystemPrompt(`
Combine chunk-level verification findings into one final field verification checklist.

Additional task rules:
- Deduplicate materially similar checklist items across chunks.
- Keep the most specific and practical wording.
- Return only issues that genuinely require site verification or coordination confirmation.
- Do not invent issues unsupported by the chunk findings.

Allowed categories:
- "dimensions"
- "structure"
- "MEP_conflict"
- "access"
- "existing_conditions"

Return exactly:
{
  "items": [
    {
      "item": "string",
      "reason": "string",
      "category": "dimensions" | "structure" | "MEP_conflict" | "access" | "existing_conditions"
    }
  ]
}
    `),
    userContent: `
SCOPES:
${scopeContext || "No generated scopes available."}

CHUNK FINDINGS:
${serializeChunkResults(contextChunks, chunkFindings, "VERIFICATION CHUNK")}
    `.trim(),
  });

  logUsageTotals("generateVerificationChecklist", [
    { title: "chunks", usage: sumUsage(chunkUsages) },
    { title: "aggregation", usage: aggregationUsage },
    { title: "overall", usage: sumUsage([...chunkUsages, aggregationUsage]) },
  ]);

  return parseChecklistPayload(aggregated);
};

module.exports = async function generateVerificationChecklistHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    const moduleRef = firestore.doc(getPlanModuleDocPath(projectId, "verification"));
    const startedAt = FieldValue.serverTimestamp();

    await Promise.all([
      firestore.doc(`planProjects/${projectId}`).set(
        {
          status: "processing",
          modules: {
            verification: buildPlanModuleSummaryData(projectId, "verification", "processing", {
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
          moduleType: "verification",
          status: "processing",
          error: null,
          startedAt,
        },
        { merge: true }
      ),
    ]);

    const [projectSnap, scopesSnap, files] = await Promise.all([
      firestore.doc(`planProjects/${projectId}`).get(),
      firestore.doc(getPlanModuleDocPath(projectId, "scopes")).get(),
      loadProjectPlanFiles(firestore, projectId),
    ]);

    if (!projectSnap.exists) {
      const projectNotFoundError = new Error("Project not found.");
      projectNotFoundError.statusCode = 404;
      throw projectNotFoundError;
    }

    if (!files.length) {
      const missingFilesError = new Error("No analyzed plan files found for this project.");
      missingFilesError.statusCode = 404;
      throw missingFilesError;
    }

    const scopesData = scopesSnap.data() || {};
    const verification = await generateChecklist(files, scopesData.result || {}, openAiApiKey);

    const completedAt = FieldValue.serverTimestamp();

    const nextProjectStatus = getProjectStatusAfterModuleUpdate(
      projectSnap.data() || {},
      "verification",
      "completed"
    );

    await Promise.all([
      moduleRef.set(
        {
          projectId,
          moduleType: "verification",
          status: "completed",
          error: null,
          completedAt,
          result: verification,
        },
        { merge: true }
      ),
      firestore.doc(`planProjects/${projectId}`).set(
        {
          status: nextProjectStatus,
          modules: {
            verification: buildPlanModuleSummaryData(projectId, "verification", "completed", {
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
      verification,
    });
  } catch (error) {
    console.error("Verification checklist generation failed:", error);

    if (projectId) {
      const completedAt = FieldValue.serverTimestamp();
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await Promise.all([
        firestore.doc(getPlanModuleDocPath(projectId, "verification")).set(
          {
            projectId,
            moduleType: "verification",
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
              verification: buildPlanModuleSummaryData(projectId, "verification", "failed", {
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
      error: "Failed to generate verification checklist.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
