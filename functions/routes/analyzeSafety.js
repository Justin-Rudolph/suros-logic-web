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
} = require("./lib/planAnalyzerContext");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const ALLOWED_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const MAX_PLAN_CONTEXT_LENGTH = 75000;

const getSafetyResponseFormat = () => ({
  type: "json_schema",
  json_schema: {
    name: "plan_safety_findings",
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
              issue: { type: "string" },
              severity: {
                type: "string",
                enum: ["low", "medium", "high", "critical"],
              },
              requiresReview: { type: "boolean" },
            },
            required: ["issue", "severity", "requiresReview"],
          },
        },
      },
      required: ["items"],
    },
  },
});

const sanitizeSafetyItem = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const issue = String(item.issue || "").trim();
  const severity = String(item.severity || "").trim().toLowerCase();

  if (!issue || !ALLOWED_SEVERITIES.has(severity)) {
    return null;
  }

  return {
    issue,
    severity,
    requiresReview: true,
  };
};

const parseSafetyPayload = (parsed) => {
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  if (!items.length) {
    return [];
  }

  return items.map(sanitizeSafetyItem).filter(Boolean);
};

const generateSafetyAnalysis = async (files, openAiApiKey) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const contextChunks = createPlanContextChunks(files, MAX_PLAN_CONTEXT_LENGTH, {
    includeRevisionDate: false,
  });
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
        responseFormat: getSafetyResponseFormat(),
        systemPrompt: buildEstimatorSystemPrompt(`
Analyze one chunk of OCR-extracted plan text for safety and code-risk items that should be reviewed before
construction, pricing, permitting, or bid submission.

Focus only on:
- exits and egress paths
- ADA accessibility issues
- stairs, guards, handrails, ramps, and landings
- clearance issues
- life-safety notes
- occupancy or path-of-travel concerns
- door swing or opening width concerns

Additional task rules:
- Do not make final code compliance conclusions.
- If something appears unclear, constrained, missing, or potentially noncompliant, include it as requiring review.
- If uncertain, it still requires review.
- Every returned item must have requiresReview set to true.
- Severity must be one of: "low", "medium", "high", "critical".
- Do not include generic safety boilerplate.
- Do not cite code sections unless explicitly present in the extracted plan text.

Return exactly:
{
  "items": [
    {
      "issue": "string",
      "severity": "low" | "medium" | "high" | "critical",
      "requiresReview": true
    }
  ]
}
      `),
        userContent: chunk.text,
      });
      chunkUsages[index] = usage;

      return {
        data: parseSafetyPayload(parsed),
        usage,
      };
    },
    { label: "analyzeSafety" }
  );

  const { parsed: aggregated, usage: aggregationUsage } = await createJsonCompletion({
    openai,
    model: "gpt-5",
    reasoningEffort: "medium",
    responseFormat: getSafetyResponseFormat(),
    systemPrompt: buildEstimatorSystemPrompt(`
Combine chunk-level safety findings from a full plan set into one final review list.

Additional task rules:
- Deduplicate materially similar issues across chunks.
- Keep the most specific wording supported by the chunk findings.
- Every returned item must have requiresReview set to true.
- Severity must be one of: "low", "medium", "high", "critical".
- Do not add generic boilerplate or unsupported issues.

Return exactly:
{
  "items": [
    {
      "issue": "string",
      "severity": "low" | "medium" | "high" | "critical",
      "requiresReview": true
    }
  ]
}
    `),
    userContent: serializeChunkResults(contextChunks, chunkFindings, "SAFETY CHUNK"),
  });

  logUsageTotals("analyzeSafety", [
    { title: "chunks", usage: sumUsage(chunkUsages) },
    { title: "aggregation", usage: aggregationUsage },
    { title: "overall", usage: sumUsage([...chunkUsages, aggregationUsage]) },
  ]);

  return parseSafetyPayload(aggregated);
};

module.exports = async function analyzeSafetyHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    const moduleRef = firestore.doc(getPlanModuleDocPath(projectId, "safety"));
    const startedAt = FieldValue.serverTimestamp();

    await Promise.all([
      firestore.doc(`planProjects/${projectId}`).set(
        {
          status: "processing",
          modules: {
            safety: buildPlanModuleSummaryData(projectId, "safety", "processing", {
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
          moduleType: "safety",
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

    const safety = await generateSafetyAnalysis(files, openAiApiKey);

    const completedAt = FieldValue.serverTimestamp();

    const projectSnap = await firestore.doc(`planProjects/${projectId}`).get();
    const nextProjectStatus = getProjectStatusAfterModuleUpdate(
      projectSnap.data() || {},
      "safety",
      "completed"
    );

    await Promise.all([
      moduleRef.set(
        {
          projectId,
          moduleType: "safety",
          status: "completed",
          error: null,
          completedAt,
          result: safety,
        },
        { merge: true }
      ),
      firestore.doc(`planProjects/${projectId}`).set(
        {
          status: nextProjectStatus,
          modules: {
            safety: buildPlanModuleSummaryData(projectId, "safety", "completed", {
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
      safety,
    });
  } catch (error) {
    console.error("Safety analysis failed:", error);

    if (projectId) {
      const completedAt = FieldValue.serverTimestamp();
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await Promise.all([
        firestore.doc(getPlanModuleDocPath(projectId, "safety")).set(
          {
            projectId,
            moduleType: "safety",
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
              safety: buildPlanModuleSummaryData(projectId, "safety", "failed", {
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
      error: "Failed to analyze safety.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
