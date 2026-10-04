const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");

const {
  buildScopeContext,
  createResponsesJsonCompletion,
  createPlanContextChunks,
  formatUsageMetrics,
  mapWithConcurrency,
  sortPlanFiles,
} = require("../routes/lib/planAnalyzerContext");

test("sortPlanFiles prefers source page number order", () => {
  const sorted = sortPlanFiles([
    { fileName: "Plan.pdf (Page 3)", sourcePageNumber: 3, detectedSheetNumber: "A3" },
    { fileName: "Plan.pdf (Page 1)", sourcePageNumber: 1, detectedSheetNumber: "A1" },
    { fileName: "Plan.pdf (Page 2)", sourcePageNumber: 2, detectedSheetNumber: "A2" },
  ]);

  assert.deepEqual(
    sorted.map((file) => file.sourcePageNumber),
    [1, 2, 3]
  );
});

test("createPlanContextChunks preserves later pages instead of truncating the document", () => {
  const files = Array.from({ length: 6 }, (_, index) => ({
    id: `page-${index + 1}`,
    fileName: `Plan.pdf (Page ${index + 1})`,
    sourcePageNumber: index + 1,
    detectedSheetNumber: `A${index + 1}`,
    rawText: `Page ${index + 1} text `.repeat(500),
  }));

  const chunks = createPlanContextChunks(files, 5000);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.some((chunk) => chunk.text.includes("PAGE: 1")));
  assert.ok(chunks.some((chunk) => chunk.text.includes("PAGE: 6")));
});

test("createPlanContextChunks splits oversized single pages into multiple prompt sections", () => {
  const chunks = createPlanContextChunks(
    [
      {
        id: "page-1",
        fileName: "Plan.pdf (Page 1)",
        sourcePageNumber: 1,
        detectedSheetNumber: "A1",
        rawText: "Large page section ".repeat(4000),
      },
    ],
    6000
  );

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.includes("PAGE: 1")));
});

test("buildScopeContext trims scope text to the requested maximum", () => {
  const context = buildScopeContext(
    {
      demo: [
        {
          title: "Remove existing finishes",
          description: "Demo all finishes in the affected rooms.".repeat(50),
          classification: "confirmed",
        },
      ],
    },
    200
  );

  assert.ok(context.length <= 200);
  assert.ok(context.startsWith("TRADE: demo"));
});

test("mapWithConcurrency preserves input order while honoring the concurrency limit", async () => {
  let running = 0;
  let maxRunning = 0;

  const results = await mapWithConcurrency(
    [30, 5, 20, 10],
    async (waitMs, index) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await delay(waitMs);
      running -= 1;
      return `chunk-${index}`;
    },
    { concurrency: 2 }
  );

  assert.deepEqual(results, ["chunk-0", "chunk-1", "chunk-2", "chunk-3"]);
  assert.equal(maxRunning, 2);
});

test("createResponsesJsonCompletion maps structured output and responses token usage", async () => {
  let createPayload;
  const openai = {
    responses: {
      create: async (payload) => {
        createPayload = payload;
        return {
          output_text: JSON.stringify({ value: "visual fallback" }),
          usage: {
            input_tokens: 12,
            output_tokens: 4,
            total_tokens: 16,
          },
        };
      },
    },
  };

  const result = await createResponsesJsonCompletion({
    openai,
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    systemPrompt: "Return JSON.",
    userContent: [
      {
        type: "input_text",
        text: "Summarize this.",
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            value: { type: "string" },
          },
          required: ["value"],
        },
      },
    },
  });

  assert.deepEqual(result.parsed, { value: "visual fallback" });
  assert.equal(createPayload.text.format.name, "test_schema");
  assert.deepEqual(createPayload.reasoning, { effort: "low" });
  assert.equal(formatUsageMetrics(result.usage), "input 12 | output 4 | total 16");
});

test("PDF visual fallback file data uses the Responses data URL format", () => {
  const analyzePlanFilesHandler = require("../routes/analyzePlanFiles");
  const dataUrl = analyzePlanFilesHandler.__test__.buildBase64FileDataUrl(
    Buffer.from("%PDF-1.7"),
    "application/pdf"
  );

  assert.equal(dataUrl, "data:application/pdf;base64,JVBERi0xLjc=");
});

