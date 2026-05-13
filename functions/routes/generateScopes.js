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
const {
  assertPlanAnalysisCanProcess,
  markPlanAnalysisCompleted,
  markPlanAnalysisFailed,
  shouldReleasePlanAnalysisReservationAfterError,
  shouldSkipPlanAnalysisFailureMutation,
  verifyPlanProjectOwner,
} = require("./lib/planAnalyzerQuota");

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

const TRADE_SCOPE_CLASSIFICATION_GUIDANCE = `
Trade scope classification definitions:
- Demo: Removal, relocation, disconnecting, sawcutting, or disposal of existing building components. Includes walls, flooring, ceilings, cabinetry, plumbing, electrical, HVAC, windows, doors, roofing, and concrete. Detect keywords like remove, demo, abandon, salvage, protect, relocate, detach/reset, sawcut, and patch.
- Structural: Load-bearing systems supporting the building including foundations, footings, slabs, beams, columns, headers, LVLs, rebar, steel framing, trusses, shear walls, connectors, anchor bolts, and hurricane clips. Analyze structural plans, framing plans, beam schedules, connection details, and engineering notes.
- Framing: Wood and metal stud systems forming walls, ceilings, soffits, partitions, rough openings, and backing. Includes interior/exterior framing, ceiling framing, chase walls, blocking, and support framing for doors, windows, cabinets, and MEP systems.
- Exterior Envelope: Weatherproof and waterproof exterior systems protecting the structure from moisture and air infiltration. Includes stucco, EIFS, waterproofing, flashing, sealants, WRBs, vapor barriers, siding, exterior insulation, and penetration sealing.
- Doors/Windows: All interior/exterior doors, windows, storefronts, sliders, skylights, glazing systems, mullions, hardware, and thresholds. Detect schedules, rough openings, impact ratings, flashing, egress requirements, and waterproofing transitions.
- Roofing: Roof covering and drainage systems including shingles, TPO, tile, metal roofing, insulation, flashing, gutters, drains, coping, curbs, penetrations, and roof-mounted equipment supports. Detect slopes, drainage paths, and uplift requirements.
- Concrete/Masonry: Concrete slabs, foundations, CMU walls, retaining walls, sidewalks, curbs, pads, lintels, grout fill, rebar systems, and reinforced masonry assemblies. Analyze slab details, reinforcement schedules, and structural concrete notes.
- Drywall/Insulation: Gypsum board systems, insulation, fire-rated assemblies, sound assemblies, cement board, vapor barriers, and ceiling systems. Detect wall types, drywall thicknesses, insulation R-values, and acoustic/fire requirements.
- Flooring/Tile: All floor finish systems including tile, LVP, hardwood, carpet, epoxy, self-leveling underlayment, waterproof membranes, transitions, and shower pans. Detect tile layouts, slopes, floor prep, and substrate requirements.
- Paint/Finishes: Decorative and protective finish systems including paint, texture, stains, wall coverings, specialty coatings, sealers, and epoxy finishes. Detect finish schedules, sheen levels, and surface prep requirements.
- Millwork/Cabinets: Cabinetry, countertops, shelving, trim carpentry, built-ins, vanities, crown molding, baseboard, wall panels, and closet systems. Detect dimensions, hardware, appliance coordination, and blocking requirements.
- Plumbing: Water supply, sanitary drainage, venting, storm drainage, gas piping, fixtures, water heaters, floor drains, shutoff valves, and plumbing equipment. Detect fixture schedules, pipe sizing, venting, underground plumbing, and drain slopes.
- Electrical: Power distribution and low-voltage systems including panels, circuits, conduit, lighting, switches, receptacles, fire alarm, data, security, generators, and disconnects. Detect panel schedules, dedicated circuits, conduit routing, and lighting controls.
- HVAC: Heating, cooling, ventilation, and air distribution systems including ductwork, air handlers, condensers, diffusers, exhaust systems, refrigerant lines, thermostats, and condensate drains. Detect airflow requirements, duct sizing, ventilation notes, and roof penetrations.

Analyzer guidance:
- Cross-reference all available sheets, notes, schedules, sections, elevations, callouts, symbols, and specifications.
- Identify hidden scope impacts between trades, especially structural, framing, MEP, waterproofing, exterior envelope, roofing, doors/windows, and finish systems.
- When scopes overlap, assign the primary work to the most responsible trade and mention important coordination impacts in the description instead of duplicating the same scope item under multiple trades.
`;

