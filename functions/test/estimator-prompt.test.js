const test = require("node:test");
const assert = require("node:assert/strict");

const { buildEstimatorSystemPrompt } = require("../routes/lib/estimatorPrompt");

test("prompt is byte-for-byte unchanged when no notes are provided", () => {
  const base = buildEstimatorSystemPrompt("DO THE TASK");

  assert.equal(buildEstimatorSystemPrompt("DO THE TASK", {}), base);
  assert.equal(buildEstimatorSystemPrompt("DO THE TASK", { userNotes: "" }), base);
  assert.equal(buildEstimatorSystemPrompt("DO THE TASK", { userNotes: "   \n  " }), base);
  assert.equal(buildEstimatorSystemPrompt("DO THE TASK", { userNotes: null }), base);
  assert.equal(buildEstimatorSystemPrompt("DO THE TASK", { userNotes: undefined }), base);
});

test("prompt includes a labeled notes block when notes are provided", () => {
  const prompt = buildEstimatorSystemPrompt("DO THE TASK", {
    userNotes: "Roof is actually standing-seam metal, not the shingles shown.",
  });

  assert.ok(prompt.includes("CONTRACTOR-PROVIDED CONTEXT NOTES:"));
  assert.ok(prompt.includes("Roof is actually standing-seam metal, not the shingles shown."));

  // Notes block sits before the Task section so task instructions remain last.
  assert.ok(prompt.indexOf("CONTRACTOR-PROVIDED CONTEXT NOTES:") < prompt.indexOf("Task:"));
});

test("notes are trimmed and non-string values coerce safely", () => {
  const trimmed = buildEstimatorSystemPrompt("T", { userNotes: "  field note  " });
  assert.ok(trimmed.includes("field note"));

  const numeric = buildEstimatorSystemPrompt("T", { userNotes: 12345 });
  assert.ok(numeric.includes("12345"));

  // A whitespace-only string still produces the unchanged base prompt.
  assert.equal(
    buildEstimatorSystemPrompt("T", { userNotes: "\t \n" }),
    buildEstimatorSystemPrompt("T")
  );
});
