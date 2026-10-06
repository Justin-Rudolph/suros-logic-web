const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const {
  TRADE_KEYS,
  TRADE_LABELS,
  isFullTradeSelection,
  normalizeSelectedTrades,
  selectValidTrades,
} = require("../routes/lib/tradeScopes");
const { buildEstimatorSystemPrompt } = require("../routes/lib/estimatorPrompt");
const { createPlanContextChunks } = require("../routes/lib/planAnalyzerContext");
const generateScopesHandler = require("../routes/generateScopes");
const {
  CONFIDENCE_LEVELS,
  MATERIAL_UNITS,
  QUANTITY_BASES,
  MAX_PROJECT_CONTEXT_LENGTH,
  SCOPE_MATERIAL_RULES,
  getScopeResponseFormat,
  getTradeScopeTemplate,
  parseScopePayload,
  sanitizeScopeMaterials,
} = generateScopesHandler;

test("generateScopes still exports a callable handler for index.js and the pipeline", () => {
  assert.equal(typeof generateScopesHandler, "function");
});

test("an absent selection still asks for all 14 trades", () => {
  const { schema } = getScopeResponseFormat(undefined).json_schema;

  assert.deepEqual(Object.keys(schema.properties), TRADE_KEYS);
  assert.deepEqual(getTradeScopeTemplate(undefined), getTradeScopeTemplate(TRADE_KEYS));
});

// The frontend list is TypeScript and cannot be required from here, so this parses
// the source. Blunt, but these two lists have already drifted once — the frontend
// copy had plumbing and electrical in different positions — and a comment asking for
// them to be kept in sync did not prevent it. If reformatting SCOPE_TRADE_LABELS ever
// breaks this parse, fix the regex; do not delete the test.
const FRONTEND_TRADES_PATH = path.join(
  __dirname,
  "../../src/models/PlanAnalyzerShared.ts"
);

const readFrontendTrades = () => {
  const source = readFileSync(FRONTEND_TRADES_PATH, "utf8");
  const block = source.match(/SCOPE_TRADE_LABELS = \[(.*?)\] as const;/s);

  assert.ok(block, `Could not find SCOPE_TRADE_LABELS in ${FRONTEND_TRADES_PATH}`);

  return [...block[1].matchAll(/key:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)].map(
    ([, key, label]) => ({ key, label })
  );
};

test("the frontend trade list matches the backend one, in order", () => {
  assert.deepEqual(
    readFrontendTrades(),
    TRADE_KEYS.map((key) => ({ key, label: TRADE_LABELS[key] }))
  );
});

test("every trade key has a display label", () => {
  assert.equal(TRADE_KEYS.length, 14);
  TRADE_KEYS.forEach((key) => {
    assert.equal(typeof TRADE_LABELS[key], "string");
    assert.ok(TRADE_LABELS[key].length > 0);
  });
});

test("normalizeSelectedTrades keeps only known trades in canonical order", () => {
  assert.deepEqual(normalizeSelectedTrades(["electrical", "demo", "plumbing"]), [
    "demo",
    "plumbing",
    "electrical",
  ]);
});

test("normalizeSelectedTrades drops unknown keys and duplicates", () => {
  assert.deepEqual(
    normalizeSelectedTrades(["roofing", "roofing", "landscaping", "", null, 7]),
    ["roofing"]
  );
});

test("normalizeSelectedTrades falls back to every trade when nothing usable is provided", () => {
  assert.deepEqual(normalizeSelectedTrades([]), TRADE_KEYS);
  assert.deepEqual(normalizeSelectedTrades(undefined), TRADE_KEYS);
  assert.deepEqual(normalizeSelectedTrades(["landscaping"]), TRADE_KEYS);
  assert.deepEqual(normalizeSelectedTrades("plumbing"), TRADE_KEYS);
});