const TRADE_SCOPE_AGGREGATION_GUIDANCE = `
Trade boundary reminder:
- Keep each scope item under the most responsible primary trade.
- Preserve cross-trade coordination notes when they are supported by the chunk summaries, especially for structural, framing, MEP, waterproofing, exterior envelope, roofing, doors/windows, and finish systems.
- Do not duplicate the same primary scope under multiple trades.
- Use the established trade definitions from the chunk summaries when resolving ambiguous items.
`;

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
${TRADE_SCOPE_CLASSIFICATION_GUIDANCE}
- Each trade value must be an array.
- If a trade has no meaningful supported scope in this chunk, return an empty array for that trade.
- Keep scope descriptions concise, contractor-style, and bid-ready.
- Do not include pricing, labor hours, markup, schedule duration, or unsupported means and methods.
- Do not duplicate the same work as primary scope under multiple trades.
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
    { label: "generateScopes", concurrency: 4 }
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
${TRADE_SCOPE_AGGREGATION_GUIDANCE}
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

    const { projectData } = await verifyPlanProjectOwner(firestore, req, projectId);
    assertPlanAnalysisCanProcess(projectData);

    const moduleRef = firestore.doc(getPlanModuleDocPath(projectId, "scopes"));
    const startedAt = FieldValue.serverTimestamp();

    await Promise.all([
      firestore.doc(`planProjects/${projectId}`).set(
        {
          status: "processing",
          modules: {
            scopes: buildPlanModuleSummaryData(projectId, "scopes", "processing", {
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
          moduleType: "scopes",
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

    const scopes = await generateTradeScopesFromPlans(files, openAiApiKey);

    const completedAt = FieldValue.serverTimestamp();

    const projectSnap = await firestore.doc(`planProjects/${projectId}`).get();
    assertPlanAnalysisCanProcess(projectSnap.data() || {});
    const nextProjectStatus = getProjectStatusAfterModuleUpdate(
      projectSnap.data() || {},
      "scopes",
      "completed"
    );

    await Promise.all([
      moduleRef.set(
        {
          projectId,
          moduleType: "scopes",
          status: "completed",
          error: null,
          completedAt,
          result: scopes,
        },
        { merge: true }
      ),
      firestore.doc(`planProjects/${projectId}`).set(
        {
          status: nextProjectStatus,
          modules: {
            scopes: buildPlanModuleSummaryData(projectId, "scopes", "completed", {
              completedAt,
              error: null,
            }),
          },
        },
        { merge: true }
      ),
    ]);

    if (nextProjectStatus === "completed") {
      await markPlanAnalysisCompleted(firestore, projectId);
    }

    return res.json({
      projectId,
      scopes,
    });
  } catch (error) {
    console.error("Scope generation failed:", error);

    if (projectId && !shouldSkipPlanAnalysisFailureMutation(error)) {
      const completedAt = FieldValue.serverTimestamp();
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await Promise.all([
        firestore.doc(getPlanModuleDocPath(projectId, "scopes")).set(
          {
            projectId,
            moduleType: "scopes",
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
              scopes: buildPlanModuleSummaryData(projectId, "scopes", "failed", {
                completedAt,
                error: errorMessage,
              }),
            },
          },
          { merge: true }
        ),
      ]);

    }

    if (projectId && shouldReleasePlanAnalysisReservationAfterError(error)) {
      await markPlanAnalysisFailed(firestore, projectId).catch((quotaError) => {
        console.error("Failed to release plan analysis quota after scope failure:", quotaError);
      });
    }

    return res.status(error.statusCode || 500).json({
      error: "Failed to generate scopes.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
