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

const TRADE_KEYS = [
  "demo",
  "structural",
  "framing",
  "exterior_envelope",
  "doors_windows",
  "roofing",
  "concrete_masonry",
  "drywall_insulation",
  "flooring_tile",
  "paint_finishes",
  "millwork_cabinets",
  "plumbing",
  "electrical",
  "HVAC",
];

const ALLOWED_CLASSIFICATIONS = new Set(["confirmed", "inferred", "unknown"]);
const MAX_PROJECT_CONTEXT_LENGTH = 75000;

const sanitizeScopeItem = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const title = String(item.title || "").trim();
  const description = String(item.description || "").trim();
  const classification = String(item.classification || "").trim();
  const materialCategories = uniqueStrings(item.materialCategories);

  if (!title || !description || !ALLOWED_CLASSIFICATIONS.has(classification)) {
    return null;
  }

  return {
    title,
    description,
    materialCategories,
    classification,
  };
};

const getTradeScopeTemplate = () =>
  TRADE_KEYS.reduce((acc, trade) => {
    acc[trade] = [];
    return acc;
  }, {});

const getScopeResponseFormat = () => {
  const scopeItemSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: {
        type: "string",
      },
      description: {
        type: "string",
      },
      materialCategories: {
        type: "array",
        items: {
          type: "string",
        },
      },
      classification: {
        type: "string",
        enum: ["confirmed", "inferred", "unknown"],
      },
    },
    required: ["title", "description", "materialCategories", "classification"],
  };

  const properties = TRADE_KEYS.reduce((acc, trade) => {
    acc[trade] = {
      type: "array",
      items: scopeItemSchema,
    };
    return acc;
  }, {});

  return {
    type: "json_schema",
    json_schema: {
      name: "plan_trade_scopes",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties,
        required: TRADE_KEYS,
      },
    },
  };
};

const parseScopePayload = (parsed) => {
  const scopes = getTradeScopeTemplate();

  TRADE_KEYS.forEach((trade) => {
    const items = Array.isArray(parsed?.[trade]) ? parsed[trade] : [];
    scopes[trade] = items.map(sanitizeScopeItem).filter(Boolean);
  });

  return scopes;
};