test("selectValidTrades reports an empty result instead of falling back", () => {
  assert.deepEqual(selectValidTrades([]), []);
  assert.deepEqual(selectValidTrades(["landscaping"]), []);
  assert.deepEqual(selectValidTrades("plumbing"), []);
  assert.deepEqual(selectValidTrades(undefined), []);
  assert.deepEqual(selectValidTrades(["hvac"]), [], "trade keys are case sensitive");
  assert.deepEqual(selectValidTrades(["electrical", "demo"]), ["demo", "electrical"]);
});

test("isFullTradeSelection only reports true for the complete list", () => {
  assert.equal(isFullTradeSelection(TRADE_KEYS), true);
  assert.equal(isFullTradeSelection(["plumbing", "electrical"]), false);
});

test("getScopeResponseFormat asks for only the selected trades", () => {
  const format = getScopeResponseFormat(["plumbing", "electrical"]);
  const { schema } = format.json_schema;

  assert.deepEqual(Object.keys(schema.properties), ["plumbing", "electrical"]);
  assert.deepEqual(schema.required, ["plumbing", "electrical"]);
  assert.equal(schema.additionalProperties, false);
});

test("getTradeScopeTemplate seeds only the selected trades", () => {
  assert.deepEqual(getTradeScopeTemplate(["demo", "HVAC"]), { demo: [], HVAC: [] });
});

test("parseScopePayload ignores trades outside the selection", () => {
  const item = {
    title: "Rough-in supply lines",
    description: "Run new supply piping to the fixture group.",
    materials: [
      {
        name: "Copper pipe",
        searchQuery: "copper pipe",
        quantity: null,
        unit: null,
        quantityBasis: null,
        calculation: null,
        confidence: null,
        planReference: "P-4",
      },
    ],
    classification: "confirmed",
  };

  const parsed = parseScopePayload({ plumbing: [item], roofing: [item] }, ["plumbing"]);

  assert.deepEqual(Object.keys(parsed), ["plumbing"]);
  assert.equal(parsed.plumbing.length, 1);
});

test("parseScopePayload drops malformed scope items", () => {
  const parsed = parseScopePayload(
    {
      plumbing: [
        { title: "", description: "no title", materials: [], classification: "confirmed" },
        { title: "No class", description: "missing classification", materials: [] },
        {
          title: "Valid",
          description: "Supported scope item.",
          materials: [],
          classification: "inferred",
        },
      ],
    },
    ["plumbing"]
  );

  assert.deepEqual(
    parsed.plumbing.map((entry) => entry.title),
    ["Valid"]
  );
});

test("buildEstimatorSystemPrompt restricts analysis to a trade subset", () => {
  const prompt = buildEstimatorSystemPrompt("Do the thing.", {
    selectedTrades: ["plumbing", "electrical"],
  });

  assert.match(prompt, /SELECTED TRADE SCOPES/);
  assert.match(prompt, /Plumbing/);
  assert.match(prompt, /Electrical/);
  assert.doesNotMatch(prompt, /Roofing/);
});

test("buildEstimatorSystemPrompt omits the restriction when every trade is selected", () => {
  const prompt = buildEstimatorSystemPrompt("Do the thing.", { selectedTrades: TRADE_KEYS });

  assert.doesNotMatch(prompt, /SELECTED TRADE SCOPES/);
});

test("buildEstimatorSystemPrompt omits the restriction when no selection is given", () => {
  const prompt = buildEstimatorSystemPrompt("Do the thing.");

  assert.doesNotMatch(prompt, /SELECTED TRADE SCOPES/);
  assert.match(prompt, /Do the thing\./);
});

test("buildEstimatorSystemPrompt keeps contractor notes alongside a trade restriction", () => {
  const prompt = buildEstimatorSystemPrompt("Do the thing.", {
    userNotes: "Slab is already poured.",
    selectedTrades: ["demo"],
  });

  assert.match(prompt, /CONTRACTOR-PROVIDED CONTEXT NOTES/);
  assert.match(prompt, /Slab is already poured\./);
  assert.match(prompt, /SELECTED TRADE SCOPES/);
});

const EMPTY_QUANTITY = {
  quantity: null,
  unit: null,
  quantityBasis: null,
  calculation: null,
  confidence: null,
};

