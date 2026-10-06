const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const { buildEstimatorSystemPrompt } = require("./lib/estimatorPrompt");
const { AI_MODELS } = require("./lib/aiModels");
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
  readPageTextField,
  readPageTextSection,
  sumUsage,
} = require("./lib/planAnalyzerContext");
const { isFullTradeSelection, normalizeSelectedTrades } = require("./lib/tradeScopes");
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
- Never repeat the same task under more than one trade. When two trades describe the same physical work, keep the one under the most responsible trade, fold any extra detail into it, and drop the other.
- Use the established trade definitions from the chunk summaries when resolving ambiguous items.
`;

const ALLOWED_CLASSIFICATIONS = new Set(["confirmed", "inferred", "unknown"]);
/**
 * A 12-page set is ~240k chars of plan text plus per-page visual analysis, which
 * at 75k used to split into three chunks and need an aggregation pass to stitch
 * back together. One call at this limit is ~81k input tokens against a ~1M
 * context window, so a normal set is now scoped in a single pass: nothing to
 * deduplicate, and every sheet visible at once when quantities are derived.
 * Sets past this still chunk and still run the aggregation pass.
 */
const MAX_PROJECT_CONTEXT_LENGTH = 400000;
const MAX_MATERIAL_SEARCH_QUERY_LENGTH = 100;

// Allowed material units, in order.
const MATERIAL_UNIT_LABELS = {
  EA: "each",
  LF: "linear feet",
  SF: "square feet",
  SY: "square yards",
  CF: "cubic feet",
  CY: "cubic yards",
  BF: "board feet",
  SQ: "roofing squares, 100 SF",
  SHEET: "sheets",
  PC: "pieces",
  BOX: "boxes",
  ROLL: "rolls",
  BAG: "bags",
  GAL: "gallons",
  LB: "pounds",
  FIXTURE: "fixtures",
  ASSEMBLY: "assemblies",
  DEVICE: "devices",
  OPENING: "openings",
};

const MATERIAL_UNITS = Object.keys(MATERIAL_UNIT_LABELS);
const MATERIAL_UNIT_SET = new Set(MATERIAL_UNITS);

const QUANTITY_BASES = ["stated", "calculated", "measured", "inferred"];
const CONFIDENCE_LEVELS = ["high", "medium", "low"];
const QUANTITY_BASIS_SET = new Set(QUANTITY_BASES);
const CONFIDENCE_SET = new Set(CONFIDENCE_LEVELS);

// Ranked most to least supported; a disagreement keeps the better-supported count.
const basisRank = (basis) => {
  const index = QUANTITY_BASES.indexOf(basis);
  return index === -1 ? 0 : QUANTITY_BASES.length - index;
};

const SCOPE_MATERIAL_RULES = `
Material takeoff rules:
- List the specific materials each scope item requires in "materials", one entry per distinct material and stock size.
- Never leave a scope item without materials, and never drop a material because it is hard to quantify. Every material the scope description names has to appear with a quantity.
- When nothing in the plans supports a count, still list the material and quantify it with a standard estimating allowance, marked "inferred" at low confidence with the allowance named in "calculation". Gypsum board and insulation come from wall and ceiling areas, or from room dimensions when areas are not stated; footings, post bases, and hangers come from the symbols counted on the plans; fasteners come from the spacing and the run they fasten.
- Quantify materials the way a contractor buys them, and give the running total as well. When a material comes in stock sizes - lumber, panels, trim, pipe, conduit, rebar, roll goods - write one entry per stock size with its piece count, plus one total entry for the whole material: "2x12x16 pressure-treated SYP" at 6 EA, "2x12x20 pressure-treated SYP" at 8 EA, and "2x12 pressure-treated SYP (total run)" at 460 LF.
- Pick stock sizes that suit the spans, heights, and runs the plans show, so a piece covers its run without a splice wherever a stock length allows it.
- Give each stock-size entry the unit the material is sold in: EA or PC for pieces, SHEET for panels, ROLL, BAG, BOX, GAL for packaged goods, CY for ready-mix concrete. Give the total entry its measuring unit: LF, SF, SY, or CY.
- Name the total entry with "(total run)", "(total area)", or "(total volume)", and say in its "calculation" that the stock-size entries cover it, so nobody orders the material twice. A material with no stock size, such as poured concrete or bulk fill, needs only the total entry.
- Only list physical materials a contractor buys. Do not list labor, services, engineering, design, permits, inspections, submittals, or documentation.
- "name" is the specific material as a contractor would write it on a takeoff, including type, size, and grade when the plans give them.
- Give a "planReference" for every material: the sheet, detail, schedule, keynote, or plan location it comes from. Use null only when nothing in the plans supports it.
- Every material must have a "quantity", "unit", "quantityBasis", "confidence", and "calculation". Reach the quantity with the strongest method available, in this order:
  stated = the plans give the count or amount outright, in a schedule, keynote, callout, note, or counted items.
  calculated = arithmetic on dimensions, areas, spacings, heights, or counts the plans give, including totals of printed dimension strings, such as a building perimeter from its overall dimensions or wall area as wall length times ceiling height. Put the working in "calculation", for example "42 LF / 16 in. O.C. = 33 studs + 7 corners and openings = 40".
  measured = a length or area from MEASURED DIMENSIONS, traced on the drawing and converted with the sheet's graphic scale bar, used when no printed dimension gives it. Put the measurement and any math on it in "calculation".
  inferred = a standard estimating allowance, used when the plans do not give enough to calculate, such as studs and plates per linear foot of wall, sheathing sheets per wall area, one hanger per joist end, wire or pipe length per device or fixture, or a waste factor. Name the allowance in "calculation".