const generateTradeScopesFromPlans = async (files, openAiApiKey) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const contextChunks = createPlanContextChunks(files, MAX_PROJECT_CONTEXT_LENGTH);
  if (!contextChunks.length) {
    throw new Error("No extracted plan text is available for this project");
  }

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const chunkUsages = [];
  const chunkScopes = await mapWithConcurrency(
    contextChunks,
    async (chunk, index) => {
      const { parsed, usage } = await createJsonCompletion({
        openai,
        model: "gpt-5",
        reasoningEffort: "medium",
        responseFormat: getScopeResponseFormat(),
        systemPrompt: buildEstimatorSystemPrompt(`
Review one chunk of the OCR-extracted construction plan text and generate trade scopes 
written the way a contractor would prepare bid scope notes.

Additional task rules:
- Use these exact top-level trade keys only:
  "demo"
  "structural"
  "framing"
  "exterior_envelope"
  "doors_windows"
  "roofing"
  "concrete_masonry"
  "drywall_insulation"
  "flooring_tile"
  "paint_finishes"
  "millwork_cabinets"
  "plumbing"
  "electrical"
  "HVAC"
- Each trade value must be an array.
- If a trade has no meaningful supported scope in this chunk, return an empty array for that trade.
- Keep scope descriptions concise, contractor-style, and bid-ready.
- Do not include pricing, labor hours, markup, schedule duration, or unsupported means and methods.
- Do not duplicate the same work under multiple trades.
- Assign each scope item to the most responsible primary trade.
- If an item is not explicitly named as a trade scope but is supported by the plans, infer the closest responsible trade and place it there.
- Do not leave supported work unassigned just because it is indirect, note-based, or coordination-driven.
- Include materials only as broad material categories, not exact quantities.
- Use classification carefully:
  confirmed = directly supported by extracted text.
  inferred = reasonable scope implication, but not directly stated.
  unknown = scope appears possible but is not sufficiently supported.
- Each item must be:
  {
    "title": "short scope title",
    "description": "contractor-style scope description",
    "materialCategories": ["string"],
    "classification": "confirmed" | "inferred" | "unknown"
  }

Return exactly this shape:
{
  "demo": [],
  "structural": [],
  "framing": [],
  "exterior_envelope": [],
  "doors_windows": [],
  "roofing": [],
  "concrete_masonry": [],
  "drywall_insulation": [],
  "flooring_tile": [],
  "paint_finishes": [],
  "millwork_cabinets": [],
  "plumbing": [],
  "electrical": [],
  "HVAC": []
}
      `),
        userContent: chunk.text,
      });
      chunkUsages[index] = usage;

      return {
        data: parseScopePayload(parsed),
        usage,
      };
    },
    { label: "generateScopes" }
  );

  const { parsed: aggregated, usage: aggregationUsage } = await createJsonCompletion({
    openai,
    model: "gpt-5",
    reasoningEffort: "medium",
    responseFormat: getScopeResponseFormat(),
    systemPrompt: buildEstimatorSystemPrompt(`
Combine chunk-level trade scopes from a full construction plan set into one final bid-style scope package.

Additional task rules:
- Use these exact top-level trade keys only:
  "demo"
  "structural"
  "framing"
  "exterior_envelope"
  "doors_windows"
  "roofing"
  "concrete_masonry"
  "drywall_insulation"
  "flooring_tile"
  "paint_finishes"
  "millwork_cabinets"
  "plumbing"
  "electrical"
  "HVAC"
- Deduplicate materially similar scope items across chunks.
- Preserve the most specific, best-supported wording.
- Do not create scope items unsupported by the chunk summaries.
- Keep descriptions concise and contractor-style.
- If a supported item does not map perfectly to one label, assign it to the closest responsible trade instead of omitting it.
- Return empty arrays for trades with no meaningful supported scope.
- Each item must be:
  {
    "title": "short scope title",
    "description": "contractor-style scope description",
    "materialCategories": ["string"],
    "classification": "confirmed" | "inferred" | "unknown"
  }

Return exactly this shape:
{
  "demo": [],
  "structural": [],
  "framing": [],
  "exterior_envelope": [],
  "doors_windows": [],
  "roofing": [],
  "concrete_masonry": [],
  "drywall_insulation": [],
  "flooring_tile": [],
  "paint_finishes": [],
  "millwork_cabinets": [],
  "plumbing": [],
  "electrical": [],
  "HVAC": []
}
    `),
    userContent: serializeChunkResults(contextChunks, chunkScopes, "SCOPE CHUNK"),
  });

  logUsageTotals("generateScopes", [
    { title: "chunks", usage: sumUsage(chunkUsages) },
    { title: "aggregation", usage: aggregationUsage },
    { title: "overall", usage: sumUsage([...chunkUsages, aggregationUsage]) },
  ]);

  return parseScopePayload(aggregated);
};

module.exports = async function generateScopesHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        scopeGenerationStatus: "processing",
        scopesRequestedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const files = await loadProjectPlanFiles(firestore, projectId);
    if (!files.length) {
      return res.status(404).json({
        error: "No analyzed plan files found for this project.",
      });
    }

    const scopes = await generateTradeScopesFromPlans(files, openAiApiKey);

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        scopes,
        scopeGenerationStatus: "completed",
        scopesGeneratedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({
      projectId,
      scopes,
    });
  } catch (error) {
    console.error("Scope generation failed:", error);

    if (projectId) {
      await firestore.doc(`planProjects/${projectId}`).set(
        {
          scopeGenerationStatus: "failed",
          scopesGeneratedAt: FieldValue.serverTimestamp(),
          scopeGenerationError: error instanceof Error ? error.message : "Unknown error",
        },
        { merge: true }
      );
    }

    return res.status(500).json({
      error: "Failed to generate scopes.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
