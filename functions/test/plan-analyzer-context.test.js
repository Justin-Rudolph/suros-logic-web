const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");

const {
  buildScopeContext,
  createPlanContextChunks,
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