- Work out the quantities other materials depend on first, such as wall lengths, wall areas, and joist counts, then derive connectors, fasteners, sheathing, and finishes from them.
- "calculation" must show the chain from the plan numbers to the final count: the numbers used and where they came from, the arithmetic, the stock size chosen and why, and any waste factor or assumption. A contractor reading it should be able to follow the number back to the plans. For example "Deck joists at 16 in. O.C. across a 15'-8\" span (S-104): 12 joists, one 2x12x16 each; rim at 20'-5\" (S-104): 2 pieces of 2x12x20; 10% waste not added because pieces are cut to length".
- Prefer quantities the plan text states. When the text states none, use the per-page visual analysis: its counted items, stated dimensions, and measured dimensions are evidence, the same as extracted text.
- Use TAKEOFF EVIDENCE FROM EVERY SHEET for counts, dimensions, spacings, and heights that appear on sheets outside the plan context you are reviewing. Quantities often need numbers from several sheets, such as wall lengths from a floor plan and stud spacing from a framing detail.
- Adding up printed dimensions is calculation. Lengths and areas in MEASURED DIMENSIONS are measured: they were traced on the drawing and converted with the sheet's graphic scale bar. Never estimate a distance by eye.
- A calculated or inferred quantity that shows its working and names its allowance or assumptions is not a fabricated quantity.
- When the same material is counted in more than one place, combine the counts into its single entry and list every source in "planReference", for example "E-101; E-102".
- Set "confidence" for every quantity:
  high = explicitly shown, scheduled, dimensioned, or specified.
  medium = a calculation on plan numbers, a measurement against a graphic scale bar, or a reasonable interpretation was required.
  low = a standard estimating allowance or significant assumption was required.
