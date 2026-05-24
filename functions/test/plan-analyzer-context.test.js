const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { PDFDocument } = require("pdf-lib");

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
    model: "gpt-5-mini",
    reasoningEffort: "medium",
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
  assert.deepEqual(createPayload.reasoning, { effort: "medium" });
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

  assert.match(rawText, /HYBRID PDF ANALYSIS: plans\.pdf/);
  assert.match(rawText, /LOCAL PDF TEXT EXTRACTION:\nSelectable title block text/);
  assert.match(rawText, /VISUAL PDF ANALYSIS:\nVisual summary of floor plan layout/);
});

test("large text-rich PDFs use sampled hybrid mode", () => {
  const analyzePlanFilesHandler = require("../routes/analyzePlanFiles");
  const extracted = {
    pageCount: 75,
    rawText: "A".repeat(6000 * 75),
    pages: Array.from({ length: 75 }, (_, index) => ({
      pageNumber: index + 1,
      rawText: "A".repeat(6000),
    })),
  };

  const mode = analyzePlanFilesHandler.__test__.choosePdfAnalysisMode(extracted);

  assert.equal(mode.method, "pdf_hybrid_sampled");
  assert.ok(mode.selectedPageNumbers.length <= 15);
  assert.ok(mode.selectedPageNumbers.includes(1));
  assert.ok(mode.selectedPageNumbers.includes(75));
  assert.equal(mode.selectedPageNumbers.includes(2), false);
});

test("large weak-text PDFs use full hybrid mode", () => {
  const analyzePlanFilesHandler = require("../routes/analyzePlanFiles");
  const extracted = {
    pageCount: 75,
    rawText: "",
    pages: Array.from({ length: 75 }, (_, index) => ({
      pageNumber: index + 1,
      rawText: "",
    })),
  };

  const mode = analyzePlanFilesHandler.__test__.choosePdfAnalysisMode(extracted);

  assert.equal(mode.method, "pdf_hybrid_full");
  assert.equal(mode.selectedPageNumbers, null);
});

test("createSampledPdfBuffer copies only selected PDF pages", async () => {
  const analyzePlanFilesHandler = require("../routes/analyzePlanFiles");
  const sourcePdf = await PDFDocument.create();
  Array.from({ length: 5 }).forEach(() => sourcePdf.addPage());
  const sampledBuffer = await analyzePlanFilesHandler.__test__.createSampledPdfBuffer(
    Buffer.from(await sourcePdf.save()),
    [1, 3, 5]
  );
  const sampledPdf = await PDFDocument.load(sampledBuffer);

  assert.equal(sampledPdf.getPageCount(), 3);
});

test("sampled visual pages are remapped to original PDF page numbers", () => {
  const analyzePlanFilesHandler = require("../routes/analyzePlanFiles");
  const pages = analyzePlanFilesHandler.__test__.remapSampledVisualPages(
    [
      { pageNumber: 1, visualSummary: "First sampled page" },
      { pageNumber: 2, visualSummary: "Second sampled page" },
    ],
    [4, 20]
  );

  assert.equal(pages[0].pageNumber, 4);
  assert.equal(pages[1].pageNumber, 20);
});

test("PDF vision analysis errors include vision failure context", () => {
  const analyzePlanFilesHandler = require("../routes/analyzePlanFiles");
  const error = analyzePlanFilesHandler.__test__.createVisionAnalysisError(
    "plans.pdf",
    new Error("Invalid PDF input")
  );

  assert.equal(error.message, "Vision analysis failed for plans.pdf: Invalid PDF input");
});
