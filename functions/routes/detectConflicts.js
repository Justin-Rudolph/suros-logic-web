const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const { buildEstimatorSystemPrompt } = require("./lib/estimatorPrompt");
const {
  createJsonCompletion,
  createPlanContextChunks,
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

const ALLOWED_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const MAX_PLAN_CONTEXT_LENGTH = 80000;

const getConflictResponseFormat = () => ({
  type: "json_schema",
  json_schema: {
    name: "plan_conflict_findings",
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
              conflict: { type: "string" },
              involvedTrades: {
                type: "array",
                items: { type: "string" },
              },
              severity: {
                type: "string",
                enum: ["low", "medium", "high", "critical"],
              },
              sourceSheets: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["conflict", "involvedTrades", "severity", "sourceSheets"],
          },
        },
      },
      required: ["items"],
    },
  },
});

const sanitizeConflictItem = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const conflict = String(item.conflict || "").trim();
  const severity = String(item.severity || "").trim().toLowerCase();
  const involvedTrades = uniqueStrings(item.involvedTrades);
  const sourceSheets = uniqueStrings(item.sourceSheets);

  if (!conflict || !ALLOWED_SEVERITIES.has(severity)) {
    return null;
  }

  return {
    conflict,
    involvedTrades,
    severity,
    sourceSheets,
  };
};

const parseConflictPayload = (parsed) => {
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  if (!items.length) {
    return [];
  }

  return items.map(sanitizeConflictItem).filter(Boolean);
};

const generateConflictAnalysis = async (files, openAiApiKey) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const contextChunks = createPlanContextChunks(files, MAX_PLAN_CONTEXT_LENGTH);
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
        responseFormat: getConflictResponseFormat(),
        systemPrompt: buildEstimatorSystemPrompt(`
Compare the OCR-extracted plan text inside this chunk and detect meaningful coordination
conflicts that could affect pricing, construction, trade coordination, materials, or change-
order exposure.

Focus on:
- MEP vs framing conflicts
- dimension mismatches
- missing supports, blocking, backing, openings, penetrations, or access
- schedule vs plan conflicts
- finish schedule vs room tag conflicts
- door/window schedule vs opening notes conflicts
- structural vs architectural conflicts
- revision conflicts

Additional task rules:
- Only return meaningful conflicts supported by this chunk.
- Do not return generic warnings.
- Severity must be one of: "low", "medium", "high", "critical".
- sourceSheets should list relevant sheet numbers when available.
- If sheet numbers are unavailable, use an empty array.
- Do not invent sheet references.

Return exactly:
{
  "items": [
    {
      "conflict": "string",
      "involvedTrades": ["string"],
      "severity": "low" | "medium" | "high" | "critical",
      "sourceSheets": ["string"]
    }
  ]
}
      `),
        userContent: chunk.text,
      });
      chunkUsages[index] = usage;

      return {
        data: parseConflictPayload(parsed),
        usage,
      };
    },
    { label: "detectConflicts" }
  );

  const { parsed: aggregated, usage: aggregationUsage } = await createJsonCompletion({
    openai,
    model: "gpt-5",
    reasoningEffort: "medium",
    responseFormat: getConflictResponseFormat(),
    systemPrompt: buildEstimatorSystemPrompt(`
Combine chunk-level coordination conflicts from a full plan set into one final cross-sheet conflict list.

Additional task rules:
- Deduplicate materially similar conflicts across chunks.
- Preserve the best-supported sheet references.
- Severity must be one of: "low", "medium", "high", "critical".
- Do not invent sheet references or unsupported conflicts.
- Prefer the most actionable and specific wording.

Return exactly:
{
  "items": [
    {
      "conflict": "string",
      "involvedTrades": ["string"],
      "severity": "low" | "medium" | "high" | "critical",
      "sourceSheets": ["string"]
    }
  ]
}
    `),
    userContent: serializeChunkResults(contextChunks, chunkFindings, "CONFLICT CHUNK"),
  });

  logUsageTotals("detectConflicts", [
    { title: "chunks", usage: sumUsage(chunkUsages) },
    { title: "aggregation", usage: aggregationUsage },
    { title: "overall", usage: sumUsage([...chunkUsages, aggregationUsage]) },
  ]);

  return parseConflictPayload(aggregated);
};

module.exports = async function detectConflictsHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        conflictStatus: "processing",
        conflictRequestedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const files = await loadProjectPlanFiles(firestore, projectId);
    if (!files.length) {
      return res.status(404).json({
        error: "No analyzed plan files found for this project.",
      });
    }

    const conflicts = await generateConflictAnalysis(files, openAiApiKey);

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        conflicts,
        conflictStatus: "completed",
        conflictGeneratedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({
      projectId,
      conflicts,
    });
  } catch (error) {
    console.error("Conflict detection failed:", error);

    if (projectId) {
      await firestore.doc(`planProjects/${projectId}`).set(
        {
          conflictStatus: "failed",
          conflictGeneratedAt: FieldValue.serverTimestamp(),
          conflictError: error instanceof Error ? error.message : "Unknown error",
        },
        { merge: true }
      );
    }

    return res.status(500).json({
      error: "Failed to detect conflicts.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