- "unit" must be one of: ${MATERIAL_UNITS.map(
  (unit) => `${unit} (${MATERIAL_UNIT_LABELS[unit]})`
).join(", ")}.
- "searchQuery" is a short phrase a contractor would type into Home Depot's search: material type, size, and grade. Do not include brand names or SKUs unless the plans specify them.
`;

const SCOPE_MATERIAL_AGGREGATION_RULES = `
- Merge the materials of deduplicated scope items into one entry per material.
- When the same source (the same schedule, note, or count) appears in more than one chunk, count it once.
- When counts come from different sheets or areas that do not overlap, add them together and list every source in "planReference".
- Keep separate stock sizes as separate entries. Never merge them into one running total.
- Never drop a material a chunk reported. If its quantity is weak, quantify it with a standard estimating allowance rather than leaving the scope item empty.
- When two counts disagree and you cannot tell which applies, keep the best-supported count, set "quantityBasis" to "inferred", set "confidence" to "low", and explain the disagreement in "calculation".
- Before returning, make sure every material in the final output has a quantity. Recalculate any that are weak from TAKEOFF EVIDENCE FROM EVERY SHEET, combining counts, dimensions, spacings, and heights across sheets, and use a standard estimating allowance where the evidence is not enough. Show the working in "calculation".
`;

const SCOPE_ITEM_SHAPE_EXAMPLE = `{
    "title": "short scope title",
    "description": "contractor-style scope description",
    "materials": [
      {
        "name": "specific material",
        "searchQuery": "Home Depot search phrase",
        "quantity": number,
        "unit": ${MATERIAL_UNITS.map((unit) => `"${unit}"`).join(" | ")},
        "quantityBasis": ${QUANTITY_BASES.map((basis) => `"${basis}"`).join(" | ")},
        "calculation": "how the quantity was reached",
        "confidence": ${CONFIDENCE_LEVELS.map((level) => `"${level}"`).join(" | ")},
        "planReference": "sheet, detail, schedule, or keynote" | null
      }
    ],
    "classification": "confirmed" | "inferred" | "unknown"
  }`;

const toPositiveQuantity = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

const normalizeText = (value) => String(value == null ? "" : value).trim() || null;

/** Distinct plan references, in order, joined with "; ". */
const combineReferences = (...references) => {
  const seen = new Set();
  const parts = references
    .flatMap((reference) => (reference ? reference.split("; ") : []))
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return parts.length ? parts.join("; ") : null;
};

const sanitizeScopeMaterials = (materials) => {
  if (!Array.isArray(materials)) {
    return [];
  }

  const materialsByName = new Map();

  materials.forEach((material) => {
    if (!material || typeof material !== "object") {
      return;
    }

    const name = normalizeText(material.name);

    if (!name) {
      return;
    }

    const nameKey = name.toLowerCase();
    const unitCandidate = String(material.unit || "").trim().toUpperCase();
    const unit = MATERIAL_UNIT_SET.has(unitCandidate) ? unitCandidate : null;
    // A quantity is kept only with a valid unit.
    const quantity = unit ? toPositiveQuantity(material.quantity) : null;
    const hasQuantity = quantity !== null;
    const basis = String(material.quantityBasis || "").trim().toLowerCase();
    const confidence = String(material.confidence || "").trim().toLowerCase();
    // An unrecognized basis or confidence reads as the least certain option.
    const quantityFields = hasQuantity
      ? {
          quantity,
          unit,
          quantityBasis: QUANTITY_BASIS_SET.has(basis) ? basis : "inferred",
          calculation: normalizeText(material.calculation),
          confidence: CONFIDENCE_SET.has(confidence) ? confidence : "low",
        }
      : {
          quantity: null,
          unit: null,
          quantityBasis: null,
          calculation: normalizeText(material.calculation),
          confidence: null,
        };
    const planReference = normalizeText(material.planReference);
    const existing = materialsByName.get(nameKey);

    if (!existing) {
      const searchQuery = (normalizeText(material.searchQuery) || name)
        .slice(0, MAX_MATERIAL_SEARCH_QUERY_LENGTH)
        .trim();

      materialsByName.set(nameKey, { name, searchQuery, ...quantityFields, planReference });
      return;
    }

    existing.planReference = combineReferences(existing.planReference, planReference);

    if (!hasQuantity) {
      return;
    }

    // The sheet a quantity came from is listed first.
    const adoptQuantity = () => {
      Object.assign(existing, quantityFields);
      existing.planReference = combineReferences(planReference, existing.planReference);
    };

    if (existing.quantity === null) {
      adoptQuantity();
      return;
    }

    if (existing.quantity === quantityFields.quantity && existing.unit === quantityFields.unit) {
      return;
    }

    // Duplicates disagree: keep the better-supported count, and stop calling it certain.
    if (basisRank(quantityFields.quantityBasis) > basisRank(existing.quantityBasis)) {
      adoptQuantity();
    }

    existing.confidence = "low";
  });

  return [...materialsByName.values()];
};

const sanitizeScopeItem = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const title = String(item.title || "").trim();
  const description = String(item.description || "").trim();
  const classification = String(item.classification || "").trim();

  if (!title || !description || !ALLOWED_CLASSIFICATIONS.has(classification)) {
    return null;
  }

  return {
    title,
    description,
    materials: sanitizeScopeMaterials(item.materials),
    classification,
  };
};

const getTradeScopeTemplate = (selectedTrades) =>
  normalizeSelectedTrades(selectedTrades).reduce((acc, trade) => {
    acc[trade] = [];
    return acc;
  }, {});

const getScopeResponseFormat = (selectedTrades) => {
  const trades = normalizeSelectedTrades(selectedTrades);
  const materialSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: {
        type: "string",
      },
      searchQuery: {
        type: "string",
      },
      quantity: {
        type: "number",
      },
      unit: {
        type: "string",
        enum: [...MATERIAL_UNITS],
      },
      quantityBasis: {
        type: "string",
        enum: [...QUANTITY_BASES],
      },
      calculation: {
        type: "string",
      },
      confidence: {
        type: "string",
        enum: [...CONFIDENCE_LEVELS],
      },
      planReference: {
        type: ["string", "null"],
      },
    },
    required: [
      "name",
      "searchQuery",
      "quantity",
      "unit",
      "quantityBasis",
      "calculation",
      "confidence",
      "planReference",
    ],
  };

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
      materials: {
        type: "array",
        items: materialSchema,
      },
      classification: {
        type: "string",
        enum: ["confirmed", "inferred", "unknown"],
      },
    },
    required: ["title", "description", "materials", "classification"],
  };

  const properties = trades.reduce((acc, trade) => {
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
        required: trades,
      },
    },
  };
};

const parseScopePayload = (parsed, selectedTrades) => {
  const scopes = getTradeScopeTemplate(selectedTrades);

  Object.keys(scopes).forEach((trade) => {
    const items = Array.isArray(parsed?.[trade]) ? parsed[trade] : [];
    scopes[trade] = items.map(sanitizeScopeItem).filter(Boolean);
  });

  return scopes;
};

const formatTradeKeyList = (trades) => trades.map((trade) => `  "${trade}"`).join("\n");

const formatTradeShapeExample = (trades) =>
  `{\n${trades.map((trade) => `  "${trade}": []`).join(",\n")}\n}`;

const MAX_TAKEOFF_EVIDENCE_LENGTH = 150000;

/** Every page's counted items, printed dimensions, and scale-bar measurements, labeled by sheet, as one block. */
const buildTakeoffEvidence = (files) => {
  const blocks = (Array.isArray(files) ? files : [])
    .map((file) => {
      const rawText = String(file?.rawText || "");
      const counted = readPageTextSection(rawText, "COUNTED ITEMS");
      const dimensions = readPageTextSection(rawText, "STATED DIMENSIONS");
      const measured = readPageTextSection(rawText, "MEASURED DIMENSIONS");
      if (!counted && !dimensions && !measured) return "";

      const sheet =
        readPageTextField(rawText, "VISIBLE SHEET NUMBER") || file?.detectedSheetNumber || "unknown";
      const title = readPageTextField(rawText, "VISIBLE TITLE") || file?.detectedTitle || "";

      return [
        `PAGE ${file?.sourcePageNumber || "?"} | SHEET ${sheet}${title ? ` | ${title}` : ""}`,
        counted ? `COUNTED ITEMS:\n${counted}` : "",
        dimensions ? `STATED DIMENSIONS:\n${dimensions}` : "",
        measured ? `MEASURED DIMENSIONS:\n${measured}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean);

  if (!blocks.length) return "";

  const evidence = [
    "TAKEOFF EVIDENCE FROM EVERY SHEET",
    "Counts, printed dimensions, and scale-bar measurements read from each page of the plan set.",
    ...blocks,
  ].join("\n\n");

  // ponytail: evidence past this length is dropped; split it by trade if plan sets outgrow it.
  return evidence.length > MAX_TAKEOFF_EVIDENCE_LENGTH
    ? `${evidence.slice(0, MAX_TAKEOFF_EVIDENCE_LENGTH)}\n[takeoff evidence truncated]`
    : evidence;
};