test("hybrid PDF page text preserves extracted text and visual analysis", () => {
  const analyzePlanFilesHandler = require("../routes/analyzePlanFiles");
  const rawText = analyzePlanFilesHandler.__test__.buildHybridPageRawText({
    fileName: "plans.pdf",
    extractedText: "Selectable title block text",
    visualText: "Visual summary of floor plan layout",
  });

  assert.match(rawText, /HYBRID PLAN ANALYSIS: plans\.pdf/);
  assert.match(rawText, /LOCAL TEXT EXTRACTION:\nSelectable title block text/);
  assert.match(rawText, /VISUAL ANALYSIS:\nVisual summary of floor plan layout/);
  // Images use this too, so the headers must not claim a PDF source.
  assert.doesNotMatch(rawText, /PDF (TEXT|ANALYSIS)/);
});

test("PDF vision analysis errors include vision failure context", () => {
  const analyzePlanFilesHandler = require("../routes/analyzePlanFiles");
  const error = analyzePlanFilesHandler.__test__.createVisionAnalysisError(
    "plans.pdf",
    new Error("Invalid PDF input")
  );

  assert.equal(error.message, "Vision analysis failed for plans.pdf: Invalid PDF input");
});

const { readPageTextField, readPageTextSection } = require("../routes/lib/planAnalyzerContext");

const detailSheetText = [
  "HYBRID PLAN ANALYSIS: plans.pdf",
  "LOCAL TEXT EXTRACTION:\nLUS26 HANGER\nNOTE:NOTE:",
  "VISUAL ANALYSIS:\nVISUAL DOCUMENT ANALYSIS: plans.pdf",
  "VISIBLE SHEET NUMBER: S-106",
  "VISIBLE TITLE: ADDITION DETAILS",
  "COUNTED ITEMS:\n- Detail views: 3 (Details 1, 2, and 4)",
  "STATED DIMENSIONS:\n- 2X6 STUD @ 16 O.C.\n- 2X8 STUDS @ 16 O.C.",
].join("\n\n");

test("readPageTextField reads a labeled line from page text", () => {
  assert.equal(readPageTextField(detailSheetText, "VISIBLE SHEET NUMBER"), "S-106");
  assert.equal(readPageTextField(detailSheetText, "VISIBLE TITLE"), "ADDITION DETAILS");
  assert.equal(readPageTextField(detailSheetText, "VISIBLE DISCIPLINE"), "");
});

test("readPageTextSection reads a section up to the next header", () => {
  assert.equal(
    readPageTextSection(detailSheetText, "COUNTED ITEMS"),
    "- Detail views: 3 (Details 1, 2, and 4)"
  );
  assert.equal(
    readPageTextSection(detailSheetText, "STATED DIMENSIONS"),
    "- 2X6 STUD @ 16 O.C.\n- 2X8 STUDS @ 16 O.C."
  );
  assert.equal(readPageTextSection(detailSheetText, "NOTABLE WORK ITEMS"), "");
});

test("page entries take the sheet number and title the vision pass read", () => {
  const { createPageEntry } = require("../routes/analyzePlanFiles").__test__;
  const entry = createPageEntry({
    fileName: "plans.pdf",
    fileUrl: "",
    fileKind: "pdf",
    analysisMethod: "pdf_hybrid_pages",
    rawText: detailSheetText,
    sourcePageNumber: 10,
    sourcePageCount: 12,
  });

  assert.equal(entry.detectedSheetNumber, "S-106");
  assert.equal(entry.detectedTitle, "ADDITION DETAILS");
  assert.equal(entry.discipline, "S");
});

test("page entries never take generated section headers as the title", () => {
  const { createPageEntry } = require("../routes/analyzePlanFiles").__test__;
  const entry = createPageEntry({
    fileName: "plans.pdf",
    fileUrl: "",
    fileKind: "pdf",
    analysisMethod: "pdf_hybrid_pages",
    rawText: "HYBRID PLAN ANALYSIS: plans.pdf\n\nLOCAL TEXT EXTRACTION:\nFOUNDATION PLAN\nS-101",
    sourcePageNumber: 1,
    sourcePageCount: 1,
  });

  assert.equal(entry.detectedSheetNumber, "S-101");
  assert.equal(entry.detectedTitle, "FOUNDATION PLAN");
});