const pickQuantity = ({ quantity, unit, quantityBasis, calculation, confidence }) => ({
  quantity,
  unit,
  quantityBasis,
  calculation,
  confidence,
});

test("the scope item schema requires a quantity, unit, basis, and confidence on every material", () => {
  const { schema } = getScopeResponseFormat(["plumbing"]).json_schema;
  const itemSchema = schema.properties.plumbing.items;
  const materialSchema = itemSchema.properties.materials.items;

  assert.ok(itemSchema.required.includes("materials"));
  assert.doesNotMatch(JSON.stringify(schema), /materialCategories/);
  assert.equal(materialSchema.additionalProperties, false);
  assert.deepEqual(materialSchema.required, [
    "name",
    "searchQuery",
    "quantity",
    "unit",
    "quantityBasis",
    "calculation",
    "confidence",
    "planReference",
  ]);
  assert.equal(materialSchema.properties.quantity.type, "number");
  assert.equal(materialSchema.properties.calculation.type, "string");
  assert.deepEqual(materialSchema.properties.planReference.type, ["string", "null"]);
  assert.deepEqual(materialSchema.properties.unit, { type: "string", enum: MATERIAL_UNITS });
  assert.deepEqual(materialSchema.properties.quantityBasis, { type: "string", enum: QUANTITY_BASES });
  assert.deepEqual(materialSchema.properties.confidence, { type: "string", enum: CONFIDENCE_LEVELS });
});

test("sanitizeScopeMaterials returns an empty list for non-array input", () => {
  assert.deepEqual(sanitizeScopeMaterials(undefined), []);
  assert.deepEqual(sanitizeScopeMaterials("drywall"), []);
  assert.deepEqual(sanitizeScopeMaterials({ name: "drywall" }), []);
});

test("sanitizeScopeMaterials drops non-object entries and empty names", () => {
  const materials = sanitizeScopeMaterials([
    null,
    "drywall",
    { name: "   ", searchQuery: "blank" },
    { name: "Joint compound", searchQuery: "joint compound", ...EMPTY_QUANTITY },
  ]);

  assert.deepEqual(
    materials.map(({ name }) => name),
    ["Joint compound"]
  );
});

test("sanitizeScopeMaterials removes duplicate names regardless of case", () => {
  const materials = sanitizeScopeMaterials([
    { name: "Copper pipe", searchQuery: "copper pipe", ...EMPTY_QUANTITY },
    { name: "  copper PIPE ", searchQuery: "copper pipe 1/2", ...EMPTY_QUANTITY },
  ]);

  assert.equal(materials.length, 1);
  assert.equal(materials[0].name, "Copper pipe");
});

test("sanitizeScopeMaterials keeps a valid quantity and upper-cases its unit", () => {
  const [material] = sanitizeScopeMaterials([
    {
      name: "Prehung interior door",
      searchQuery: "  prehung interior door 30 x 80 ",
      quantity: 6,
      unit: "ea",
      quantityBasis: "STATED",
      calculation: null,
      confidence: "High",
      planReference: " Door schedule, A-601 ",
    },
  ]);

  assert.deepEqual(material, {
    name: "Prehung interior door",
    searchQuery: "prehung interior door 30 x 80",
    quantity: 6,
    unit: "EA",
    quantityBasis: "stated",
    calculation: null,
    confidence: "high",
    planReference: "Door schedule, A-601",
  });
});

test("sanitizeScopeMaterials keeps a calculated quantity with its working", () => {
  const [material] = sanitizeScopeMaterials([
    {
      name: "2x4 wall stud",
      searchQuery: "2x4 stud 8 ft",
      quantity: 40,
      unit: "EA",
      quantityBasis: "calculated",
      calculation: '  42 LF / 16" O.C. = 33 + 7 corners/openings  ',
      confidence: "medium",
      planReference: "A-2 Floor Plan",
    },
  ]);

  assert.equal(material.quantity, 40);
  assert.equal(material.quantityBasis, "calculated");
  assert.equal(material.calculation, '42 LF / 16" O.C. = 33 + 7 corners/openings');
  assert.equal(material.confidence, "medium");
});