const withTakeoffEvidence = (evidence, content) =>
  evidence ? `${evidence}\n\n====================\n\n${content}` : content;

const generateTradeScopesFromPlans = async (
  files,
  openAiApiKey,
  userNotes = "",
  selectedTrades = null
) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const trades = normalizeSelectedTrades(selectedTrades);
  const tradeKeyList = formatTradeKeyList(trades);
  const tradeShapeExample = formatTradeShapeExample(trades);
  // With every trade available, unassigned work is a gap worth closing. With a subset,
  // the same instruction would push out-of-scope work into the nearest selected trade.
  const unassignedWorkRules = isFullTradeSelection(trades)
    ? `- If an item is not explicitly named as a trade scope but is supported by the plans, infer the closest responsible trade and place it there.
- Do not leave supported work unassigned just because it is indirect, note-based, or coordination-driven.`
    : `- Drop supported work whose most responsible trade is not one of the keys above. Do not reassign it to the closest listed trade.
- Only infer a trade for an unlabeled item when the responsible trade is genuinely one of the keys above.`;
  const aggregationFallbackRule = isFullTradeSelection(trades)
    ? "- If a supported item does not map perfectly to one label, assign it to the closest responsible trade instead of omitting it."
    : "- If a supported item does not belong to one of the keys above, omit it. Do not force it into the closest listed trade.";
  const contextChunks = createPlanContextChunks(files, MAX_PROJECT_CONTEXT_LENGTH);
  if (!contextChunks.length) {
    throw new Error("No extracted plan text is available for this project");
  }

  // With one chunk this pass IS the whole plan set, so it inherits the
  // aggregation pass's cross-sheet duties: combining counts from sheets that do
  // not overlap, and the closing sweep that recalculates weak quantities from
  // evidence on every sheet.
  const isSingleChunk = contextChunks.length === 1;

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const takeoffEvidence = buildTakeoffEvidence(files);
  const chunkUsages = [];
  const chunkScopes = await mapWithConcurrency(
    contextChunks,
    async (chunk, index) => {
      const { parsed, usage } = await createJsonCompletion({
        openai,
        model: AI_MODELS.DEEP,
        reasoningEffort: "high",
        responseFormat: getScopeResponseFormat(trades),
        systemPrompt: buildEstimatorSystemPrompt(`
Review one chunk of construction plan context and generate trade scopes. The context may include
OCR-extracted image text, PDF text extraction, and visual PDF/page summaries,
written the way a contractor would prepare bid scope notes.

Additional task rules:
- Use these exact top-level trade keys only:
${tradeKeyList}
${TRADE_SCOPE_CLASSIFICATION_GUIDANCE}
- Each trade value must be an array.
- If a trade has no meaningful supported scope in this chunk, return an empty array for that trade.
- Keep scope descriptions concise, contractor-style, and bid-ready.
- Do not include pricing, labor hours, markup, schedule duration, or unsupported means and methods.
- Never repeat the same task under more than one trade. Whichever trade owns a task is the only one that states it; any other trade involved covers only its own separate work. For example, if Demo covers removing a wall, Demo alone states that removal, and Structural states only what it adds there, such as a new header.
- Assign each scope item to the trade most responsible for doing that work, and mention the other trades only as coordination inside that one item.
${unassignedWorkRules}
- Use classification carefully:
  confirmed = directly supported by extracted text or a visual page summary.
  inferred = reasonable scope implication, but not directly stated.
  unknown = scope appears possible but is not sufficiently supported.
${SCOPE_MATERIAL_RULES}${isSingleChunk ? SCOPE_MATERIAL_AGGREGATION_RULES : ""}
- Each item must be:
  ${SCOPE_ITEM_SHAPE_EXAMPLE}

Return exactly this shape:
${tradeShapeExample}
      `, { userNotes, selectedTrades: trades }),
        userContent: withTakeoffEvidence(takeoffEvidence, chunk.text),
      });
      chunkUsages[index] = usage;

      return {
        data: parseScopePayload(parsed, trades),
        usage,
      };
    },
    { label: "generateScopes", concurrency: 8 }
  );

  if (isSingleChunk) {
    logUsageTotals("generateScopes", [{ title: "single pass", usage: sumUsage(chunkUsages) }]);
    return chunkScopes[0];
  }

  const { parsed: aggregated, usage: aggregationUsage } = await createJsonCompletion({
    openai,
    model: AI_MODELS.DEEP,
    reasoningEffort: "high",
    responseFormat: getScopeResponseFormat(trades),
    systemPrompt: buildEstimatorSystemPrompt(`
Combine chunk-level trade scopes from a full construction plan set into one final bid-style scope package.

Additional task rules:
- Use these exact top-level trade keys only:
${tradeKeyList}
${TRADE_SCOPE_AGGREGATION_GUIDANCE}
- Deduplicate materially similar scope items across chunks.
- Preserve the most specific, best-supported wording.
- Do not create scope items unsupported by the chunk summaries.
- Keep descriptions concise and contractor-style.
${aggregationFallbackRule}
- Return empty arrays for trades with no meaningful supported scope.
${SCOPE_MATERIAL_RULES}${SCOPE_MATERIAL_AGGREGATION_RULES}
- Each item must be:
  ${SCOPE_ITEM_SHAPE_EXAMPLE}

Return exactly this shape:
${tradeShapeExample}
    `, { userNotes, selectedTrades: trades }),
    userContent: withTakeoffEvidence(
      takeoffEvidence,
      serializeChunkResults(contextChunks, chunkScopes, "SCOPE CHUNK")
    ),
  });

  logUsageTotals("generateScopes", [
    { title: "chunks", usage: sumUsage(chunkUsages) },
    { title: "aggregation", usage: aggregationUsage },
    { title: "overall", usage: sumUsage([...chunkUsages, aggregationUsage]) },
  ]);

  return parseScopePayload(aggregated, trades);
};

