const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const analyzePlanFilesHandler = require("../routes/analyzePlanFiles");
const {
  VISUAL_PAGE_CONCURRENCY,
  buildVisualPageRawText,
  computeMeasuredDimensions,
  getVisualAnalysisResponseFormat,
  getVisualTextGuidance,
} = analyzePlanFilesHandler;
const { buildEstimatorSystemPrompt } = require("../routes/lib/estimatorPrompt");
const { SCOPE_MATERIAL_RULES } = require("../routes/generateScopes");

const ANALYZE_SOURCE_PATH = path.join(__dirname, "../routes/analyzePlanFiles.js");

test("analyzePlanFiles still exports a callable handler", () => {
  assert.equal(typeof analyzePlanFilesHandler, "function");
});

test("every page is rendered and read, so the sampling path is gone", () => {
  const source = readFileSync(ANALYZE_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /selectPdfVisualSamplePages/);
  assert.doesNotMatch(source, /createSampledPdfBuffer/);
  assert.doesNotMatch(source, /PDF_SAMPLED_VISUAL_MAX_PAGES/);
  assert.doesNotMatch(source, /PDF_FULL_HYBRID_MAX_STRONG_TEXT_PAGES/);
  assert.doesNotMatch(source, /choosePdfAnalysisMode/);
});

test("page vision runs 12 at a time", () => {
  // Each page renders up to 18 megapixels and is held again as PNG and base64,
  // so roughly 100-150MB is in flight per page. 12 fits the 4GiB that
  // runPlanPipelineStep requests in index.js; raising either of these two
  // numbers without the other risks an OOM, which kills the step without
  // marking the project failed.
  assert.equal(VISUAL_PAGE_CONCURRENCY, 12);
});

test("weak extraction asks vision to transcribe, strong extraction asks it to fill gaps", () => {
  const weak = getVisualTextGuidance({ isWeak: true });
  const strong = getVisualTextGuidance({ isWeak: false });

  assert.match(weak, /primary source/);
  assert.match(strong, /printed dimensions/);
  assert.notEqual(weak, strong);
});

test("the page schema asks for counted items and printed dimensions", () => {
  const format = getVisualAnalysisResponseFormat();
  const pageSchema = format.json_schema.schema.properties.pages.items;
  const countedItemSchema = pageSchema.properties.countedItems.items;

  assert.equal(format.json_schema.strict, true);
  assert.equal(pageSchema.additionalProperties, false);
  assert.ok(pageSchema.required.includes("countedItems"));
  assert.ok(pageSchema.required.includes("statedDimensions"));
  assert.deepEqual(pageSchema.properties.statedDimensions, {
    type: "array",
    items: { type: "string" },
  });
  assert.equal(countedItemSchema.additionalProperties, false);
  assert.deepEqual(countedItemSchema.required, ["item", "count", "note"]);
  assert.equal(countedItemSchema.properties.count.type, "integer");
});

test("the vision prompt asks for counts, printed dimensions, and scale-bar tracing", () => {
  const format = getVisualAnalysisResponseFormat();

  assert.ok(format);
  const source = readFileSync(ANALYZE_SOURCE_PATH, "utf8");

  assert.match(source, /countedItems/);
  assert.match(source, /statedDimensions/);
  assert.match(source, /scaleBars/);
  assert.match(source, /Do not convert to feet yourself/);
  assert.match(source, /detail: "original"/);
});