test("sanitizeScopeMaterials falls back to the most cautious basis and confidence", () => {
  const [material] = sanitizeScopeMaterials([
    {
      name: "Batt insulation",
      searchQuery: "r13 batt insulation",
      quantity: 320,
      unit: "SF",
      quantityBasis: "guessed",
      calculation: "   ",
      confidence: "certain",
      planReference: "A-4",
    },
  ]);

  assert.equal(material.quantity, 320);
  assert.equal(material.quantityBasis, "inferred");
  assert.equal(material.confidence, "low");
  assert.equal(material.calculation, null);
});

test("sanitizeScopeMaterials keeps a plan reference when there is no quantity", () => {
  const [material] = sanitizeScopeMaterials([
    {
      name: "Self-adhesive flashing",
      searchQuery: "self adhesive flashing tape",
      quantity: null,
      unit: null,
      quantityBasis: null,
      calculation: null,
      confidence: null,
      planReference: "A-7 Detail 3",
    },
  ]);

  assert.deepEqual(pickQuantity(material), EMPTY_QUANTITY);
  assert.equal(material.planReference, "A-7 Detail 3");
});

test("sanitizeScopeMaterials clears quantity fields but keeps the plan reference", () => {
  [0, -3, "6", Number.NaN, Infinity, undefined, null].forEach((quantity) => {
    const [material] = sanitizeScopeMaterials([
      {
        name: "Lever passage set",
        searchQuery: "lever passage set",
        quantity,
        unit: "EA",
        quantityBasis: "stated",
        calculation: null,
        confidence: "high",
        planReference: "Door schedule",
      },
    ]);

    assert.deepEqual(
      pickQuantity(material),
      EMPTY_QUANTITY,
      `quantity ${String(quantity)} should be cleared`
    );
    assert.equal(material.planReference, "Door schedule");
  });
});

test("sanitizeScopeMaterials nulls quantity when the unit is missing or not allowed", () => {
  ["cubits", "", null, undefined].forEach((unit) => {
    const [material] = sanitizeScopeMaterials([
      {
        name: "Door shims",
        searchQuery: "door shims",
        quantity: 12,
        unit,
        quantityBasis: "stated",
        calculation: null,
        confidence: "high",
        planReference: "Door schedule",
      },
    ]);

    assert.deepEqual(
      pickQuantity(material),
      EMPTY_QUANTITY,
      `unit ${String(unit)} should clear the quantity`
    );
  });
});

test("sanitizeScopeMaterials accepts every unit in the list", () => {
  MATERIAL_UNITS.forEach((unit) => {
    const [material] = sanitizeScopeMaterials([
      {
        name: `Material in ${unit}`,
        searchQuery: "material",
        quantity: 3,
        unit,
        quantityBasis: "stated",
        calculation: null,
        confidence: "high",
        planReference: "A-1",
      },
    ]);

    assert.equal(material.unit, unit, `${unit} should be accepted`);
    assert.equal(material.quantity, 3);
  });
});

test("sanitizeScopeMaterials nulls an empty plan reference but keeps the quantity", () => {
  const [material] = sanitizeScopeMaterials([
    {
      name: "Duplex receptacle",
      searchQuery: "duplex receptacle",
      quantity: 14,
      unit: "EA",
      quantityBasis: "stated",
      calculation: null,
      confidence: "high",
      planReference: "  ",
    },
  ]);

  assert.equal(material.quantity, 14);
  assert.equal(material.unit, "EA");
  assert.equal(material.planReference, null);
});

test("sanitizeScopeMaterials falls back to the name for an empty search phrase and caps its length", () => {
  const [fallback, capped] = sanitizeScopeMaterials([
    { name: "5/8 in. Type X gypsum board", searchQuery: "   ", ...EMPTY_QUANTITY },
    { name: "Long phrase material", searchQuery: "a".repeat(150), ...EMPTY_QUANTITY },
  ]);

  assert.equal(fallback.searchQuery, "5/8 in. Type X gypsum board");
  assert.equal(capped.searchQuery.length, 100);
});