async function generateScopesHandler(req, res, openAiApiKey, adminContext = null) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    const { projectData } = adminContext
      ? adminContext
      : await verifyPlanProjectOwner(firestore, req, projectId);
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

    const scopes = await generateTradeScopesFromPlans(
      files,
      openAiApiKey,
      projectData?.userNotes,
      projectData?.selectedTrades
    );

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
}

// index.js and the pipeline runner require this module and call it directly, so the
// handler stays the export itself. The builders hang off it for tests.
module.exports = generateScopesHandler;
module.exports.getScopeResponseFormat = getScopeResponseFormat;
module.exports.getTradeScopeTemplate = getTradeScopeTemplate;
module.exports.parseScopePayload = parseScopePayload;
module.exports.MATERIAL_UNITS = MATERIAL_UNITS;
module.exports.buildTakeoffEvidence = buildTakeoffEvidence;
module.exports.QUANTITY_BASES = QUANTITY_BASES;
module.exports.CONFIDENCE_LEVELS = CONFIDENCE_LEVELS;
module.exports.SCOPE_MATERIAL_RULES = SCOPE_MATERIAL_RULES;
module.exports.SCOPE_MATERIAL_AGGREGATION_RULES = SCOPE_MATERIAL_AGGREGATION_RULES;
module.exports.sanitizeScopeMaterials = sanitizeScopeMaterials;
module.exports.MAX_PROJECT_CONTEXT_LENGTH = MAX_PROJECT_CONTEXT_LENGTH;