test("page text carries counted items and dimensions into the analysis context", () => {
  const rawText = buildVisualPageRawText(
    {
      pageNumber: 4,
      sheetNumber: "E-101",
      title: "Power Plan",
      discipline: "E",
      visibleText: "PANEL A",
      visualSummary: "Branch circuits shown at the kitchen island.",
      notableWorkItems: ["New 200A service"],
      countedItems: [
        { item: "Duplex receptacle", count: 14, note: "Counted from device symbols" },
      ],
      statedDimensions: ["8'-0\" ceiling height"],
    },
    "plans.pdf",
    "pdf_visual_analysis"
  );

  assert.match(rawText, /COUNTED ITEMS/);
  assert.match(rawText, /Duplex receptacle/);
  assert.match(rawText, /14/);
  assert.match(rawText, /STATED DIMENSIONS/);
  assert.match(rawText, /8'-0" ceiling height/);
});

test("page text omits the takeoff sections when the page reports none", () => {
  const rawText = buildVisualPageRawText(
    {
      pageNumber: 1,
      sheetNumber: "A-1",
      title: "Cover",
      discipline: "A",
      visibleText: "COVER SHEET",
      visualSummary: "",
      notableWorkItems: [],
      countedItems: [],
      statedDimensions: [],
    },
    "plans.pdf",
    "pdf_visual_analysis"
  );

  assert.doesNotMatch(rawText, /COUNTED ITEMS/);
  assert.doesNotMatch(rawText, /STATED DIMENSIONS/);
});

test("the shared estimator prompt treats visual analysis as evidence but never estimates distances by eye", () => {
  const prompt = buildEstimatorSystemPrompt("Do the thing.");

  assert.match(prompt, /COUNTED ITEMS/);
  assert.match(prompt, /STATED DIMENSIONS/);
  assert.match(prompt, /MEASURED DIMENSIONS/);
  assert.match(prompt, /never estimate a distance by eye/i);
  assert.doesNotMatch(prompt, /Do not perform visual drawing interpretation/);
});

test("material rules fall back to the visual analysis when the text states no quantity", () => {
  assert.match(SCOPE_MATERIAL_RULES, /visual analysis/);
  assert.match(SCOPE_MATERIAL_RULES, /counted items/);
  assert.match(SCOPE_MATERIAL_RULES, /[Nn]ever estimate a distance by eye/);
});

test("the shared estimator prompt does not treat shown calculations as fabrication", () => {
  const prompt = buildEstimatorSystemPrompt("Do the thing.");

  assert.match(prompt, /is not fabricated/);
});

test("the vision prompt counts dense symbols and totals dimension strings", () => {
  const source = readFileSync(ANALYZE_SOURCE_PATH, "utf8");

  assert.match(source, /give your best count and say so in the note/);
  assert.match(source, /also report their printed total/);
  assert.doesNotMatch(source, /Leave out anything you cannot count reliably/);
});

const scaleBar = { view: "2nd Floor Plan", lengthFeet: 8, startX: 100, startY: 100, endX: 300, endY: 100 };

test("the page schema asks for scale bars and traced measurements", () => {
  const pageSchema = getVisualAnalysisResponseFormat().json_schema.schema.properties.pages.items;
  const barSchema = pageSchema.properties.scaleBars.items;
  const measurementSchema = pageSchema.properties.measurements.items;

  assert.ok(pageSchema.required.includes("scaleBars"));
  assert.ok(pageSchema.required.includes("measurements"));
  assert.deepEqual(barSchema.required, ["view", "lengthFeet", "startX", "startY", "endX", "endY"]);
  assert.deepEqual(measurementSchema.required, ["item", "view", "kind", "points", "note"]);
  assert.deepEqual(measurementSchema.properties.kind, { type: "string", enum: ["length", "area"] });
  assert.equal(measurementSchema.additionalProperties, false);
});

test("computeMeasuredDimensions converts traced runs and areas with the view's scale bar", () => {
  const lines = computeMeasuredDimensions({
    scaleBars: [scaleBar],
    measurements: [
      {
        item: "Exterior wall",
        view: "2nd Floor Plan",
        kind: "length",
        points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }],
        note: "traced along the exterior face",
      },
      {
        item: "Deck",
        view: "2nd floor plan",
        kind: "area",
        points: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 250 }, { x: 0, y: 250 }],
        note: "",
      },
    ],
  });

  assert.deepEqual(lines, [
    "Exterior wall (2nd Floor Plan): 60 LF, measured against the 8 FT scale bar; traced along the exterior face",
    "Deck (2nd floor plan): 200 SF, measured against the 8 FT scale bar",
  ]);
});

test("computeMeasuredDimensions uses a page's only scale bar but skips unmatched views when there are several", () => {
  const ledger = {
    item: "Ledger",
    view: "Section A",
    kind: "length",
    points: [{ x: 0, y: 0 }, { x: 250, y: 0 }],
    note: "",
  };

  assert.deepEqual(computeMeasuredDimensions({ scaleBars: [scaleBar], measurements: [ledger] }), [
    "Ledger (Section A): 10 LF, measured against the 8 FT scale bar",
  ]);
  assert.deepEqual(
    computeMeasuredDimensions({
      scaleBars: [scaleBar, { ...scaleBar, view: "Roof Plan" }],
      measurements: [ledger],
    }),
    []
  );
});

test("computeMeasuredDimensions ignores traces without a usable scale bar or enough points", () => {
  const wall = {
    item: "Wall",
    view: "2nd Floor Plan",
    kind: "length",
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    note: "",
  };

  assert.deepEqual(computeMeasuredDimensions({ scaleBars: [], measurements: [wall] }), []);
  assert.deepEqual(computeMeasuredDimensions({ scaleBars: [{ ...scaleBar, endX: 110 }], measurements: [wall] }), []);
  assert.deepEqual(computeMeasuredDimensions({ scaleBars: [{ ...scaleBar, lengthFeet: 0 }], measurements: [wall] }), []);
  assert.deepEqual(
    computeMeasuredDimensions({ scaleBars: [scaleBar], measurements: [{ ...wall, points: [{ x: 0, y: 0 }] }] }),
    []
  );
  assert.deepEqual(
    computeMeasuredDimensions({ scaleBars: [scaleBar], measurements: [{ ...wall, kind: "area" }] }),
    []
  );
});

test("page text carries scale-bar measurements into the analysis context", () => {
  const rawText = buildVisualPageRawText(
    {
      pageNumber: 3,
      sheetNumber: "A-201",
      title: "Proposed 2nd Floor",
      discipline: "A",
      visibleText: "",
      visualSummary: "",
      notableWorkItems: [],
      countedItems: [],
      statedDimensions: [],
      scaleBars: [scaleBar],
      measurements: [
        {
          item: "Exterior wall",
          view: "2nd Floor Plan",
          kind: "length",
          points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
          note: "",
        },
      ],
    },
    "plans.pdf",
    "pdf_visual_analysis"
  );

  assert.match(
    rawText,
    /MEASURED DIMENSIONS:\n- Exterior wall \(2nd Floor Plan\): 40 LF, measured against the 8 FT scale bar/
  );
});