test("parseScopePayload keeps a scope item whose materials are malformed", () => {
  const parsed = parseScopePayload(
    {
      plumbing: [
        {
          title: "Set fixtures",
          description: "Set and connect scheduled fixtures.",
          materials: "not an array",
          classification: "confirmed",
        },
      ],
    },
    ["plumbing"]
  );

  assert.equal(parsed.plumbing.length, 1);
  assert.deepEqual(parsed.plumbing[0].materials, []);
  assert.equal("materialCategories" in parsed.plumbing[0], false);
});

test("SCOPE_MATERIAL_RULES asks for calculations, confidence, and plan references", () => {
  assert.match(SCOPE_MATERIAL_RULES, /"calculation"/);
  assert.match(SCOPE_MATERIAL_RULES, /"planReference"/);
  assert.match(SCOPE_MATERIAL_RULES, /every material/);
  QUANTITY_BASES.forEach((basis) => assert.match(SCOPE_MATERIAL_RULES, new RegExp(basis)));
  CONFIDENCE_LEVELS.forEach((level) => assert.match(SCOPE_MATERIAL_RULES, new RegExp(level)));
  MATERIAL_UNITS.forEach((unit) => {
    assert.match(SCOPE_MATERIAL_RULES, new RegExp(`\\b${unit}\\b`));
  });
});

test("SCOPE_MATERIAL_RULES measures only against a graphic scale bar", () => {
  assert.match(SCOPE_MATERIAL_RULES, /MEASURED DIMENSIONS/);
  assert.match(SCOPE_MATERIAL_RULES, /graphic scale bar/);
  assert.match(SCOPE_MATERIAL_RULES, /[Nn]ever estimate a distance by eye/);
});

test("the scope prompts no longer ask for broad material categories", () => {
  const source = readFileSync(path.join(__dirname, "../routes/generateScopes.js"), "utf8");

  assert.doesNotMatch(source, /broad material categories/i);
  assert.doesNotMatch(source, /materialCategories/);
});

const { SCOPE_MATERIAL_AGGREGATION_RULES } = generateScopesHandler;

const duplicate = (overrides) => ({
  name: "Duplex receptacle",
  searchQuery: "duplex receptacle",
  quantity: 14,
  unit: "EA",
  quantityBasis: "stated",
  calculation: null,
  confidence: "high",
  planReference: "E-101",
  ...overrides,
});

test("sanitizeScopeMaterials keeps the quantity when duplicate entries agree", () => {
  const materials = sanitizeScopeMaterials([
    duplicate({}),
    duplicate({ name: " duplex receptacle ", searchQuery: "duplex receptacle 15 amp", unit: "ea" }),
  ]);

  assert.equal(materials.length, 1);
  assert.equal(materials[0].searchQuery, "duplex receptacle");
  assert.equal(materials[0].quantity, 14);
  assert.equal(materials[0].planReference, "E-101");
  assert.equal(materials[0].confidence, "high");
});

test("sanitizeScopeMaterials takes a duplicate's quantity when the first entry has none", () => {
  const materials = sanitizeScopeMaterials([
    duplicate({ quantity: null, unit: null, quantityBasis: null, confidence: null }),
    duplicate({ searchQuery: "duplex receptacle 15 amp" }),
  ]);

  assert.equal(materials.length, 1);
  assert.equal(materials[0].searchQuery, "duplex receptacle");
  assert.equal(materials[0].quantity, 14);
  assert.equal(materials[0].quantityBasis, "stated");
  assert.equal(materials[0].planReference, "E-101");
});

test("sanitizeScopeMaterials keeps the best-supported count when duplicates disagree", () => {
  const materials = sanitizeScopeMaterials([
    duplicate({ quantity: 10, quantityBasis: "inferred", confidence: "low", planReference: "E-102" }),
    duplicate({ quantity: 14, quantityBasis: "stated", confidence: "high" }),
  ]);

  assert.equal(materials.length, 1);
  assert.equal(materials[0].quantity, 14);
  assert.equal(materials[0].quantityBasis, "stated");
  assert.equal(materials[0].planReference, "E-101; E-102");
  assert.equal(materials[0].confidence, "low");
});

test("sanitizeScopeMaterials keeps the first count when duplicates disagree at the same basis", () => {
  const materials = sanitizeScopeMaterials([
    duplicate({ quantity: 14 }),
    duplicate({ quantity: 10, planReference: "E-102" }),
  ]);

  assert.equal(materials.length, 1);
  assert.equal(materials[0].quantity, 14);
  assert.equal(materials[0].planReference, "E-101; E-102");
  assert.equal(materials[0].confidence, "low");
});

test("the aggregation rules add separate sheets and stop blanking ambiguous counts", () => {
  assert.match(SCOPE_MATERIAL_AGGREGATION_RULES, /same source/);
  assert.match(
    SCOPE_MATERIAL_AGGREGATION_RULES,
    /different sheets or areas that do not overlap, add them together/
  );
  assert.match(SCOPE_MATERIAL_AGGREGATION_RULES, /best-supported/);
  assert.doesNotMatch(SCOPE_MATERIAL_AGGREGATION_RULES, /set "quantity", "unit", and "quantitySource" to null/);
});

const { buildTakeoffEvidence } = generateScopesHandler;

const hybridPage = ({ page, sheet, title, counted, dimensions }) => ({
  sourcePageNumber: page,
  detectedSheetNumber: "LUS26",
  rawText: [
    "HYBRID PLAN ANALYSIS: plans.pdf",
    "LOCAL TEXT EXTRACTION:\nLUS26 HANGER",
    "VISUAL ANALYSIS:\nVISUAL DOCUMENT ANALYSIS: plans.pdf",
    sheet ? `VISIBLE SHEET NUMBER: ${sheet}` : "",
    title ? `VISIBLE TITLE: ${title}` : "",
    counted ? `COUNTED ITEMS:\n${counted}` : "",
    dimensions ? `STATED DIMENSIONS:\n${dimensions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n"),
});

test("buildTakeoffEvidence collects counts and dimensions from every sheet", () => {
  const evidence = buildTakeoffEvidence([
    hybridPage({
      page: 3,
      sheet: "A-201",
      title: "Floor Plan",
      counted: "- Tagged doors: 2 (D1 and D2)",
      dimensions: "- 1st floor horizontal dimensions: 27'-3 1/2\"\n- Ceiling heights: C.H. 8'-0\"",
    }),
    hybridPage({
      page: 10,
      sheet: "S-106",
      title: "Addition Details",
      dimensions: "- 2X6 STUD @ 16 O.C.",
    }),
  ]);

  assert.match(evidence, /TAKEOFF EVIDENCE FROM EVERY SHEET/);
  assert.match(evidence, /PAGE 3 \| SHEET A-201 \| Floor Plan/);
  assert.match(evidence, /Tagged doors: 2/);
  assert.match(evidence, /C\.H\. 8'-0"/);
  assert.match(evidence, /PAGE 10 \| SHEET S-106 \| Addition Details/);
  assert.match(evidence, /2X6 STUD @ 16 O\.C\./);
  assert.doesNotMatch(evidence, /LUS26/);
});

test("buildTakeoffEvidence skips pages with no counts or dimensions", () => {
  assert.equal(buildTakeoffEvidence([hybridPage({ page: 1, sheet: "T-1" })]), "");
  assert.equal(buildTakeoffEvidence([]), "");
});

test("buildTakeoffEvidence falls back to the detected sheet when vision read none", () => {
  const evidence = buildTakeoffEvidence([hybridPage({ page: 5, counted: "- Toilets: 3" })]);

  assert.match(evidence, /PAGE 5 \| SHEET LUS26/);
});

test("sanitizeScopeMaterials keeps a note on what is missing when there is no quantity", () => {
  const [material] = sanitizeScopeMaterials([
    {
      name: "EMT conduit",
      searchQuery: "3/4 in emt conduit",
      quantity: null,
      unit: null,
      quantityBasis: null,
      calculation: "  No conduit routing or run lengths shown  ",
      confidence: null,
      planReference: "E-101",
    },
  ]);

  assert.equal(material.quantity, null);
  assert.equal(material.quantityBasis, null);
  assert.equal(material.calculation, "No conduit routing or run lengths shown");
});

test("SCOPE_MATERIAL_RULES requires a quantity on every material", () => {
  assert.match(SCOPE_MATERIAL_RULES, /Every material must have a "quantity"/);
  assert.match(SCOPE_MATERIAL_RULES, /TAKEOFF EVIDENCE FROM EVERY SHEET/);
  assert.match(SCOPE_MATERIAL_RULES, /standard estimating allowance/);
  assert.match(SCOPE_MATERIAL_RULES, /Adding up printed dimensions is calculation/);
  assert.match(SCOPE_MATERIAL_RULES, /not a fabricated quantity/);
  assert.doesNotMatch(SCOPE_MATERIAL_RULES, /Leave "quantity" null/);
});

test("the aggregation rules leave no material without a quantity", () => {
  assert.match(SCOPE_MATERIAL_AGGREGATION_RULES, /TAKEOFF EVIDENCE FROM EVERY SHEET/);
  assert.match(SCOPE_MATERIAL_AGGREGATION_RULES, /every material in the final output has a quantity/);
  assert.match(SCOPE_MATERIAL_AGGREGATION_RULES, /standard estimating allowance/);
});

test("sanitizeScopeMaterials cites every distinct sheet behind a merged material", () => {
  const materials = sanitizeScopeMaterials([
    duplicate({ quantity: null, unit: null, quantityBasis: null, confidence: null, planReference: "S-104" }),
    duplicate({ quantity: null, unit: null, quantityBasis: null, confidence: null, planReference: "s-104" }),
    duplicate({ quantity: null, unit: null, quantityBasis: null, confidence: null, planReference: "S-106, Details 2 and 4" }),
  ]);

  assert.equal(materials.length, 1);
  assert.equal(materials[0].planReference, "S-104; S-106, Details 2 and 4");
});

test("sanitizeScopeMaterials lists the sheet a duplicate's quantity came from first", () => {
  const materials = sanitizeScopeMaterials([
    duplicate({ quantity: null, unit: null, quantityBasis: null, confidence: null, planReference: "A-201" }),
    duplicate({ planReference: "E-101" }),
  ]);

  assert.equal(materials[0].quantity, 14);
  assert.equal(materials[0].planReference, "E-101; A-201");
});

test("QUANTITY_BASES ranks measured between calculated and inferred", () => {
  assert.deepEqual(QUANTITY_BASES, ["stated", "calculated", "measured", "inferred"]);
});

test("buildTakeoffEvidence includes scale-bar measurements", () => {
  const evidence = buildTakeoffEvidence([
    {
      sourcePageNumber: 3,
      detectedSheetNumber: "A-201",
      rawText:
        "VISUAL ANALYSIS:\nVISIBLE SHEET NUMBER: A-201\n\nMEASURED DIMENSIONS:\n- Exterior wall (2nd Floor Plan): 96.4 LF, measured against the 8 FT scale bar",
    },
  ]);

  assert.match(evidence, /PAGE 3 \| SHEET A-201/);
  assert.match(evidence, /MEASURED DIMENSIONS:\n- Exterior wall \(2nd Floor Plan\): 96\.4 LF/);
});

test("SCOPE_MATERIAL_RULES asks for stock sizes, piece counts, and the reasoning", () => {
  assert.match(SCOPE_MATERIAL_RULES, /one entry per stock size/);
  assert.match(SCOPE_MATERIAL_RULES, /2x12x16/);
  assert.match(SCOPE_MATERIAL_RULES, /unit the material is sold in/);
  assert.match(SCOPE_MATERIAL_RULES, /show the chain from the plan numbers to the final count/);
});

test("SCOPE_MATERIAL_RULES keeps the running total alongside the stock sizes", () => {
  assert.match(SCOPE_MATERIAL_RULES, /plus one total entry for the whole material/);
  assert.match(SCOPE_MATERIAL_RULES, /460 LF/);
  assert.match(SCOPE_MATERIAL_RULES, /\(total run\)/);
  assert.match(SCOPE_MATERIAL_RULES, /so nobody orders the material twice/);
});

test("the aggregation rules keep stock sizes apart", () => {
  assert.match(SCOPE_MATERIAL_AGGREGATION_RULES, /separate stock sizes/);
});

test("SCOPE_MATERIAL_RULES forbids dropping materials that are hard to quantify", () => {
  assert.match(SCOPE_MATERIAL_RULES, /Never leave a scope item without materials/);
  assert.match(SCOPE_MATERIAL_RULES, /never drop a material because it is hard to quantify/);
  assert.match(SCOPE_MATERIAL_RULES, /Gypsum board and insulation come from wall and ceiling areas/);
  assert.match(SCOPE_MATERIAL_AGGREGATION_RULES, /Never drop a material a chunk reported/);
});

test("the scope prompts forbid repeating a task across trades", () => {
  const source = readFileSync(path.join(__dirname, "../routes/generateScopes.js"), "utf8");
  const rules = [...source.matchAll(/Never repeat the same task under more than one trade\./g)];

  // Once in the chunk prompt, once in the aggregation guidance.
  assert.equal(rules.length, 2);
  assert.match(source, /any other trade involved covers only its own separate work/);
  assert.match(source, /For example, if Demo covers removing a wall/);
  assert.match(source, /trade most responsible for doing that work/);
  assert.match(source, /keep the one under the most responsible trade, fold any extra detail into it, and drop the other/);
});

/* ------------------------------------------------------------------
   Single-pass takeoff: a plan set that fits in one context chunk is
   scoped in one call, with no aggregation pass to reconcile.
   ------------------------------------------------------------------ */

test("a 12-page plan set fits in a single scope chunk", () => {
  // Mirrors the measured test file: 12 pages, ~65k chars of extracted text,
  // plus per-page visual analysis, which is the bulk of the context.
  const files = Array.from({ length: 12 }, (_, index) => ({
    id: `page-${index + 1}`,
    fileName: `Plan.pdf (Page ${index + 1})`,
    sourcePageNumber: index + 1,
    detectedSheetNumber: `A${index + 1}`,
    rawText: `Sheet A${index + 1} framing and finish notes. `.repeat(400),
  }));

  const chunks = createPlanContextChunks(files, MAX_PROJECT_CONTEXT_LENGTH);

  assert.equal(chunks.length, 1, "a normal plan set should no longer be split");
});

test("an oversized plan set still splits, keeping the aggregation path alive", () => {
  const files = Array.from({ length: 12 }, (_, index) => ({
    id: `page-${index + 1}`,
    fileName: `Plan.pdf (Page ${index + 1})`,
    sourcePageNumber: index + 1,
    detectedSheetNumber: `A${index + 1}`,
    rawText: `Sheet A${index + 1} notes. `.repeat(6000),
  }));

  const chunks = createPlanContextChunks(files, MAX_PROJECT_CONTEXT_LENGTH);

  assert.ok(chunks.length > 1, "a set past the limit must still chunk");
});

test("the single-chunk pass carries the cross-sheet material aggregation rules", () => {
  const source = readFileSync(path.join(__dirname, "..", "routes", "generateScopes.js"), "utf8");

  // With one chunk there is no aggregation call, so the chunk prompt itself has
  // to do the cross-sheet combining and the final every-material-has-a-quantity
  // sweep that SCOPE_MATERIAL_AGGREGATION_RULES asks for.
  assert.match(source, /isSingleChunk \? SCOPE_MATERIAL_AGGREGATION_RULES : ""/);
  assert.match(source, /if \(isSingleChunk\)/);
});
